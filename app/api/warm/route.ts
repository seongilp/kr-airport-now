import { NextResponse } from 'next/server';

/**
 * 캐시 예열(cron). **첫 사용자가 콜드 MISS(~2.5s)를 안 밟도록** 미리 CDN 을 데운다.
 *
 * 왜 '자기 공개 URL 을 fetch' 하나 — CDN 엣지 캐시는 **그 URL 로 요청이 지나가야** 채워진다.
 * 서버에서 getFlightBoard() 를 부르면 메모리/Data Cache 만 데워지고 사용자가 실제로 때리는
 * CDN 항목은 안 채워진다. 그래서 공개 도메인으로 요청을 보내 엣지를 통과시킨다.
 *
 * ★ Vercel Hobby 크론 제약: **하루 1회**(±59분). 그래서 이 예열은 '상시 워밍'이 아니라
 *   **자정 이후 그날 첫 요청**(SWR 창이 KST 자정에서 잘려 만료된 직후)만 커버한다. 낮 동안의
 *   즉시성은 stale-while-revalidate 가 담당한다(lib/cache-control.ts). 쿼터가 빡빡한 인천만
 *   예열하고, KAC 공항 7개+는 곱셈으로 터지므로 예열하지 않는다(사용자 요청 시 SWR 로 흡수).
 *
 * 쿼터: 하루 1회 × (인천 운항 build ≈ 4콜 + 현황 ≈ 3콜) — 무시할 수준(인천 500/일 중 <1%).
 *
 * fail closed: **CRON_SECRET 이 없거나 안 맞으면 503.** 공개로 뚫려 아무나 예열을 못 돌리게.
 */

import 'server-only';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 예열 대상. 인천만(쿼터 보호). 기본 화면(현황)과 운항 탭 둘 다 데운다. */
const TARGETS = ['/api/status', '/api/flights?airport=ICN'] as const;

function baseUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'kr-airport-now.vercel.app';
  return `https://${host}`;
}

async function warmOne(path: string): Promise<Record<string, unknown>> {
  const started = Date.now();
  try {
    // no-store: 이 fetch 자체는 캐시하지 말고, 응답이 CDN 에 채워지는 것만 노린다.
    const res = await fetch(`${baseUrl()}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'application/json' },
    });
    const ms = Date.now() - started;
    const cache = res.headers.get('x-vercel-cache');
    if (!res.ok) {
      return { path, ok: false, status: res.status, cache, ms };
    }
    // 실제로 '일을 했는지' 증명: 채운 건수를 응답에서 읽어 담는다(ok:true 인데 빈 크론 방지).
    const body = (await res.json()) as Record<string, unknown>;
    const counts = itemCounts(path, body);
    return { path, ok: true, status: res.status, cache, ms, ...counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { path, ok: false, error: message, ms: Date.now() - started };
  }
}

/** 응답에서 '몇 건 채웠나' 를 뽑는다. 라우트별 모양이 달라 여기서 가른다. */
function itemCounts(path: string, body: Record<string, unknown>): Record<string, number> {
  if (path.startsWith('/api/flights')) {
    const arrivals = Array.isArray(body.arrivals) ? body.arrivals.length : 0;
    const departures = Array.isArray(body.departures) ? body.departures.length : 0;
    return { arrivals, departures };
  }
  // /api/status: 터미널별 주차장 수 합. 모양이 바뀌어도 던지지 않게 방어적으로 읽는다.
  const terminals = Array.isArray(body.terminals) ? body.terminals : [];
  let lots = 0;
  for (const t of terminals) {
    if (t && typeof t === 'object' && Array.isArray((t as { lots?: unknown[] }).lots)) {
      lots += (t as { lots: unknown[] }).lots.length;
    }
  }
  return { terminals: terminals.length, parkingLots: lots };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // fail closed: 시크릿 미설정 자체를 실패로 본다(공개 노출 방지).
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET 이 설정되지 않았습니다 (fail closed).' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: '인증 실패' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // 순차로 예열(동시성 불필요, 업스트림 부하 최소화).
  const results: Record<string, unknown>[] = [];
  for (const path of TARGETS) {
    results.push(await warmOne(path));
  }

  const allOk = results.every((r) => r.ok === true);
  return NextResponse.json(
    { ok: allOk, warmedAt: new Date().toISOString(), results },
    { status: allOk ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
  );
}
