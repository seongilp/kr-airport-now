/**
 * 공항 하나의 운항 보드(도착·출발)를 만든다. **서버 전용.**
 *
 * 소스가 둘이다(공항별 데이터 비대칭 — lib/airports.ts):
 *  - KAC(B551178): 인천 뺀 전국. 일 5,000콜.
 *  - IIAC(B551177): 인천 전용(KAC 에 인천이 없어서). **일 500콜 — KAC 의 1/10.**
 *
 * 캐시/쿼터 판단 (사용자 명시: "기본은 캐싱이다")
 *  - **KAC TTL 300초(5분).** 운항은 주차(120초)보다 덜 급하다. 한도가 넉넉해 5분이면 충분.
 *  - **IIAC(인천) TTL 900초(15분) — 일부러 더 길다.** 쿼터가 10배 빡빡해서다. 실측상 시간창을
 *    좁혀도 인천은 도착 ~185·출발 ~205(2페이지)라, 갱신당 도착2+출발2 ≈ 4콜. TTL 15분이면
 *    하루 96회 갱신 × 4 = 384콜/일로 500 한도 안(23% 여유). 5분(TTL)이면 576콜/일로 초과하므로
 *    안 된다. 페이지 상한도 2로 묶어 창이 커져도 콜 수가 안 튀게 한다.
 *  - **시간창(now-1h ~ now+Nh)** 으로 하루치 전량 대신 근시간대만. 자정을 넘는 창은 당일 경계로
 *    자른다(searchday 는 하루 단위) — **인천도 KAC 와 같은 한계**다(kstFlightWindow 가 클램프).
 *  - **부분 실패 허용**(allSettled + lastGood), **실패는 캐시 안 함**(lastGood 만 stale 재사용).
 */

import 'server-only';
import { fetchFlights } from './kac-api';
import { fetchIiacFlights } from './iiac-api';
import { toFlight, sortByScheduled, type Flight, type FlightDirection } from './flights';
import { findAirport, type Airport } from './airports';
import { kstSearchday, kstFlightWindow } from './time';
import type { DgkFetchResult } from './dgk-api';
import { fetchCargoFlights } from './cargo-api';
import { CARGO_TERMINALS, inCargoWindow, withCargoTerminal } from './cargo';

export const KAC_REVALIDATE_SECONDS = 300;
export const IIAC_REVALIDATE_SECONDS = 900;

/** 소스별 조회 파라미터. 인천은 쿼터가 빡빡해 TTL 이 길고 창/페이지가 좁다. */
const KAC_CONFIG = { revalidate: KAC_REVALIDATE_SECONDS, forwardHours: 6 };
const IIAC_CONFIG = { revalidate: IIAC_REVALIDATE_SECONDS, forwardHours: 5, maxPages: 2 };
/** 도착은 이미 내린 편도 잠깐 유용하므로 뒤로 1시간(두 소스 공통). */
const WINDOW_BACK_HOURS = 1;

/** 공항의 운항 보드 TTL(초). API 라우트의 CDN Cache-Control 에도 쓴다. */
export function revalidateFor(airport: Airport): number {
  return airport.kind === 'incheon' ? IIAC_REVALIDATE_SECONDS : KAC_REVALIDATE_SECONDS;
}

export interface FlightSectionHealth {
  ok: boolean;
  stale: boolean;
  error: { code: string; message: string } | null;
}

export interface FlightBoard {
  airportCode: string;
  airportName: string;
  arrivals: Flight[];
  departures: Flight[];
  window: { searchday: string; from: string; to: string };
  fetchedAt: string;
  health: { arrivals: FlightSectionHealth; departures: FlightSectionHealth };
}

interface LastGood {
  flights: Flight[];
}

/** 공항+방향별 마지막 성공값. 실패 시 stale 로 재사용한다. */
const lastGood = new Map<string, LastGood>();
/** 공항별 메모리 캐시(재계산 억제). */
const cached = new Map<string, { at: number; board: FlightBoard }>();
/** 공항별 inflight 중복 제거. */
const inflight = new Map<string, Promise<FlightBoard>>();

function sectionError(reason: unknown): { code: string; message: string } {
  if (reason && typeof reason === 'object' && 'code' in reason && 'message' in reason) {
    return {
      code: String((reason as { code: unknown }).code),
      message: String((reason as { message: unknown }).message),
    };
  }
  return { code: 'UNKNOWN', message: String(reason) };
}

/** 소스에 맞는 fetch 를 골라 한 방향을 받는다. */
function fetchDirection(
  airport: Airport,
  direction: FlightDirection,
  searchday: string,
  from: string,
  to: string,
): Promise<DgkFetchResult> {
  if (airport.kind === 'incheon') {
    return fetchIiacFlights(
      { direction, searchday, fromTime: from, toTime: to },
      IIAC_CONFIG.maxPages,
      IIAC_CONFIG.revalidate,
    );
  }
  // KAC: query(한글명) 는 airports.ts 가 보장(호출 전 검증).
  return fetchFlights(
    { direction, airportQuery: airport.query!, searchday, fromTime: from, toTime: to },
    KAC_CONFIG.revalidate,
  );
}

async function build(airportCode: string): Promise<FlightBoard> {
  const airport = findAirport(airportCode);
  if (!airport) throw new Error(`알 수 없는 공항입니다: ${airportCode}`);
  if (airport.kind === 'kac' && !airport.query) {
    throw new Error(`운항 필터가 없는 KAC 공항입니다: ${airportCode}`);
  }

  const now = Date.now();
  const searchday = kstSearchday(now);
  const forwardHours = airport.kind === 'incheon' ? IIAC_CONFIG.forwardHours : KAC_CONFIG.forwardHours;
  const { from, to } = kstFlightWindow(now, WINDOW_BACK_HOURS, forwardHours);

  const [arrR, depR] = await Promise.allSettled([
    fetchDirection(airport, 'arrival', searchday, from, to),
    fetchDirection(airport, 'departure', searchday, from, to),
  ]);

  const arrKey = `${airportCode}:arrival`;
  const depKey = `${airportCode}:departure`;

  let arrivalsHealth: FlightSectionHealth;
  if (arrR.status === 'fulfilled') {
    lastGood.set(arrKey, {
      flights: sortByScheduled(arrR.value.items.map((r) => toFlight(r, 'arrival'))),
    });
    arrivalsHealth = { ok: true, stale: false, error: null };
  } else {
    arrivalsHealth = { ok: false, stale: lastGood.has(arrKey), error: sectionError(arrR.reason) };
  }

  let departuresHealth: FlightSectionHealth;
  if (depR.status === 'fulfilled') {
    lastGood.set(depKey, {
      flights: sortByScheduled(depR.value.items.map((r) => toFlight(r, 'departure'))),
    });
    departuresHealth = { ok: true, stale: false, error: null };
  } else {
    departuresHealth = { ok: false, stale: lastGood.has(depKey), error: sectionError(depR.reason) };
  }

  return {
    airportCode,
    airportName: airport.name,
    arrivals: lastGood.get(arrKey)?.flights ?? [],
    departures: lastGood.get(depKey)?.flights ?? [],
    window: { searchday, from, to },
    fetchedAt: new Date(now).toISOString(),
    health: { arrivals: arrivalsHealth, departures: departuresHealth },
  };
}

/** 공항 운항 보드. 메모리 캐시(소스별 TTL) → inflight 중복 제거 → build. */
export async function getFlightBoard(airportCode: string): Promise<FlightBoard> {
  const airport = findAirport(airportCode);
  const ttlMs = (airport ? revalidateFor(airport) : KAC_REVALIDATE_SECONDS) * 1000;

  const hit = cached.get(airportCode);
  if (hit && Date.now() - hit.at < ttlMs) return hit.board;

  const pending = inflight.get(airportCode);
  if (pending) return pending;

  const p = build(airportCode)
    .then((board) => {
      cached.set(airportCode, { at: Date.now(), board });
      return board;
    })
    .finally(() => {
      inflight.delete(airportCode);
    });

  inflight.set(airportCode, p);
  return p;
}

/* ------------------------------ 인천 화물기 ------------------------------ */

/**
 * 화물기 TTL 30분. 쿼터가 확인되지 않아(인천 여객은 500/일) 보수적으로 잡는다:
 * 갱신당 T1·T2 × 도착·출발 = 4콜(하루치가 1페이지 안팎) → 48회 × 4 ≈ 192콜/일.
 */
export const CARGO_REVALIDATE_SECONDS = 1800;
const CARGO_MAX_PAGES = 2;
export const CARGO_BOARD_CODE = 'ICN-CARGO';

/** T1·T2 를 함께 받는다. 한쪽만 실패하면 나머지로 보여 주고, 둘 다 실패해야 실패로 본다. */
async function fetchCargoDirection(direction: FlightDirection, searchday: string): Promise<Flight[]> {
  const results = await Promise.allSettled(
    CARGO_TERMINALS.map(async (t) => {
      const r = await fetchCargoFlights(t, direction, searchday, CARGO_MAX_PAGES, CARGO_REVALIDATE_SECONDS);
      return r.items.map((raw) => withCargoTerminal(toFlight(raw, direction), t));
    }),
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<Flight[]> => r.status === 'fulfilled');
  if (ok.length === 0) throw (results[0] as PromiseRejectedResult).reason;
  return ok.flatMap((r) => r.value);
}

async function buildCargo(): Promise<FlightBoard> {
  const now = Date.now();
  const searchday = kstSearchday(now);
  const [arrR, depR] = await Promise.allSettled([
    fetchCargoDirection('arrival', searchday),
    fetchCargoDirection('departure', searchday),
  ]);

  const health = (r: PromiseSettledResult<Flight[]>, key: string): FlightSectionHealth => {
    if (r.status === 'fulfilled') {
      lastGood.set(key, { flights: sortByScheduled(r.value) });
      return { ok: true, stale: false, error: null };
    }
    return { ok: false, stale: lastGood.has(key), error: sectionError(r.reason) };
  };
  const arrKey = `${CARGO_BOARD_CODE}:arrival`;
  const depKey = `${CARGO_BOARD_CODE}:departure`;
  const arrivalsHealth = health(arrR, arrKey);
  const departuresHealth = health(depR, depKey);
  const visible = (key: string) => (lastGood.get(key)?.flights ?? []).filter((f) => inCargoWindow(f, now));

  return {
    airportCode: CARGO_BOARD_CODE,
    airportName: '인천 화물기',
    arrivals: visible(arrKey),
    departures: visible(depKey),
    window: { searchday, from: '', to: '' },
    fetchedAt: new Date(now).toISOString(),
    health: { arrivals: arrivalsHealth, departures: departuresHealth },
  };
}

/** 인천 화물기 보드. 여객 보드와 같은 메모리 캐시·inflight 규칙. */
export async function getCargoBoard(): Promise<FlightBoard> {
  const hit = cached.get(CARGO_BOARD_CODE);
  if (hit && Date.now() - hit.at < CARGO_REVALIDATE_SECONDS * 1000) return hit.board;
  const pending = inflight.get(CARGO_BOARD_CODE);
  if (pending) return pending;
  const p = buildCargo()
    .then((board) => {
      cached.set(CARGO_BOARD_CODE, { at: Date.now(), board });
      return board;
    })
    .finally(() => inflight.delete(CARGO_BOARD_CODE));
  inflight.set(CARGO_BOARD_CODE, p);
  return p;
}
