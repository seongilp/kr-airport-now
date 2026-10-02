/**
 * 인천 화물기 보드용 순수 함수(node:test 대상).
 *
 * 화물기 상세(B551177 statusOfCgoFltDeOdpT1/T2)는 터미널별로 서비스가 갈려 있고, 응답의 terminalId 는
 * 여객 터미널이 아니라 화물터미널 코드(C01 남측·C03 3단계)다. 그래서 어느 서비스에서 왔는지(T1/T2)를
 * 따로 붙여 보여 준다. 화물기는 하루 편수가 적어 하루치를 받고 시간창은 여기서 자른다.
 */

import type { Flight } from './flights';

export type CargoTerminal = 'T1' | 'T2';
export const CARGO_TERMINALS: readonly CargoTerminal[] = ['T1', 'T2'];

/** 이미 떠난/내린 편도 잠깐은 보여 준다 */
export const CARGO_BACK_MS = 60 * 60 * 1000;
/** 화물기는 드문드문 다녀 여객(5시간)보다 넓게 본다 */
export const CARGO_FORWARD_MS = 12 * 60 * 60 * 1000;

/** 예정 또는 변경 시각 중 하나라도 [now-1h, now+12h] 안이면 보여 준다. 시각이 둘 다 없으면 버린다. */
export function inCargoWindow(f: Flight, now: number): boolean {
  const from = now - CARGO_BACK_MS;
  const to = now + CARGO_FORWARD_MS;
  return [f.scheduledAt, f.estimatedAt].some((t) => t !== null && t >= from && t <= to);
}

/** 어느 터미널 서비스에서 온 편인지 붙인다. 원본은 그대로 둔다. */
export function withCargoTerminal(f: Flight, terminal: CargoTerminal): Flight {
  return { ...f, terminal };
}
