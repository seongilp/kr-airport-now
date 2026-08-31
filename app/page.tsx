import { StatusBoard } from '@/components/status-board';
import { getStatus } from '@/lib/incheon-status';

/**
 * ISR: 서버 렌더도 120초 주기로 재검증(업스트림 억제는 Data Cache 가 담당).
 * 세그먼트 config 는 리터럴이어야 정적 분석된다 — 상수 import 는 못 쓴다.
 * 값의 근거는 lib/incheon-status.ts 의 REVALIDATE_SECONDS 주석 참고(120초).
 * 함수를 서울(icn1)에 두는 건 vercel.json 의 regions 로 처리한다.
 */
export const revalidate = 120;

export default async function Home() {
  const view = await getStatus();
  return <StatusBoard initial={view} />;
}
