/**
 * 공항 하나의 운항 보드(도착·출발)를 만든다. **서버 전용.**
 *
 * 캐시/쿼터 판단 (사용자 명시: "기본은 캐싱이다")
 *  - **TTL 300초(5분).** 근거: 운항은 주차(120초)보다 덜 급하다. 스케줄은 분 단위로 안
 *    바뀌고, 바뀌는 건 상태(지연·결항·출발)뿐인데 그 반영은 5분이면 커브사이드/게이트
 *    판단에 충분하다. B551178 일 한도 5,000콜이라 여유가 크지만, 캐시 스탬피드를
 *    Next Data Cache(revalidate)로 인스턴스 간 억제한다.
 *  - **시간창(now-1h~now+6h)** 으로 하루치 전량 대신 근시간대만 받는다(kac-api 참고).
 *    붐비는 공항도 보통 1페이지(100건 이하). 한 보드 갱신 = 도착1~2 + 출발1~2 ≈ 2~4콜.
 *    5분 TTL 로 한 공항을 계속 봐도 하루 최대 ~1,150콜/공항(4콜×288). 동시에 여러 공항을
 *    봐도 5,000 한도에 여유가 크다.
 *  - **부분 실패 허용.** 도착은 되는데 출발만 죽는 경우를 위해 allSettled + lastGood.
 *  - **실패는 캐시하지 않는다.** lastGood(마지막 성공값)만 stale 로 재사용한다.
 */

import 'server-only';
import { fetchFlights } from './kac-api';
import { toFlight, sortByScheduled, type Flight } from './flights';
import { findAirport } from './airports';
import { kstSearchday, kstFlightWindow } from './time';

export const FLIGHT_REVALIDATE_SECONDS = 300;

/** 조회 시간창(지금 기준). 도착은 이미 내린 편도 잠깐 유용하므로 뒤로 1시간. */
const WINDOW_BACK_HOURS = 1;
const WINDOW_FORWARD_HOURS = 6;

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
  /** 조회 창(표시용). */
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

async function build(airportCode: string): Promise<FlightBoard> {
  const airport = findAirport(airportCode);
  if (!airport || airport.kind !== 'kac' || !airport.query) {
    // 인천 등 KAC 소관이 아닌 공항은 이 경로로 오면 안 된다(라우트에서 막지만 방어).
    throw new Error(`운항 보드를 지원하지 않는 공항입니다: ${airportCode}`);
  }

  const now = Date.now();
  const searchday = kstSearchday(now);
  const { from, to } = kstFlightWindow(now, WINDOW_BACK_HOURS, WINDOW_FORWARD_HOURS);
  const common = { airportQuery: airport.query, searchday, fromTime: from, toTime: to };

  const [arrR, depR] = await Promise.allSettled([
    fetchFlights({ ...common, direction: 'arrival' }, FLIGHT_REVALIDATE_SECONDS),
    fetchFlights({ ...common, direction: 'departure' }, FLIGHT_REVALIDATE_SECONDS),
  ]);

  const arrKey = `${airportCode}:arrival`;
  const depKey = `${airportCode}:departure`;

  let arrivalsHealth: FlightSectionHealth;
  if (arrR.status === 'fulfilled') {
    const flights = sortByScheduled(arrR.value.items.map((r) => toFlight(r, 'arrival')));
    lastGood.set(arrKey, { flights });
    arrivalsHealth = { ok: true, stale: false, error: null };
  } else {
    arrivalsHealth = { ok: false, stale: lastGood.has(arrKey), error: sectionError(arrR.reason) };
  }

  let departuresHealth: FlightSectionHealth;
  if (depR.status === 'fulfilled') {
    const flights = sortByScheduled(depR.value.items.map((r) => toFlight(r, 'departure')));
    lastGood.set(depKey, { flights });
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

/** 공항 운항 보드. 메모리 캐시(5분) → inflight 중복 제거 → build. */
export async function getFlightBoard(airportCode: string): Promise<FlightBoard> {
  const hit = cached.get(airportCode);
  if (hit && Date.now() - hit.at < FLIGHT_REVALIDATE_SECONDS * 1000) return hit.board;

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
