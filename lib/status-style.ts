/**
 * 상태 → 색상 클래스. 순수 매핑이라 여기 모아 둔다.
 *
 * 색만으로 상태를 말하지 않는다(색각 접근성). 항상 텍스트 라벨을 같이 쓴다 —
 * 이 파일은 '배지 배경/글자색' 만 담당하고, 라벨은 incheon.ts 의 *_STATE_LABEL 을 쓴다.
 */

import type { ParkingState, GateState } from './incheon';
import type { FlightStatus } from './flights';

/** Tailwind 클래스. 다크 기본이라 어두운 배경 위에서 대비가 서게 골랐다. */
const STYLES = {
  free: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  normal: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  busy: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  heavy: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  muted: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',
} as const;

/**
 * 상태 → 실제 색상값(hex). 지도 마커처럼 Tailwind 클래스를 못 쓰는 곳에서 쓴다.
 * 위 STYLES(리스트 배지)와 같은 팔레트를 hex 로만 옮긴 것 — 지도와 리스트가 색으로
 * 다른 말을 하지 않게 여기 한 곳에서만 정의한다(범례가 거짓말이 되는 걸 막는다).
 *   free=emerald-500 · normal=sky-500 · busy=amber-500 · full=rose-500 · muted=zinc-600
 */
export const PARKING_STATE_HEX: Record<ParkingState, string> = {
  free: '#10b981',
  normal: '#0ea5e9',
  busy: '#f59e0b',
  full: '#f43f5e',
  closed: '#52525b',
  unknown: '#52525b',
};

export function parkingStyle(state: ParkingState): string {
  switch (state) {
    case 'free':
      return STYLES.free;
    case 'normal':
      return STYLES.normal;
    case 'busy':
      return STYLES.busy;
    case 'full':
      return STYLES.heavy;
    default:
      return STYLES.muted; // closed / unknown
  }
}

export function gateStyle(state: GateState): string {
  switch (state) {
    case 'free':
      return STYLES.free;
    case 'normal':
      return STYLES.normal;
    case 'busy':
      return STYLES.busy;
    case 'crowded':
      return STYLES.heavy;
    default:
      return STYLES.muted; // closed / unknown
  }
}

/** 점유율 막대 색. 잔여가 없거나 미운영이면 회색. */
export function barColor(state: ParkingState): string {
  switch (state) {
    case 'free':
      return 'bg-emerald-500';
    case 'normal':
      return 'bg-sky-500';
    case 'busy':
      return 'bg-amber-500';
    case 'full':
      return 'bg-rose-500';
    default:
      return 'bg-zinc-600';
  }
}

/** 카드 좌측 색 액센트. 리스트를 세로로 훑을 때 상태(비었나/찼나)를 즉시 스캔하게. */
export function parkingAccent(state: ParkingState): string {
  switch (state) {
    case 'free':
      return 'border-l-emerald-500';
    case 'normal':
      return 'border-l-sky-500';
    case 'busy':
      return 'border-l-amber-500';
    case 'full':
      return 'border-l-rose-500';
    default:
      return 'border-l-zinc-600'; // closed / unknown
  }
}

/**
 * 출국장 대기시간 막대 색. 상태와 연동한다(색만으로 말하지 않으니 항상 숫자·라벨과 함께).
 * 미운영/정보없음은 여기 오지 않는다 — 막대 자체를 그리지 않기 때문(대기 0분처럼 보이면 안 됨).
 */
export function gateBarColor(state: GateState): string {
  switch (state) {
    case 'free':
      return 'bg-emerald-500';
    case 'normal':
      return 'bg-sky-500';
    case 'busy':
      return 'bg-amber-500';
    case 'crowded':
      return 'bg-rose-500';
    default:
      return 'bg-zinc-600';
  }
}

/**
 * 운항 상태 → 배지 색. 같은 팔레트를 재사용해 앱 전체가 색으로 다른 말을 하지 않게 한다.
 *  - 결항(cancelled): 빨강(주의). 지연(delayed): 호박.
 *  - 도착/출발(완료): 회색(이미 끝난 편은 눈에 덜 띄게).
 *  - 탑승(boarding): 초록(지금 가야 하는 편). 예정(scheduled): 파랑.
 *  - 미정(unknown): 회색.
 * 색만으로 말하지 않으므로 화면에선 항상 상태 원문(한글) 라벨을 함께 쓴다.
 */
export function flightStatusStyle(status: FlightStatus): string {
  switch (status) {
    case 'cancelled':
      return STYLES.heavy;
    case 'delayed':
      return STYLES.busy;
    case 'boarding':
      return STYLES.free;
    case 'scheduled':
      return STYLES.normal;
    default:
      return STYLES.muted; // departed / arrived / unknown
  }
}
