import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseKstStamp,
  formatKstClock,
  freshnessLabel,
  isStaleObservation,
  kstSearchday,
  kstFlightWindow,
} from '../time';

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

describe('kstSearchday / kstFlightWindow', () => {
  // KST 2026-08-31 14:30 = UTC 2026-08-31 05:30
  const kstAfternoon = Date.UTC(2026, 7, 31, 5, 30);

  it('searchday 는 KST 날짜(UTC 자정 넘김 방어)', () => {
    assert.equal(kstSearchday(kstAfternoon), '20260831');
    // KST 00:30 = UTC 전날 15:30 — 날짜가 밀리면 안 된다.
    const kstMidnight = Date.UTC(2026, 7, 30, 15, 30); // KST 8/31 00:30
    assert.equal(kstSearchday(kstMidnight), '20260831');
  });

  it('시간창은 지금 기준 뒤로/앞으로 HHMM', () => {
    const w = kstFlightWindow(kstAfternoon, 1, 6); // 14:30 → 13:30~20:30
    assert.equal(w.from, '1330');
    assert.equal(w.to, '2030');
  });

  it('시간창은 당일 경계로 자른다(자정 넘김 방지)', () => {
    const kstLate = Date.UTC(2026, 7, 31, 13, 0); // KST 22:00
    const w = kstFlightWindow(kstLate, 1, 6); // 21:00~(28:00→23:59)
    assert.equal(w.from, '2100');
    assert.equal(w.to, '2359');
    const kstEarly = Date.UTC(2026, 7, 30, 15, 30); // KST 00:30
    const w2 = kstFlightWindow(kstEarly, 2, 6); // (-1:30→00:00)~06:30
    assert.equal(w2.from, '0000');
    assert.equal(w2.to, '0630');
  });
});
