/**
 * 한국공항공사(KAC) 전국 운항현황 B551178/flight-status 클라이언트. **서버 전용.**
 * 봉투/오류/키/페이지 순회는 dgk-api 로 공용화하고, 여기는 URL 조립만 담당한다.
 *
 * 실측으로 확정한 이 서비스만의 규칙:
 *  - **`searchday`(오늘 YYYYMMDD) 를 반드시 명시.** 미지정이면 오늘이 아니라 축적분(며칠치)이 섞임.
 *  - **`airport=<한글명>`** 으로 공항 필터(부분일치 — `김포` 가 `서울/김포` 를 잡음).
 *  - **`from_time`/`to_time` 는 HHMM(4자리).** 근시간대만 받아 쿼터를 아낀다.
 *  - **인천(ICN)은 이 서비스에 없다**(KAC 가 인천을 운영하지 않는다). 인천은 iiac-api 를 쓴다.
 */

import 'server-only';
import { serviceKey, fetchAllPages, ROWS, type DgkFetchResult } from './dgk-api';
import type { FlightDirection } from './flights';

const BASE = 'https://apis.data.go.kr/B551178/flight-status';

/** 한 조회에서 받을 최대 페이지. 시간창을 좁혔으므로 보통 1페이지지만, 붐비는 공항 대비 3. */
const MAX_PAGES = 3;

export interface KacQuery {
  direction: FlightDirection;
  /** `airport=` 에 넣을 한글명. */
  airportQuery: string;
  /** YYYYMMDD (KST 오늘). */
  searchday: string;
  /** HHMM. */
  fromTime: string;
  /** HHMM. */
  toTime: string;
}

/** serviceKey verbatim + 나머지 파라미터만 안전하게 붙인다. 한글은 인코딩. */
function buildUrl(q: KacQuery, pageNo: number): string {
  const path = q.direction === 'arrival' ? 'arrival' : 'depart';
  const ap = encodeURIComponent(q.airportQuery);
  return (
    `${BASE}/${path}` +
    `?serviceKey=${serviceKey()}` +
    `&numOfRows=${ROWS}&pageNo=${pageNo}&type=json` +
    `&searchday=${q.searchday}` +
    `&airport=${ap}` +
    `&from_time=${q.fromTime}&to_time=${q.toTime}`
  );
}

/**
 * 한 공항의 한 방향(도착/출발) 항공편을 시간창 안에서 받는다.
 * @param revalidate Next Data Cache TTL(초). 인스턴스 간 업스트림 호출을 억제한다.
 */
export async function fetchFlights(q: KacQuery, revalidate: number): Promise<DgkFetchResult> {
  return fetchAllPages((page) => buildUrl(q, page), q.direction, MAX_PAGES, revalidate);
}
