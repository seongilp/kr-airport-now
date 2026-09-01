import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyByAirportCode,
  countryToRegion,
  flagEmoji,
} from '../regions';
import { parseAirlineCode, airlineBadgeColor } from '../airlines';

/* --------------------- 편명 → 항공사 코드 파서 (숫자 섞인 코드) --------------------- */

test('항공사 코드 — 영문 2자', () => {
  assert.equal(parseAirlineCode('KE5031'), 'KE');
  assert.equal(parseAirlineCode('OZ577'), 'OZ');
  assert.equal(parseAirlineCode('DL7811'), 'DL');
});

test('항공사 코드 — 숫자+영문(7C·9C·5J)이 깨지지 않는다', () => {
  assert.equal(parseAirlineCode('7C2401'), '7C');
  assert.equal(parseAirlineCode('9C8790'), '9C');
  assert.equal(parseAirlineCode('5J123'), '5J');
});

test('항공사 코드 — 영문+숫자(B7)', () => {
  assert.equal(parseAirlineCode('B7301'), 'B7');
});

test('항공사 코드 — 진에어 LJ, 편수 붙어도', () => {
  assert.equal(parseAirlineCode('LJ265'), 'LJ');
});

test('항공사 코드 — 편명 없거나 형식 아니면 null(억지로 만들지 않는다)', () => {
  assert.equal(parseAirlineCode(''), null);
  assert.equal(parseAirlineCode(null), null);
  assert.equal(parseAirlineCode('KE'), null); // 뒤에 편수 숫자가 없으면 코드로 확정 안 함
});

test('배지 색 — 같은 코드는 항상 같은 색(결정적)', () => {
  assert.deepEqual(airlineBadgeColor('KE'), airlineBadgeColor('KE'));
  assert.notEqual(airlineBadgeColor('KE').background, airlineBadgeColor('OZ').background);
});

/* --------------------- 국가 → 권역 경계값 --------------------- */

test('권역 — 일본', () => {
  assert.equal(countryToRegion('JP'), '일본');
});

test('권역 — 동남아(태국·베트남·싱가포르·필리핀 등)', () => {
  for (const c of ['TH', 'VN', 'SG', 'PH', 'ID', 'KH', 'LA', 'MY']) {
    assert.equal(countryToRegion(c), '동남아', `${c} 는 동남아`);
  }
});

test('권역 — 미국(본토 + 괌·사이판 미국령)', () => {
  assert.equal(countryToRegion('US'), '미국');
  assert.equal(countryToRegion('GU'), '미국');
  assert.equal(countryToRegion('MP'), '미국');
});

test('권역 — 유럽', () => {
  for (const c of ['IT', 'FR', 'GB', 'DE', 'NL', 'FI']) {
    assert.equal(countryToRegion(c), '유럽', `${c} 는 유럽`);
  }
});

test('권역 — 중화권(중국·홍콩·대만·마카오)', () => {
  for (const c of ['CN', 'HK', 'TW', 'MO']) {
    assert.equal(countryToRegion(c), '중화권', `${c} 는 중화권`);
  }
});

test('권역 — 기타(한국·중앙아시아·캐나다·호주·튀르키예·러시아·중동)', () => {
  for (const c of ['KR', 'KZ', 'KG', 'CA', 'AU', 'NZ', 'TR', 'RU', 'AE', 'QA']) {
    assert.equal(countryToRegion(c), '기타', `${c} 는 기타`);
  }
});

/* --------------------- 공항 코드 → 권역/국기 (실제 관측 코드) --------------------- */

test('공항 코드 — 일본 공항(FUK·NRT·KIX)은 일본 + 🇯🇵', () => {
  for (const code of ['FUK', 'NRT', 'KIX', 'CTS', 'OKA']) {
    const info = classifyByAirportCode(code);
    assert.equal(info.region, '일본', `${code}`);
    assert.equal(info.flag, '🇯🇵');
    assert.equal(info.mapped, true);
  }
});

test('공항 코드 — 동남아(BKK·DAD·SIN)', () => {
  assert.equal(classifyByAirportCode('BKK').region, '동남아');
  assert.equal(classifyByAirportCode('DAD').region, '동남아');
  assert.equal(classifyByAirportCode('SIN').region, '동남아');
});

test('공항 코드 — 미국(LAX·JFK)과 괌(GUM)은 미국', () => {
  assert.equal(classifyByAirportCode('LAX').region, '미국');
  assert.equal(classifyByAirportCode('JFK').region, '미국');
  const gum = classifyByAirportCode('GUM');
  assert.equal(gum.region, '미국');
  assert.equal(gum.country, 'GU'); // 국기는 괌으로(정확), 권역만 미국으로 접는다
  assert.equal(gum.flag, '🇬🇺');
});

test('공항 코드 — 중화권(홍콩·대만·마카오·중국)은 중화권 + 각 국기', () => {
  const hkg = classifyByAirportCode('HKG');
  assert.equal(hkg.region, '중화권');
  assert.equal(hkg.mapped, true);
  assert.equal(hkg.flag, '🇭🇰');
  assert.equal(classifyByAirportCode('TPE').region, '중화권'); // 대만
  assert.equal(classifyByAirportCode('MFM').region, '중화권'); // 마카오
  assert.equal(classifyByAirportCode('PEK').region, '중화권'); // 베이징(중국)
  assert.equal(classifyByAirportCode('PVG').country, 'CN');
});

test('공항 코드 — 알마티(중앙아)는 기타', () => {
  assert.equal(classifyByAirportCode('ALA').region, '기타');
});

test('공항 코드 — 캐나다(YVR)는 미국이 아니라 기타', () => {
  assert.equal(classifyByAirportCode('YVR').region, '기타');
  assert.equal(classifyByAirportCode('YVR').country, 'CA');
});

test('공항 코드 — 국내선(CJU·GMP·PUS)은 기타 권역이되 🇰🇷 를 준다', () => {
  for (const code of ['CJU', 'GMP', 'PUS', 'TAE']) {
    const info = classifyByAirportCode(code);
    assert.equal(info.region, '기타', `${code}`);
    assert.equal(info.flag, '🇰🇷');
    assert.equal(info.mapped, true);
  }
});

test('공항 코드 — 미매핑은 기타 + 국기 없음 + mapped=false(결측을 값인 척하지 않는다)', () => {
  const info = classifyByAirportCode('ZZZ');
  assert.equal(info.region, '기타');
  assert.equal(info.flag, null);
  assert.equal(info.country, null);
  assert.equal(info.mapped, false);
  // 코드 자체가 없을 때도 동일
  assert.equal(classifyByAirportCode(null).mapped, false);
  assert.equal(classifyByAirportCode(null).flag, null);
});

test('국기 이모지 — ISO2 → 리저널 인디케이터', () => {
  assert.equal(flagEmoji('JP'), '🇯🇵');
  assert.equal(flagEmoji('KR'), '🇰🇷');
  assert.equal(flagEmoji('US'), '🇺🇸');
  assert.equal(flagEmoji('X'), null);
});
