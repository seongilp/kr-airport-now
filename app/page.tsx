import { AppShell } from '@/components/app-shell';
import { getStatus } from '@/lib/incheon-status';

/**
 * ISR: 서버 렌더도 120초 주기로 재검증(업스트림 억제는 Data Cache 가 담당).
 * 세그먼트 config 는 리터럴이어야 정적 분석된다 — 상수 import 는 못 쓴다.
 * 값의 근거는 lib/incheon-status.ts 의 REVALIDATE_SECONDS 주석 참고(120초).
 *
 * 기본 공항은 인천이라, 첫 페인트에 필요한 인천 스냅샷만 서버에서 받아 넘긴다.
 * 다른 공항의 운항 보드는 사용자가 고를 때 클라이언트가 /api/flights 로 받는다(초기 부하 0).
 * 함수를 서울(icn1)에 두는 건 vercel.json 의 regions 로 처리한다.
 */
export const revalidate = 120;

export default async function Home() {
  const incheonInitial = await getStatus();
  return <AppShell incheonInitial={incheonInitial} />;
}
