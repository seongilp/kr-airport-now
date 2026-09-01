import { NextResponse } from 'next/server';
import { getStatus, REVALIDATE_SECONDS } from '@/lib/incheon-status';
import { swrCacheControl } from '@/lib/cache-control';

/**
 * 클라이언트 자동/수동 새로고침용. 서버 컴포넌트가 첫 페인트를 그리고,
 * 이후 갱신은 이 라우트로 가볍게 받는다.
 *
 * 함수를 서울(icn1)에 두는 건 vercel.json 의 regions 로 처리한다 — 업스트림이
 * 한국이라 지연을 줄인다(Next 16 에서 preferredRegion 세그먼트 설정은 폐기됨).
 */
// 세그먼트 config 는 리터럴이어야 한다(상수 import 불가). 근거는 REVALIDATE_SECONDS 주석.
export const revalidate = 120;

export async function GET() {
  try {
    const view = await getStatus();
    return NextResponse.json(view, {
      headers: {
        // s-maxage=120(신선 주기, 쿼터 불변) + SWR 는 KST 자정까지 — TTL 이 지나도 CDN 이
        // 낡은 값을 즉시 주고 뒤에서 갱신한다. 실패는 캐시 안 됨(getStatus 가 stale 로 방어).
        'Cache-Control': swrCacheControl(REVALIDATE_SECONDS),
      },
    });
  } catch (error) {
    // 전체 실패(키 누락 등). 부분 실패는 getStatus 안에서 stale 로 흡수된다.
    // **실패는 절대 캐시하지 않는다** — no-store 를 명시해 CDN/브라우저가 오류를 붙들지 못하게 한다.
    // 안 걸면 업스트림이 1분 뒤 살아나도 캐시된 오류를 계속 보게 된다.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
