/**
 * 인천국제공항공사(IIAC) 여객편 상세 B551177/StatusOfPassengerFlightsDeOdp 클라이언트.
 * **서버 전용.** 인천은 KAC 전국현황(B551178)에 없어(구조적 부재) 여기로 받는다.
 * 봉투/오류/키/페이지 순회는 dgk-api 공용. 인천 전용이라 공항 필터가 없다.
 *
 * 실측으로 확정한 규칙 (다음 사람이 또 헤매지 않게):
 *  - **`searchday` + `from_time`/`to_time` 를 반드시 함께** 쓴다. 이 서비스는 하루가 아니라
 *    **며칠치(약 11,700건)** 를 주는데, `from_time` 만으로는 다중일 전체에서 시간대만 걸러
 *    거의 안 줄어든다(11,763→10,667). `searchday` 로 날짜를 먼저 고정해야 1페이지 수준으로
 *    떨어진다(오늘+창 → 도착 ~185, 출발 ~205, 실측).
 *  - **쿼터가 500/일로 KAC(5,000)의 1/10.** 그래서 상위 flight-status 가 TTL 을 길게(15분)
 *    잡고 페이지 상한을 2로 둔다 — 근거는 flight-status.ts 주석.
 *  - 필드 케이싱이 KAC 와 다르다(`scheduleDateTime` — D·T 대문자). flights.ts 의 케이스 무관
 *    pick 이 그대로 흡수한다.
 */

import 'server-only';
import { serviceKey, fetchAllPages, ROWS, type DgkFetchResult } from './dgk-api';
import type { FlightDirection } from './flights';

const BASE = 'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp';

export interface IiacQuery {
  direction: FlightDirection;
  /** YYYYMMDD (KST 오늘). */
  searchday: string;
  /** HHMM. */
  fromTime: string;
  /** HHMM. */
  toTime: string;
}

function buildUrl(q: IiacQuery, pageNo: number): string {
  const op =
    q.direction === 'arrival' ? 'getPassengerArrivalsDeOdp' : 'getPassengerDeparturesDeOdp';
  return (
    `${BASE}/${op}` +
    `?serviceKey=${serviceKey()}` +
    `&numOfRows=${ROWS}&pageNo=${pageNo}&type=json` +
    `&searchday=${q.searchday}` +
    `&from_time=${q.fromTime}&to_time=${q.toTime}`
  );
}

/**
 * 인천 여객편 한 방향을 시간창 안에서 받는다.
 * @param maxPages 쿼터 보호용 페이지 상한(호출자가 결정).
 * @param revalidate Next Data Cache TTL(초).
 */
export async function fetchIiacFlights(
  q: IiacQuery,
  maxPages: number,
  revalidate: number,
): Promise<DgkFetchResult> {
  return fetchAllPages((page) => buildUrl(q, page), q.direction, maxPages, revalidate);
}

export { ROWS };
