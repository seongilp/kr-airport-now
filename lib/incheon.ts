/**
 * 원시 응답 → 화면용 모델. **순수 함수만 둔다**(node:test 로 검증).
 *
 * 이 파일의 존재 이유는 결측 처리다. 오늘 형제 프로젝트에서 값을 결측을 0으로 뭉개
 * "자리 0개 남음"·"대기 0분" 으로 잘못 표시한 사고가 있었다. 여기서 그 경계를 못 박는다.
 *  - 주차 `parkingarea === 0/빈값` → **미운영**. 잔여를 계산하지 않는다.
 *  - 출국장 `waitTime === 0` → 운영시간 안이라고 '확신될 때만' 대기 없음. 아니면 **불명**.
 */

import type { RawParking, RawCongestion } from './incheon-api';
import { parseKstStamp } from './time';

export type TerminalId = 'T1' | 'T2';

export interface TerminalMeta {
  id: TerminalId;
  name: string;
}

export const TERMINALS: TerminalMeta[] = [
  { id: 'T1', name: '제1터미널' },
  { id: 'T2', name: '제2터미널' },
];

/* ------------------------------- 주차 ------------------------------- */

export type ParkingState = 'free' | 'normal' | 'busy' | 'full' | 'closed' | 'unknown';

export interface ParkingLot {
  /** 원본 구역명 그대로. 예: `T1 장기 P1 주차장` */
  name: string;
  /** 터미널 접두사로 가른다. */
  terminal: TerminalId;
  /** 접두사(`T1 `/`T2 `)를 뗀 표시용 이름. */
  label: string;
  /** 총 주차면수. 미운영/결측이면 null. */
  total: number | null;
  /** 주차 대수. 결측이면 null. */
  occupied: number | null;
  /** 잔여면수. 미운영/결측이면 null — **절대 0으로 채우지 않는다.** */
  free: number | null;
  /** 점유율 0~1. 계산 불가면 null. */
  ratio: number | null;
  state: ParkingState;
  /** 관측 시각(epoch ms). 파싱 실패면 null. */
  observedAt: number | null;
}

function toInt(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null; // 빈 문자열을 0으로 뭉개지 않는다 (서울 주차 사고의 핵심)
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parkingState(total: number | null, free: number | null): ParkingState {
  if (total === null) return 'unknown'; // 총면수 결측(빈 문자열) — 모른다
  if (total === 0) return 'closed'; // parkingarea=0 → 미운영 (자리 0개가 아니다)
  if (free === null) return 'unknown'; // 주차수 결측
  const ratio = 1 - free / total;
  if (free <= 0) return 'full';
  if (ratio >= 0.9) return 'busy';
  if (ratio >= 0.7) return 'normal';
  return 'free';
}

export function toParkingLot(raw: RawParking): ParkingLot {
  const total = toInt(raw.parkingarea);
  const occupied = toInt(raw.parking);
  const name = raw.floor ?? '';
  const terminal: TerminalId = name.startsWith('T2') ? 'T2' : 'T1';
  const label = name.replace(/^T[12]\s*/, '').trim() || name;

  // 미운영(총면수 0/결측)이면 잔여를 계산하지 않는다.
  const operating = total !== null && total > 0;
  let free: number | null = null;
  let ratio: number | null = null;
  if (operating && occupied !== null) {
    // 데이터 글리치로 주차수>총면수 가 오면 잔여를 음수로 두지 않고 0으로 막되 만차로 본다.
    free = Math.max(0, total - occupied);
    ratio = Math.min(1, Math.max(0, occupied / total));
  }

  return {
    name,
    terminal,
    label,
    total: operating ? total : null,
    occupied,
    free,
    ratio,
    // 상태는 파싱한 실제 총면수로 판정한다 — 0(미운영)과 빈값(정보없음)을 갈라야 하므로
    // null 로 뭉갠 값이 아니라 원래 total 을 넘긴다.
    state: parkingState(total, free),
    observedAt: parseKstStamp(raw.datetm),
  };
}

/* ----------------------------- 출국장 ----------------------------- */

export type GateState = 'free' | 'normal' | 'busy' | 'crowded' | 'closed' | 'unknown';

export interface Gate {
  gateId: string;
  terminal: TerminalId;
  /** 표시용 짧은 이름. 예: `DG1_A` → `1-A` */
  label: string;
  /** 예상 대기시간(분). 불명/미운영이면 null — **0으로 단언하지 않는다.** */
  waitMinutes: number | null;
  /** 줄 길이(명). 결측이면 null. */
  queueLength: number | null;
  state: GateState;
  /** 운영시간 원문. */
  operatingTime: string | null;
  observedAt: number | null;
}

/**
 * 운영시간 문자열(`06:00~19:00`, `00:00~24:00`, ``)로 '지금(KST) 운영 중인지' 판정.
 * 판단 불가면 null 을 준다 — 모르면 모른다고 해야 한다.
 */
export function isOperatingNow(
  operatingTime: string | undefined | null,
  nowMs: number = Date.now(),
): boolean | null {
  const raw = (operatingTime ?? '').trim();
  if (raw === '') return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const startMin = Number(m[1]) * 60 + Number(m[2]);
  let endMin = Number(m[3]) * 60 + Number(m[4]);
  if (endMin === 0) endMin = 24 * 60; // 방어적. 보통은 24:00 으로 온다.
  // 현재 KST 분(0~1439).
  const kst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (startMin === 0 && endMin >= 24 * 60) return true; // 00:00~24:00 = 상시
  return nowMin >= startMin && nowMin < endMin;
}

function gateState(waitMinutes: number | null): GateState {
  if (waitMinutes === null) return 'unknown';
  if (waitMinutes <= 10) return 'free';
  if (waitMinutes <= 20) return 'normal';
  if (waitMinutes <= 40) return 'busy';
  return 'crowded';
}

export function toGate(raw: RawCongestion, nowMs: number = Date.now()): Gate {
  const terminal: TerminalId = raw.terminalId === 'P03' ? 'T2' : 'T1';
  const label = raw.gateId.replace(/^DG/, '').replace('_', '-');
  const wait = toInt(raw.waitTime);
  const queue = toInt(raw.waitLength);
  const operating = isOperatingNow(raw.operatingTime, nowMs);

  let waitMinutes: number | null;
  let state: GateState;

  if (operating === false) {
    // 운영시간 밖이 명확 → 미운영. waitTime 값과 무관하게 닫힘.
    waitMinutes = null;
    state = 'closed';
  } else if (wait === null) {
    waitMinutes = null;
    state = 'unknown';
  } else if (wait > 0) {
    waitMinutes = wait;
    state = gateState(wait);
  } else {
    // waitTime === 0: '대기 없음' 인지 '닫힌 게이트' 인지 확신할 수 없는 구간.
    // 운영 중이 '확실할 때만' 여유로 본다. 운영시간 정보가 없으면(빈 문자열) 불명 처리.
    // 실측: T2 DG2 게이트가 waitTime=0·operatingTime="" 로 오는데 이는 새벽 미운영이다.
    if (operating === true) {
      waitMinutes = 0;
      state = 'free';
    } else {
      waitMinutes = null;
      state = 'unknown';
    }
  }

  return {
    gateId: raw.gateId,
    terminal,
    label,
    waitMinutes,
    queueLength: queue,
    state,
    operatingTime: (raw.operatingTime ?? '').trim() || null,
    observedAt: parseKstStamp(raw.occurtime),
  };
}

/* --------------------------- 집계 라벨 --------------------------- */

export const PARKING_STATE_LABEL: Record<ParkingState, string> = {
  free: '여유',
  normal: '보통',
  busy: '혼잡',
  full: '만차',
  closed: '미운영',
  unknown: '정보 없음',
};

export const GATE_STATE_LABEL: Record<GateState, string> = {
  free: '원활',
  normal: '보통',
  busy: '혼잡',
  crowded: '매우 혼잡',
  closed: '미운영',
  unknown: '정보 없음',
};

/** 가장 이른 관측 시각(=가장 오래된 값). 신선도 배지에 쓴다. null 은 무시. */
export function earliestObservedAt(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? Math.min(...nums) : null;
}
