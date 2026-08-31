import { NextResponse } from 'next/server';
import { getFlightBoard, FLIGHT_REVALIDATE_SECONDS } from '@/lib/flight-status';
import { findAirport } from '@/lib/airports';

/**
 * 공항 운항 보드(도착·출발). `?airport=<코드>` 로 공항을 고른다.
 * 함수는 서울(icn1)에 둔다(업스트림이 한국) — vercel.json regions 로 처리.
 */
// 세그먼트 config 는 리터럴. 근거는 FLIGHT_REVALIDATE_SECONDS 주석(300초).
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
  // 인천은 이 서비스(B551178)에 없다 — 주차/출국장 경로(/api/status)로 안내.
  if (airport.kind !== 'kac') {
    return NextResponse.json(
      { error: `${airport.name}은(는) 운항 보드를 지원하지 않습니다.` },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const board = await getFlightBoard(airport.code);
    return NextResponse.json(board, {
      headers: {
        'Cache-Control': `public, s-maxage=${FLIGHT_REVALIDATE_SECONDS}, stale-while-revalidate=60`,
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
