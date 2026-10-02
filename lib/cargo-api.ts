/**
 * 인천국제공항공사 화물기 운항 현황 상세(터미널별) 클라이언트. **서버 전용.**
 *   T1: B551177/statusOfCgoFltDeOdpT1 (data.go.kr 15168220)
 *   T2: B551177/statusOfCgoFltDeOdpT2 (data.go.kr 15168252)
 *
 * 키 주의: 이 두 서비스는 **다른 data.go.kr 계정**으로 신청했다(여객·주차는 DATA_GO_KR_KEY 계정).
 * 그래서 `DATA_GO_KR_CARGO_KEY` 를 따로 읽는다. 인코딩 키를 verbatim 으로 붙인다(재인코딩하면 code 30).
 *
 * 파라미터는 여객 상세와 이름이 다르다: `searchDate`(YYYYMMDD) / `searchFrom`·`searchTo` / `searchdtCode`.
 * 화물기는 하루 편수가 적어 날짜만 고정해 하루치를 받고, 시간창은 lib/cargo.ts 가 자른다.
 */

import 'server-only';
import { DgkApiFailure, fetchAllPages, ROWS, type DgkFetchResult } from './dgk-api';
import type { CargoTerminal } from './cargo';
import type { FlightDirection } from './flights';

function cargoKey(): string {
  const key = process.env.DATA_GO_KR_CARGO_KEY?.trim();
  if (!key) throw new DgkApiFailure('NO_KEY', 'DATA_GO_KR_CARGO_KEY 가 설정되지 않았습니다.', 500);
  return key;
}

function buildUrl(terminal: CargoTerminal, direction: FlightDirection, searchDate: string, pageNo: number): string {
  const op = direction === 'arrival' ? `getCgoFltArrivalsDeOdp${terminal}` : `getCgoFltDeparturesDeOdp${terminal}`;
  return (
    `https://apis.data.go.kr/B551177/statusOfCgoFltDeOdp${terminal}/${op}` +
    `?serviceKey=${cargoKey()}` +
    `&numOfRows=${ROWS}&pageNo=${pageNo}&type=json` +
    `&searchDate=${searchDate}`
  );
}

export function fetchCargoFlights(
  terminal: CargoTerminal,
  direction: FlightDirection,
  searchDate: string,
  maxPages: number,
  revalidate: number,
): Promise<DgkFetchResult> {
  return fetchAllPages(
    (page) => buildUrl(terminal, direction, searchDate, page),
    `화물 ${terminal} ${direction === 'arrival' ? '도착' : '출발'}`,
    maxPages,
    revalidate,
  );
}
