/**
 * 상태 → 색상 클래스. 순수 매핑이라 여기 모아 둔다.
 *
 * 색만으로 상태를 말하지 않는다(색각 접근성). 항상 텍스트 라벨을 같이 쓴다 —
 * 이 파일은 '배지 배경/글자색' 만 담당하고, 라벨은 incheon.ts 의 *_STATE_LABEL 을 쓴다.
 */

import type { ParkingState, GateState } from './incheon';

/** Tailwind 클래스. 다크 기본이라 어두운 배경 위에서 대비가 서게 골랐다. */
const STYLES = {
  free: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  normal: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  busy: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  heavy: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  muted: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',
} as const;

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
