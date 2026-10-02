import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toFlight } from '../flights';
import { inCargoWindow, withCargoTerminal } from '../cargo';

const at = (hhmm: string) => toFlight({ flightId: 'X', scheduleDatetime: `20261002${hhmm}` }, 'departure');
// 2026-10-02 12:00 KST
const NOW = Date.UTC(2026, 9, 2, 3, 0);

test('inCargoWindow — 1시간 전부터 12시간 뒤까지만', () => {
  assert.equal(inCargoWindow(at('1030'), NOW), false);
  assert.equal(inCargoWindow(at('1100'), NOW), true);
  assert.equal(inCargoWindow(at('2359'), NOW), true);
});

test('inCargoWindow — 변경 시각이 창 안이면 예정이 지났어도 남긴다', () => {
  const late = toFlight(
    { flightId: 'X', scheduleDatetime: '202610020900', estimatedDatetime: '202610021230' },
    'departure',
  );
  assert.equal(inCargoWindow(late, NOW), true);
});

test('withCargoTerminal — 원본을 바꾸지 않고 T1/T2 를 붙인다', () => {
  const f = at('1300');
  const g = withCargoTerminal(f, 'T2');
  assert.equal(g.terminal, 'T2');
  assert.notEqual(f.terminal, 'T2');
});
