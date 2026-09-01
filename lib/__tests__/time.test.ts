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

  it('버킷팅 — 같은 15분 버킷 안에서는 창(=URL)이 동일하다', () => {
    // KST 14:31, 14:37, 14:44 는 모두 14:30 버킷 → 창이 같아야 Data Cache 가 공유된다.
    const at = (h: number, mi: number) => Date.UTC(2026, 7, 31, h - 9, mi); // KST h:mi
    const base = kstFlightWindow(at(14, 30), 1, 6);
    for (const mi of [31, 37, 44]) {
      const w = kstFlightWindow(at(14, mi), 1, 6);
      assert.deepEqual(w, base, `14:${mi} 는 14:30 버킷과 같아야 한다`);
    }
    assert.equal(base.from, '1330');
    assert.equal(base.to, '2030');
  });

  it('버킷팅 — 버킷 경계를 넘으면 창이 15분 전진한다', () => {
    const at = (h: number, mi: number) => Date.UTC(2026, 7, 31, h - 9, mi);
    const b1 = kstFlightWindow(at(14, 44), 1, 6); // 14:30 버킷
    const b2 = kstFlightWindow(at(14, 45), 1, 6); // 14:45 버킷
    assert.equal(b1.from, '1330');
    assert.equal(b2.from, '1345');
    assert.notDeepEqual(b1, b2);
  });

  it('버킷팅 — 임박한 출발편은 절대 창에서 빠지지 않는다(to 는 항상 now 이후)', () => {
    // 버킷이 now 를 최대 15분 앞당겨도 to = 버킷+forward 라 now 보다 훨씬 뒤.
    const at = (h: number, mi: number) => Date.UTC(2026, 7, 31, h - 9, mi);
    const w = kstFlightWindow(at(14, 44), 1, 5); // 버킷 14:30, forward 5h → to 19:30
    const toMin = Number(w.to.slice(0, 2)) * 60 + Number(w.to.slice(2));
    const nowMin = 14 * 60 + 44;
    assert.ok(toMin > nowMin, `to(${w.to}) 가 now(14:44) 이후여야 임박편이 들어온다`);
  });

  it('버킷팅 — 자정 직후(00:07)에도 날짜는 오늘, 창은 00:00 버킷', () => {
    const kst0007 = Date.UTC(2026, 7, 30, 15, 7); // KST 8/31 00:07
    assert.equal(kstSearchday(kst0007), '20260831'); // 전날로 안 밀림
    const w = kstFlightWindow(kst0007, 1, 6); // 버킷 00:00 → from clamp 00:00
    assert.equal(w.from, '0000');
    assert.equal(w.to, '0600');
  });
});
