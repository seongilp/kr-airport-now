/**
 * 전국 공항 레지스트리. **순수 데이터만.**
 *
 * 설계 판단 — 공항별 데이터 비대칭:
 *  - **인천(ICN)** 은 인천국제공항공사(IIAC, B551177) 소관이라 주차·출국장·지도라는
 *    고유 데이터가 있다. 대신 한국공항공사(KAC, B551178) 전국 운항현황에는 인천이
 *    **구조적으로 없다**(KAC 가 인천을 운영하지 않는다 — 실측에서 `airport=인천` 이 0건).
 *  - **그 외 공항** 은 KAC 소관이라 B551178 운항현황(도착·출발)을 받는다. 주차/출국장
 *    상세는 없다.
 *  그래서 공항마다 '가진 것' 이 다르다 — 인천은 운항 보드 대신 주차/출국장/지도,
 *  나머지는 운항 보드. 이 파일의 `kind` 가 그 갈림을 한 곳에서 못 박는다.
 *
 * `query` 는 B551178 `airport=` 필터에 넣는 한글명이다. 실측상 부분일치(`김포` 가
 * `서울/김포` 를 잡음)라 짧은 이름을 쓴다. 인천은 B551178 을 안 쓰므로 query 가 없다.
 */

export type AirportKind =
  /** 인천: 주차·출국장·지도(B551177). 운항 보드 없음. */
  | 'incheon'
  /** 한국공항공사 전국 공항: 운항 보드(B551178). */
  | 'kac';

export interface Airport {
  /** IATA 코드. 상태/URL 키로 쓴다. */
  code: string;
  /** 표시명. */
  name: string;
  /** 어느 데이터 소스를 쓰는지. */
  kind: AirportKind;
  /** B551178 `airport=` 필터에 넣을 한글명(kac 만). */
  query?: string;
}

/**
 * 국내 민간공항. 인천을 맨 앞(기본값)에 둔다 — 트래픽이 가장 많고 고유 기능이 깊다.
 * 나머지는 대략 운항량 순.
 */
export const AIRPORTS: Airport[] = [
  { code: 'ICN', name: '인천', kind: 'incheon' },
  { code: 'GMP', name: '김포', kind: 'kac', query: '김포' },
  { code: 'CJU', name: '제주', kind: 'kac', query: '제주' },
  { code: 'PUS', name: '김해', kind: 'kac', query: '김해' },
  { code: 'TAE', name: '대구', kind: 'kac', query: '대구' },
  { code: 'CJJ', name: '청주', kind: 'kac', query: '청주' },
  { code: 'KWJ', name: '광주', kind: 'kac', query: '광주' },
  { code: 'RSU', name: '여수', kind: 'kac', query: '여수' },
  { code: 'USN', name: '울산', kind: 'kac', query: '울산' },
  { code: 'MWX', name: '무안', kind: 'kac', query: '무안' },
  { code: 'HIN', name: '사천', kind: 'kac', query: '사천' },
  { code: 'KUV', name: '군산', kind: 'kac', query: '군산' },
  { code: 'WJU', name: '원주', kind: 'kac', query: '원주' },
  { code: 'KPO', name: '포항', kind: 'kac', query: '포항' },
  { code: 'YNY', name: '양양', kind: 'kac', query: '양양' },
];

export const DEFAULT_AIRPORT_CODE = 'ICN';

const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

/** 코드로 공항을 찾는다. 없으면 null(입력 검증용). */
export function findAirport(code: string | null | undefined): Airport | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}
