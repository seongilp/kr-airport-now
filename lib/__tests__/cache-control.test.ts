import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { swrCacheControl } from '../cache-control';
import { secondsUntilKstMidnight } from '../time';

/** KST 벽시계 시:분 → UTC epoch(ms). 결정적 테스트용. */
function kst(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h, mi, 0) - 9 * 60 * 60 * 1000;
}

function parse(cc: string): { sMaxage: number; swr: number } {
  const s = /s-maxage=(\d+)/.exec(cc);
  const w = /stale-while-revalidate=(\d+)/.exec(cc);
  assert.ok(s && w, `헤더 파싱 실패: ${cc}`);
  return { sMaxage: Number(s![1]), swr: Number(w![1]) };
}

describe('secondsUntilKstMidnight', () => {
  it('KST 자정 정각이면 하루(86400)를 준다', () => {
    assert.equal(secondsUntilKstMidnight(kst(2026, 9, 2, 0, 0)), 86400);
  });

  it('KST 23:00 이면 3600 을 준다', () => {
    assert.equal(secondsUntilKstMidnight(kst(2026, 9, 2, 23, 0)), 3600);
  });

  it('항상 1 이상(자정 직전에도 0 이 아니다)', () => {
    const s = secondsUntilKstMidnight(kst(2026, 9, 2, 23, 59) + 59_000);
    assert.ok(s >= 1, `${s}`);
  });
});

describe('swrCacheControl', () => {
  it('낮에는 s-maxage=baseTtl, stale 창은 자정까지 남은 나머지', () => {
    const now = kst(2026, 9, 2, 10, 0); // 자정까지 14시간 = 50400초
    const { sMaxage, swr } = parse(swrCacheControl(900, now));
    assert.equal(sMaxage, 900);
    assert.equal(swr, 50400 - 900);
  });

  it('s-maxage + swr 는 정확히 자정까지 남은 초 — stale 이 자정을 넘지 않는다', () => {
    for (const [h, mi] of [
      [0, 0],
      [10, 30],
      [23, 45],
    ] as const) {
      const now = kst(2026, 9, 2, h, mi);
      const { sMaxage, swr } = parse(swrCacheControl(900, now));
      assert.equal(sMaxage + swr, secondsUntilKstMidnight(now), `${h}:${mi}`);
    }
  });

  it('자정 근처에선 s-maxage 가 baseTtl 아래로 줄어든다(신선 값도 자정을 안 넘게)', () => {
    const now = kst(2026, 9, 2, 23, 55); // 자정까지 300초 < baseTtl 900
    const { sMaxage, swr } = parse(swrCacheControl(900, now));
    assert.equal(sMaxage, 300);
    assert.equal(swr, 0);
  });
});
