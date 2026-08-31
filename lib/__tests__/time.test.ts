import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseKstStamp, formatKstClock, freshnessLabel, isStaleObservation } from '../time';

describe('parseKstStamp — KST 벽시계를 UTC 인스턴트로', () => {
  it('datetm(.mmm) 과 occurtime 형식을 모두 받는다', () => {
    const withMs = parseKstStamp('20260831193627.000');
    const withoutMs = parseKstStamp('20260831193627');
    assert.equal(withMs, withoutMs);
  });

  it('KST 19:36:27 = UTC 10:36:27 (9시간 차)', () => {
    const epoch = parseKstStamp('20260831193627');
    // 같은 순간을 UTC 로 조립하면 10:36:27 이어야 한다.
    assert.equal(epoch, Date.UTC(2026, 7, 31, 10, 36, 27));
  });

  it('존재하지 않는 날짜(2월 31일)는 null', () => {
    assert.equal(parseKstStamp('20260231120000'), null);
  });

  it('자리 수가 안 맞으면 null', () => {
    assert.equal(parseKstStamp('202608'), null);
    assert.equal(parseKstStamp(''), null);
    assert.equal(parseKstStamp(undefined), null);
    assert.equal(parseKstStamp(null), null);
  });
});

describe('formatKstClock', () => {
  it('UTC 인스턴트를 KST 벽시계로 되돌린다', () => {
    const epoch = parseKstStamp('20260831193627')!;
    assert.equal(formatKstClock(epoch), '19:36');
  });

  it('자정 경계: KST 00:05 는 UTC 전날 15:05 이지만 00:05 로 표시', () => {
    const epoch = parseKstStamp('20260831000500')!;
    assert.equal(formatKstClock(epoch), '00:05');
  });
});

describe('freshnessLabel / isStaleObservation', () => {
  const base = parseKstStamp('20260831120000')!;
  it('1분 미만은 방금 전', () => {
    assert.equal(freshnessLabel(base, base + 30_000), '방금 전');
  });
  it('분/시간 단위', () => {
    assert.equal(freshnessLabel(base, base + 5 * 60_000), '5분 전');
    assert.equal(freshnessLabel(base, base + 2 * 3600_000), '2시간 전');
  });
  it('10분 초과면 stale', () => {
    assert.equal(isStaleObservation(base, base + 9 * 60_000), false);
    assert.equal(isStaleObservation(base, base + 11 * 60_000), true);
  });
});
