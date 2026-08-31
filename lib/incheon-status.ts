/**
 * 세 엔드포인트(주차 · 출국장 T1 · T2)를 모아 화면용 스냅샷을 만든다. **서버 전용.**
 *
 * 설계 판단
 *  - **부분 실패를 허용한다.** 주차는 되는데 출국장만 죽는 상황이 실제로 가능하다.
 *    `Promise.allSettled` 로 각각 받고, 실패한 섹션은 마지막 성공값을 stale 로 넘긴다
 *    (없으면 오류로 표시). 한 곳이 죽어도 나머지는 보여 준다.
 *  - **실패를 성공으로 캐시하지 않는다.** 마지막 성공값(lastGood)만 따로 들고 있다가
 *    실패 시 stale 플래그와 함께 재사용한다. 오류 응답 자체는 저장하지 않는다.
 *
 * 캐시/쿼터
 *  - 주차 개발계정 **일 1,000콜**. Next Data Cache(`revalidate`)는 Vercel 에서 인스턴스
 *    간 공유되므로 업스트림 실호출을 여기서 막는다. 120초면 하루 720콜/엔드포인트로
 *    한도 대비 약 28% 여유. 데이터가 60초마다 갱신되므로 120초 캐시는 '최대 한 텀' 만
 *    뒤처진다 — 커브사이드 판단(자리 있나/줄 긴가)에는 충분하다. 90초로 줄이면 960콜/일이라
 *    인스턴스 스탬피드 시 한도에 붙는다. 그래서 120초.
 *  - 메모리 캐시는 재계산만 아낀다(업스트림 억제는 Data Cache 담당).
 */

import 'server-only';
import {
  ENDPOINTS,
  fetchEndpoint,
  type RawParking,
  type RawCongestion,
  type FetchResult,
} from './incheon-api';
import {
  toParkingLot,
  toGate,
  earliestObservedAt,
  TERMINALS,
  type ParkingLot,
  type Gate,
  type TerminalId,
} from './incheon';

export const REVALIDATE_SECONDS = 120;

export interface SectionError {
  code: string;
  message: string;
}

export interface TerminalStatus {
  id: TerminalId;
  name: string;
  lots: ParkingLot[];
  gates: Gate[];
  /** 주차 관측 시각(가장 오래된 구역 기준). */
  parkingObservedAt: number | null;
  /** 출국장 관측 시각. */
  gatesObservedAt: number | null;
}

export interface StatusView {
  terminals: TerminalStatus[];
  fetchedAt: string;
  /** 섹션별 상태. 실패 시 stale 여부와 오류를 담는다. */
  health: {
    parking: SectionHealth;
    departure: SectionHealth;
  };
}

export interface SectionHealth {
  ok: boolean;
  /** 마지막 성공값을 대신 보여 주는 중인지. */
  stale: boolean;
  error: SectionError | null;
}

/** 섹션별 마지막 성공 응답. 실패 시 stale 로 재사용한다. */
interface LastGood<T> {
  result: FetchResult<T>;
}

let lastParking: LastGood<RawParking> | null = null;
let lastT1: LastGood<RawCongestion> | null = null;
let lastT2: LastGood<RawCongestion> | null = null;

let cached: { at: number; view: StatusView } | null = null;
let inflight: Promise<StatusView> | null = null;

function sectionError(reason: unknown): SectionError {
  if (reason && typeof reason === 'object' && 'code' in reason && 'message' in reason) {
    return { code: String((reason as { code: unknown }).code), message: String((reason as { message: unknown }).message) };
  }
  return { code: 'UNKNOWN', message: String(reason) };
}

async function build(): Promise<StatusView> {
  const now = Date.now();
  const [parkingR, t1R, t2R] = await Promise.allSettled([
    fetchEndpoint<RawParking>(ENDPOINTS.parking, REVALIDATE_SECONDS),
    fetchEndpoint<RawCongestion>(ENDPOINTS.departureT1, REVALIDATE_SECONDS),
    fetchEndpoint<RawCongestion>(ENDPOINTS.departureT2, REVALIDATE_SECONDS),
  ]);

  // 주차
  let parkingHealth: SectionHealth;
  if (parkingR.status === 'fulfilled') {
    lastParking = { result: parkingR.value };
    parkingHealth = { ok: true, stale: false, error: null };
  } else {
    parkingHealth = { ok: false, stale: lastParking !== null, error: sectionError(parkingR.reason) };
  }

  // 출국장(T1/T2 를 하나의 섹션으로 본다 — 둘 중 하나만 죽어도 departure 는 stale).
  let t1ok = false;
  let t2ok = false;
  if (t1R.status === 'fulfilled') {
    lastT1 = { result: t1R.value };
    t1ok = true;
  }
  if (t2R.status === 'fulfilled') {
    lastT2 = { result: t2R.value };
    t2ok = true;
  }
  const depError =
    t1R.status === 'rejected'
      ? sectionError(t1R.reason)
      : t2R.status === 'rejected'
        ? sectionError(t2R.reason)
        : null;
  const departureHealth: SectionHealth = {
    ok: t1ok && t2ok,
    stale: !(t1ok && t2ok) && (lastT1 !== null || lastT2 !== null),
    error: depError,
  };

  const parkingLots = (lastParking?.result.items ?? []).map(toParkingLot);
  const t1Gates = (lastT1?.result.items ?? []).map((g) => toGate(g, now));
  const t2Gates = (lastT2?.result.items ?? []).map((g) => toGate(g, now));
  const gatesByTerminal: Record<TerminalId, Gate[]> = {
    T1: t1Gates.filter((g) => g.terminal === 'T1'),
    T2: t2Gates.filter((g) => g.terminal === 'T2'),
  };

  const terminals: TerminalStatus[] = TERMINALS.map((t) => {
    const lots = parkingLots.filter((l) => l.terminal === t.id);
    const gates = gatesByTerminal[t.id];
    return {
      id: t.id,
      name: t.name,
      lots,
      gates,
      parkingObservedAt: earliestObservedAt(lots.map((l) => l.observedAt)),
      gatesObservedAt: earliestObservedAt(gates.map((g) => g.observedAt)),
    };
  });

  return {
    terminals,
    fetchedAt: new Date(now).toISOString(),
    health: { parking: parkingHealth, departure: departureHealth },
  };
}

/** 화면용 스냅샷. 메모리 캐시(120초) → inflight 중복 제거 → build. */
export async function getStatus(): Promise<StatusView> {
  if (cached && Date.now() - cached.at < REVALIDATE_SECONDS * 1000) return cached.view;
  if (inflight) return inflight;

  inflight = build()
    .then((view) => {
      cached = { at: Date.now(), view };
      return view;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
