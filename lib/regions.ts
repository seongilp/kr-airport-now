/**
 * 상대 공항 IATA 코드 → 국가 → 권역. **정적 테이블만**(업스트림 조회 없음, 순수 함수).
 *
 * 왜 코드로 매핑하나: 운항 API 는 상대 공항을 **IATA 3자 코드**(`FUK`·`NRT`·`BKK`)로 준다
 * (lib/flights.ts 의 counterpartCode). 한글 공항명("도쿄/나리타")은 표기가 흔들리지만
 * 코드는 고정이라 훨씬 안전하다. 그래서 이름이 아니라 **코드로만** 국가를 정한다.
 *
 * 결측 원칙(이 프로젝트 최악의 반복 결함 = "결측을 값인 척"): 테이블에 없는 코드는
 * **국기를 억지로 찍지 않는다**(flag=null). 권역은 `기타`로 보내되 mapped=false 로 표시해
 * "권역 미상"과 "진짜 기타(중국·캐나다 등)"를 구분한다. 미매핑 건수는 화면단에서 개발자에게
 * 경고로 남긴다(테이블이 낡아도 조용히 기타에 쌓이지 않게).
 */

/** 사용자가 지정한 5개 권역. 임의로 늘리거나 줄이지 않는다. */
export type Region = '일본' | '동남아' | '미국' | '유럽' | '기타';

/** 칩 노출 순서(전체는 UI에서 앞에 별도로 붙인다). */
export const REGIONS: Region[] = ['일본', '동남아', '미국', '유럽', '기타'];

/**
 * IATA 공항 코드 → 국가 ISO 3166-1 alpha-2.
 * 미국령(괌 GU·사이판 MP)은 실제 지역 국기를 위해 GU/MP 로 두고, 권역만 미국으로 접는다.
 * 실제 응답에서 관측된 코드 + 인천 취항이 잦은 코드 위주. 없는 코드는 unknown(=기타·국기없음).
 */
export const AIRPORT_COUNTRY: Record<string, string> = {
  // 한국(국내선). 국가로는 KR 이라 국기 🇰🇷 는 찍되, 권역은 4개 명명권역에 안 들어가 '기타'.
  ICN: 'KR', GMP: 'KR', CJU: 'KR', PUS: 'KR', TAE: 'KR', USN: 'KR', KWJ: 'KR',
  RSU: 'KR', CJJ: 'KR', MWX: 'KR', HIN: 'KR', KUV: 'KR', WJU: 'KR', KPO: 'KR', YNY: 'KR',

  // 일본
  NRT: 'JP', HND: 'JP', KIX: 'JP', FUK: 'JP', CTS: 'JP', OKA: 'JP', NGO: 'JP',
  KOJ: 'JP', KMJ: 'JP', KKJ: 'JP', FSZ: 'JP', UKB: 'JP', TAK: 'JP', MYJ: 'JP',
  OIT: 'JP', HIJ: 'JP', SDJ: 'JP', KMI: 'JP', ISG: 'JP',

  // 중국(동남아 아님 → 기타). 인천발 비중 큼.
  PEK: 'CN', PKX: 'CN', PVG: 'CN', SHA: 'CN', CAN: 'CN', TAO: 'CN', SHE: 'CN',
  DLC: 'CN', HRB: 'CN', CGQ: 'CN', TFU: 'CN', XIY: 'CN', NKG: 'CN', NGB: 'CN',
  WUX: 'CN', TNA: 'CN', WEH: 'CN', YNT: 'CN', YNJ: 'CN', SJW: 'CN', FOC: 'CN',
  DYG: 'CN', HGH: 'CN', HFE: 'CN', CKG: 'CN', KMG: 'CN', CSX: 'CN', ZUH: 'CN',
  // 홍콩·마카오·대만: 사용자 목록에 없음 → 기타(동남아로 넣지 않는다).
  HKG: 'HK', MFM: 'MO', TPE: 'TW', TSA: 'TW', KHH: 'TW', RMQ: 'TW',

  // 동남아
  BKK: 'TH', DMK: 'TH', HKT: 'TH', CNX: 'TH',
  MNL: 'PH', CEB: 'PH', PPS: 'PH', CRK: 'PH',
  CGK: 'ID', DPS: 'ID', MDC: 'ID',
  SGN: 'VN', HAN: 'VN', DAD: 'VN', CXR: 'VN', PQC: 'VN',
  SIN: 'SG', KUL: 'MY', BKI: 'MY', PEN: 'MY',
  VTE: 'LA', KTI: 'KH', PNH: 'KH', REP: 'KH', RGN: 'MM', BWN: 'BN',

  // 미국(괌·사이판·하와이 포함)
  LAX: 'US', SFO: 'US', SEA: 'US', JFK: 'US', ATL: 'US', DFW: 'US', MSP: 'US',
  SLC: 'US', ORD: 'US', IAD: 'US', BOS: 'US', LAS: 'US', HNL: 'US',
  GUM: 'GU', SPN: 'MP',

  // 유럽
  FCO: 'IT', MXP: 'IT', VCE: 'IT',
  CDG: 'FR', NCE: 'FR',
  LHR: 'GB', LGW: 'GB', MAN: 'GB',
  FRA: 'DE', MUC: 'DE',
  AMS: 'NL', MAD: 'ES', BCN: 'ES', VIE: 'AT', ZRH: 'CH', GVA: 'CH',
  HEL: 'FI', WAW: 'PL', LIS: 'PT', ARN: 'SE', CPH: 'DK', OSL: 'NO',
  DUB: 'IE', PRG: 'CZ', BUD: 'HU', ATH: 'GR', BRU: 'BE', ZAG: 'HR',

  // 기타(중동·중앙아시아·오세아니아·캐나다·튀르키예·러시아 등)
  DXB: 'AE', AUH: 'AE', DOH: 'QA', IST: 'TR', ALA: 'KZ', NQZ: 'KZ', BSZ: 'KG',
  ULN: 'MN', UBN: 'MN', TAS: 'UZ', DEL: 'IN', BOM: 'IN', CMB: 'LK',
  SYD: 'AU', BNE: 'AU', MEL: 'AU', AKL: 'NZ',
  YVR: 'CA', YYZ: 'CA', YYC: 'CA',
  SVO: 'RU', VVO: 'RU',
};

/** 동남아 국가 집합. */
const SOUTHEAST_ASIA = new Set(['TH', 'PH', 'ID', 'VN', 'SG', 'MY', 'LA', 'KH', 'MM', 'BN']);
/** 미국 권역(미국 본토 + 미국령). */
const US_REGION = new Set(['US', 'GU', 'MP']);
/** 유럽 국가 집합. 튀르키예·러시아는 대륙 걸침/정치적 모호로 여기 넣지 않고 기타로 둔다. */
const EUROPE = new Set([
  'IT', 'FR', 'GB', 'DE', 'NL', 'ES', 'AT', 'CH', 'FI', 'PL', 'PT', 'SE',
  'DK', 'NO', 'IE', 'CZ', 'HU', 'GR', 'BE', 'HR',
]);

/** 국가 ISO2 → 권역. 4개 명명 권역에 안 들어가면 기타(한국·중국·홍콩·대만·중동 등). */
export function countryToRegion(country: string): Region {
  if (country === 'JP') return '일본';
  if (SOUTHEAST_ASIA.has(country)) return '동남아';
  if (US_REGION.has(country)) return '미국';
  if (EUROPE.has(country)) return '유럽';
  return '기타';
}

/** ISO2 → 국기 이모지(리저널 인디케이터). 두 글자가 아니면 null. */
export function flagEmoji(country: string): string | null {
  if (!/^[A-Za-z]{2}$/.test(country)) return null;
  const base = 0x1f1e6;
  const cc = country.toUpperCase();
  return (
    String.fromCodePoint(base + cc.charCodeAt(0) - 65) +
    String.fromCodePoint(base + cc.charCodeAt(1) - 65)
  );
}

export interface FlightRegionInfo {
  region: Region;
  /** 국가 ISO2. 미매핑이면 null. */
  country: string | null;
  /** 국기 이모지. 미매핑이면 null(억지로 찍지 않는다). */
  flag: string | null;
  /** 테이블에서 국가를 특정했는지. false 면 '권역 미상'으로 기타에 담긴 것. */
  mapped: boolean;
}

/**
 * 상대 공항 코드 → 권역/국가/국기. 코드가 없거나 테이블에 없으면 국기 없이 기타(mapped=false).
 * 국내선(KR)도 매핑 성공으로 보고 🇰🇷 를 준다 — 권역만 '기타'.
 */
export function classifyByAirportCode(code: string | null): FlightRegionInfo {
  if (!code) return { region: '기타', country: null, flag: null, mapped: false };
  const country = AIRPORT_COUNTRY[code.toUpperCase()] ?? null;
  if (!country) return { region: '기타', country: null, flag: null, mapped: false };
  return {
    region: countryToRegion(country),
    country,
    flag: flagEmoji(country),
    mapped: true,
  };
}
