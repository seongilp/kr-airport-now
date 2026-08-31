/**
 * 한국공항공사(KAC) 전국 운항현황 B551178/flight-status 클라이언트. **서버 전용.**
 *
 * incheon-api.ts 와 같은 함정을 그대로 방어한다(검증된 그 파일은 인천 전용이라 건드리지
 * 않고, 같은 패턴을 여기 독립적으로 둔다):
 *  1. **serviceKey 는 이미 %-인코딩** — verbatim 으로 붙인다. URLSearchParams 금지
 *     (재인코딩되면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 코드 30).
 *  2. **HTTP 200 이 성공이 아니다** — `response.header.resultCode === '00'` 을 확인.
 *  3. `AbortSignal.timeout` 필수.
 *
 * 실측으로 확정한 이 서비스만의 규칙:
 *  - **`searchday`(오늘 YYYYMMDD) 를 반드시 명시.** 미지정이면 오늘이 아니라 축적분(며칠치)
 *    이 섞여 온다.
 *  - **`airport=<한글명>`** 으로 공항 필터(부분일치 — `김포` 가 `서울/김포` 를 잡음).
 *  - **`from_time`/`to_time` 는 HHMM(4자리).** 근시간대만 받아 쿼터를 아낀다.
 *  - **`numOfRows` 는 100 이하.** 300 이면 HTTP_ERROR(코드 04). 그래서 100 씩 순회한다.
 *  - **인천(ICN)은 이 서비스에 없다**(KAC 가 인천을 운영하지 않는다). 인천은 호출하지 않는다.
 */

import 'server-only';
import type { RawFlight, FlightDirection } from './flights';

const BASE = 'https://apis.data.go.kr/B551178/flight-status';

/** 업스트림 응답 제한 시간. incheon-api 와 동일하게 8초. */
const UPSTREAM_TIMEOUT_MS = 8000;

/** 페이지당 행 수. 300 이면 서비스가 거부하므로 100 고정. */
const ROWS = 100;
/** 한 조회에서 받을 최대 페이지. 시간창을 좁혔으므로 보통 1페이지면 충분하다. */
const MAX_PAGES = 3;

export class KacApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'KacApiFailure';
  }
}

function serviceKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim();
  if (!key) {
    throw new KacApiFailure('NO_KEY', 'DATA_GO_KR_KEY 가 설정되지 않았습니다.', 500);
  }
  return key;
}

export interface KacQuery {
  /** 'arrival' | 'departure' → 엔드포인트. */
  direction: FlightDirection;
  /** `airport=` 에 넣을 한글명. */
  airportQuery: string;
  /** YYYYMMDD (KST 오늘). */
  searchday: string;
  /** HHMM. */
  fromTime: string;
  /** HHMM. */
  toTime: string;
  pageNo: number;
}

/** serviceKey verbatim + 나머지 파라미터만 안전하게 붙인다. 한글은 인코딩. */
function buildUrl(q: KacQuery): string {
  const path = q.direction === 'arrival' ? 'arrival' : 'depart';
  const ap = encodeURIComponent(q.airportQuery);
  return (
    `${BASE}/${path}` +
    `?serviceKey=${serviceKey()}` +
    `&numOfRows=${ROWS}&pageNo=${q.pageNo}&type=json` +
    `&searchday=${q.searchday}` +
    `&airport=${ap}` +
    `&from_time=${q.fromTime}&to_time=${q.toTime}`
  );
}

interface Envelope {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      totalCount?: number;
      items?: RawFlight[] | { item?: RawFlight[] | RawFlight } | '';
    };
  };
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string; returnReasonCode?: string };
  };
}

/** items 가 배열 / { item } / 빈문자열 / 단일객체 중 무엇이든 배열로. */
function normalizeItems(
  items: RawFlight[] | { item?: RawFlight[] | RawFlight } | '' | undefined,
): RawFlight[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  const inner = (items as { item?: RawFlight[] | RawFlight }).item;
  if (!inner) return [];
  return Array.isArray(inner) ? inner : [inner];
}

async function fetchPage(
  q: KacQuery,
  revalidate: number,
): Promise<{ items: RawFlight[]; totalCount: number }> {
  const url = buildUrl(q);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate },
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new KacApiFailure('TIMEOUT', `${q.direction}: 업스트림 응답 시간 초과`, 504);
    }
    throw new KacApiFailure('NETWORK', `${q.direction}: 네트워크 오류 (${String(error)})`, 502);
  }

  const text = await response.text();
  let json: Envelope;
  try {
    json = JSON.parse(text);
  } catch {
    throw new KacApiFailure(
      `HTTP_${response.status}`,
      `${q.direction}: JSON 이 아닌 응답 (HTTP ${response.status})`,
      502,
    );
  }

  const auth = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (auth?.errMsg) {
    throw new KacApiFailure(
      auth.returnReasonCode ?? 'AUTH',
      `${q.direction}: ${auth.errMsg} ${auth.returnAuthMsg ?? ''}`.trim(),
      502,
    );
  }

  const header = json.response?.header;
  if (header?.resultCode && header.resultCode !== '00') {
    throw new KacApiFailure(
      header.resultCode,
      `${q.direction}: ${header.resultMsg ?? '알 수 없는 오류'}`,
      502,
    );
  }

  return {
    items: normalizeItems(json.response?.body?.items),
    totalCount: json.response?.body?.totalCount ?? 0,
  };
}

export interface KacFetchResult {
  items: RawFlight[];
  totalCount: number;
  /** 서버가 업스트림 응답을 받은 시각(ISO). */
  fetchedAt: string;
}

/**
 * 한 공항의 한 방향(도착/출발) 항공편을, 시간창 안에서 페이지를 순회해 모은다.
 * 시간창을 좁혔으므로 보통 1페이지지만, 붐비는 공항(제주 등)을 위해 MAX_PAGES 까지.
 *
 * @param revalidate Next Data Cache TTL(초). 인스턴스 간 업스트림 호출을 억제한다.
 */
export async function fetchFlights(
  base: Omit<KacQuery, 'pageNo'>,
  revalidate: number,
): Promise<KacFetchResult> {
  const first = await fetchPage({ ...base, pageNo: 1 }, revalidate);
  const items = [...first.items];
  const totalCount = first.totalCount;
  const totalPages = Math.min(MAX_PAGES, Math.ceil(totalCount / ROWS) || 1);

  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage({ ...base, pageNo: page }, revalidate);
    items.push(...next.items);
  }

  return { items, totalCount, fetchedAt: new Date().toISOString() };
}
