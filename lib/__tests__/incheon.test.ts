import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  toParkingLot,
  toGate,
  isOperatingNow,
  earliestObservedAt,
} from '../incheon';
import type { RawParking, RawCongestion } from '../incheon-api';

/** KST 2026-08-31 12:00 (한낮) 에 해당하는 UTC epoch. 운영시간 판정을 결정적으로 만든다. */
const NOON = Date.UTC(2026, 7, 31, 3, 0, 0);
/** KST 2026-08-31 03:00 (새벽) — 대부분 게이트가 닫힌 시각. */
const DAWN = Date.UTC(2026, 7, 30, 18, 0, 0);

function park(over: Partial<RawParking>): RawParking {
  return { floor: 'T1 장기 P1 주차장', parking: '1896', parkingarea: '2769', datetm: '20260831120000.000', ...over };
}
function gate(over: Partial<RawCongestion>): RawCongestion {
  return { gateId: 'DG1_A', terminalId: 'P03', waitTime: '8', waitLength: '265', occurtime: '20260831120000', operatingTime: '00:00~24:00', ...over };
}

describe('toParkingLot — 정상', () => {
  it('잔여 = 총 - 주차, 상태 계산', () => {
    const lot = toParkingLot(park({ parking: '1896', parkingarea: '2769' }));
    assert.equal(lot.total, 2769);
    assert.equal(lot.occupied, 1896);
    assert.equal(lot.free, 873);
    assert.equal(lot.state, 'free'); // 68.5% 참
    assert.equal(lot.terminal, 'T1');
    assert.equal(lot.label, '장기 P1 주차장');
    assert.ok(lot.observedAt !== null);
  });

  it('만차: 주차수 >= 총면수 → free 0, full', () => {
    const lot = toParkingLot(park({ parking: '2769', parkingarea: '2769' }));
    assert.equal(lot.free, 0);
    assert.equal(lot.state, 'full');
  });

  it('T2 접두사로 터미널을 가른다', () => {
    const lot = toParkingLot(park({ floor: 'T2 장기 주차장' }));
    assert.equal(lot.terminal, 'T2');
  });
});

describe('toParkingLot — 결측/미운영 함정', () => {
  it('parkingarea=0 은 자리 0개가 아니라 미운영(closed), 잔여를 계산하지 않는다', () => {
    const lot = toParkingLot(park({ parkingarea: '0', parking: '0' }));
    assert.equal(lot.state, 'closed');
    assert.equal(lot.free, null); // 절대 0으로 채우지 않는다
    assert.equal(lot.total, null);
  });

  it('parkingarea 빈 문자열은 정보없음(unknown), 0으로 뭉개지 않는다', () => {
    const lot = toParkingLot(park({ parkingarea: '' }));
    assert.equal(lot.state, 'unknown');
    assert.equal(lot.free, null);
  });

  it('주차수 빈 문자열이면 잔여 불명(unknown)', () => {
    const lot = toParkingLot(park({ parking: '', parkingarea: '2769' }));
    assert.equal(lot.state, 'unknown');
    assert.equal(lot.free, null);
  });

  it('datetm 이 깨지면 observedAt 은 null (시각을 지어내지 않는다)', () => {
    const lot = toParkingLot(park({ datetm: '20260231120000.000' })); // 2월 31일
    assert.equal(lot.observedAt, null);
  });
});

describe('isOperatingNow', () => {
  it('00:00~24:00 은 항상 운영', () => {
    assert.equal(isOperatingNow('00:00~24:00', DAWN), true);
  });
  it('06:00~19:00 은 새벽엔 닫힘, 한낮엔 열림', () => {
    assert.equal(isOperatingNow('06:00~19:00', DAWN), false);
    assert.equal(isOperatingNow('06:00~19:00', NOON), true);
  });
  it('빈 문자열/이상값은 판단 불가(null)', () => {
    assert.equal(isOperatingNow('', NOON), null);
    assert.equal(isOperatingNow('종일', NOON), null);
    assert.equal(isOperatingNow(undefined, NOON), null);
  });
});

describe('toGate — waitTime=0 함정', () => {
  it('운영 중 대기 있음: 그대로 분 표시', () => {
    const g = toGate(gate({ waitTime: '8' }), NOON);
    assert.equal(g.waitMinutes, 8);
    assert.equal(g.state, 'free'); // <=10 원활
  });

  it('운영시간 밖이 명확하면 waitTime 값과 무관하게 미운영(closed)', () => {
    const g = toGate(gate({ waitTime: '0', operatingTime: '06:00~19:00' }), DAWN);
    assert.equal(g.state, 'closed');
    assert.equal(g.waitMinutes, null);
  });

  it('waitTime=0 + operatingTime 빈값 → 대기 0분이 아니라 정보없음(unknown)', () => {
    // 실측: T2 DG2 게이트가 새벽에 waitTime=0·operatingTime="" 로 온다. 닫힌 것이다.
    const g = toGate(gate({ waitTime: '0', operatingTime: '' }), DAWN);
    assert.equal(g.state, 'unknown');
    assert.equal(g.waitMinutes, null); // 0으로 단언하지 않는다
  });

  it('waitTime=0 + 상시운영(00:00~24:00) 이면 대기 없음(free, 0분)', () => {
    const g = toGate(gate({ waitTime: '0', operatingTime: '00:00~24:00' }), NOON);
    assert.equal(g.state, 'free');
    assert.equal(g.waitMinutes, 0);
  });

  it('waitTime 빈 문자열이면 정보없음', () => {
    const g = toGate(gate({ waitTime: '', operatingTime: '00:00~24:00' }), NOON);
    assert.equal(g.state, 'unknown');
    assert.equal(g.waitMinutes, null);
  });

  it('혼잡 임계: 25분 → busy, 45분 → crowded', () => {
    assert.equal(toGate(gate({ waitTime: '25' }), NOON).state, 'busy');
    assert.equal(toGate(gate({ waitTime: '45' }), NOON).state, 'crowded');
  });

  it('게이트 라벨: DG1_A → 1-A, 터미널 P03 → T2', () => {
    const g = toGate(gate({ gateId: 'DG3_E', terminalId: 'P01' }), NOON);
    assert.equal(g.label, '3-E');
    assert.equal(g.terminal, 'T1');
  });
});

describe('earliestObservedAt', () => {
  it('null 을 무시하고 가장 이른 값을 준다', () => {
    assert.equal(earliestObservedAt([300, null, 100, 200]), 100);
  });
  it('전부 null 이면 null', () => {
    assert.equal(earliestObservedAt([null, null]), null);
  });
});
