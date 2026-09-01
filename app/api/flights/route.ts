import { NextResponse } from 'next/server';
import { getFlightBoard, revalidateFor } from '@/lib/flight-status';
import { findAirport } from '@/lib/airports';
import { swrCacheControl } from '@/lib/cache-control';

/**
 * 공항 운항 보드(도착·출발). `?airport=<코드>` 로 공항을 고른다.
 * 인천(IIAC)·그 외(KAC) 둘 다 지원하며 CDN TTL 은 소스별로 다르다(revalidateFor).
 * 함수는 서울(icn1)에 둔다(업스트림이 한국) — vercel.json regions 로 처리.
 */
// 세그먼트 config 는 리터럴이어야 한다. 실제 TTL 은 응답 헤더에서 소스별로 정한다.
export const revalidate = 300;

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('airport');
  const airport = findAirport(code);

  // 입력 검증: 알 수 없는 공항 → 400. 잘못된 입력을 성공(캐시)으로 만들지 않는다.
  if (!airport) {
    return NextResponse.json(
      { error: `알 수 없는 공항 코드입니다: ${code ?? '(없음)'}` },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const board = await getFlightBoard(airport.code);
    const ttl = revalidateFor(airport);
    // s-maxage=ttl(신선 주기, 쿼터 불변) + SWR 는 KST 자정까지 — TTL 이 지나도 CDN 이
    // 낡은 값을 즉시 주고 뒤에서 갱신한다(느리게 뜨던 콜드 MISS 를 없앤다).
    return NextResponse.json(board, {
      headers: {
        'Cache-Control': swrCacheControl(ttl),
      },
    });
  } catch (error) {
    // 전체 실패(키 누락 등). 부분 실패는 getFlightBoard 안에서 stale 로 흡수된다.
    // **실패는 절대 캐시하지 않는다** — no-store.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
