import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toFlight,
  classifyStatus,
  parseFlightStamp,
  sortByScheduled,
  type Flight,
} from '../flights';

/* --------------------- 케이싱: 세 서비스가 다르게 준다 --------------------- */

test('케이싱 — 한국공항공사(전부 소문자) scheduledatetime 을 읽는다', () => {
  const f = toFlight(
    { flightid: 'KE1150', scheduledatetime: '202608310900', rmkKor: '출발', airline: '대한항공' },
    'departure',
  );
  assert.equal(f.flightId, 'KE1150');
  assert.notEqual(f.scheduledAt, null);
  assert.equal(f.statusText, '출발');
});

test('케이싱 — 인천 여객기 상세(D·T 대문자) scheduleDateTime 을 읽는다', () => {
  const f = toFlight(
    { flightId: 'IT602', scheduleDateTime: '202608310900', remark: '도착', gatenumber: '114', carousel: '9' },
    'arrival',
  );
  assert.equal(f.flightId, 'IT602');
  assert.notEqual(f.scheduledAt, null, '대문자 케이싱에서도 시각이 파싱돼야 한다');
  assert.equal(f.statusText, '도착');
  assert.equal(f.gate, '114');
  assert.equal(f.carousel, '9');
});

test('케이싱 — 인천 항공기 상세(t 소문자) scheduleDatetime 을 읽는다', () => {
  const f = toFlight({ flightId: 'OZ201', scheduleDatetime: '202608310900' }, 'departure');
  assert.notEqual(f.scheduledAt, null, 't 소문자 케이싱에서도 시각이 파싱돼야 한다');
});

/* --------------------- 상대 공항: 방향·서비스별 필드명 --------------------- */

test('상대 공항 — B551178 도착은 출발지(depAirport)', () => {
  const f = toFlight(
    { flightid: 'TW664', depAirport: '타이페이/타오위안', depAirportCode: 'TPE' },
    'arrival',
  );
  assert.equal(f.counterpartName, '타이페이/타오위안');
  assert.equal(f.counterpartCode, 'TPE');
});

test('상대 공항 — B551178 출발은 목적지, 코드는 arrvAirportCode(v)', () => {
  const f = toFlight(
    { flightid: 'WE6501', arrAirport: '제주', arrvAirportCode: 'CJU' },
    'departure',
  );
  assert.equal(f.counterpartName, '제주');
  assert.equal(f.counterpartCode, 'CJU', 'arrvAirportCode(v 포함)을 잡아야 한다');
});

test('상대 공항 — B551177 은 airport/airportCode 하나로 방향에 맞게', () => {
  const arr = toFlight({ flightId: 'IT602', airport: '타이베이', airportCode: 'TPE' }, 'arrival');
  assert.equal(arr.counterpartName, '타이베이');
  assert.equal(arr.counterpartCode, 'TPE');
  const dep = toFlight({ flightId: 'KE1', airport: '방콕', airportCode: 'BKK' }, 'departure');
  assert.equal(dep.counterpartName, '방콕');
  assert.equal(dep.counterpartCode, 'BKK');
});

/* --------------------- 결측을 결측으로 --------------------- */

test('결측 — 상태 원문이 비면 미정(unknown), 정상으로 뭉개지 않는다', () => {
  const f = toFlight({ flightid: 'ZZ1', scheduledatetime: '202608310900', rmkKor: '' }, 'departure');
  assert.equal(f.statusText, null);
  assert.equal(f.status, 'unknown');
});

test('결측 — 게이트가 없으면 null(0이나 빈값을 지어내지 않는다)', () => {
  const f = toFlight({ flightid: 'ZZ1', scheduledatetime: '202608310900' }, 'departure');
  assert.equal(f.gate, null);
  assert.equal(f.carousel, null);
});

/* --------------------- 상태 분류 --------------------- */

test('classifyStatus — 결항/지연/도착/출발/탑승/미정', () => {
  assert.equal(classifyStatus('결항'), 'cancelled');
  assert.equal(classifyStatus('사전결항'), 'cancelled');
  assert.equal(classifyStatus('지연'), 'delayed');
  assert.equal(classifyStatus('도착'), 'arrived');
  assert.equal(classifyStatus('출발'), 'departed');
  assert.equal(classifyStatus('탑승중'), 'boarding');
  assert.equal(classifyStatus(''), 'unknown');
  assert.equal(classifyStatus(null), 'unknown');
});

/* --------------------- 시각 파싱 --------------------- */

test('parseFlightStamp — 12자리와 14자리를 모두 KST 로 파싱', () => {
  const a = parseFlightStamp('202608310900'); // 12자리
  const b = parseFlightStamp('20260831090000'); // 14자리(초 00)
  assert.equal(a, b, '12자리와 14자리(초 00)가 같은 인스턴트여야 한다');
  // KST 09:00 → UTC 00:00
  assert.equal(new Date(a as number).getUTCHours(), 0);
});

test('parseFlightStamp — 4자리(HHMM)나 잘못된 값은 null', () => {
  assert.equal(parseFlightStamp('0900'), null);
  assert.equal(parseFlightStamp(''), null);
  assert.equal(parseFlightStamp(null), null);
});

test('delayMinutes — 예상이 예정보다 늦으면 양수', () => {
  const f = toFlight(
    { flightid: 'KE1', scheduledatetime: '202608310900', estimateddatetime: '202608310915' },
    'departure',
  );
  assert.equal(f.delayMinutes, 15);
});

/* --------------------- 정렬 --------------------- */

test('sortByScheduled — 시각 오름차순, 결측은 뒤로', () => {
  const flights: Flight[] = [
    toFlight({ flightid: 'B', scheduledatetime: '202608311000' }, 'departure'),
    toFlight({ flightid: 'X' }, 'departure'), // 시각 결측
    toFlight({ flightid: 'A', scheduledatetime: '202608310900' }, 'departure'),
  ];
  const sorted = sortByScheduled(flights);
  assert.deepEqual(
    sorted.map((f) => f.flightId),
    ['A', 'B', 'X'],
  );
});
