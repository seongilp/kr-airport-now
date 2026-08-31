/**
 * 인천국제공항공사(data.go.kr B551177) API 클라이언트. **서버 전용.**
 *
 * 실호출로 확정한 함정 — 다음 사람이 또 겪지 않게 전부 적는다.
 *
 *  1. **serviceKey 는 이미 %-인코딩된 문자열이다.** `URLSearchParams` / `new URL().searchParams`
 *     / axios params 객체에 넣으면 `%2B` → `%252B` 처럼 한 번 더 인코딩돼
 *     SERVICE_KEY_IS_NOT_REGISTERED_ERROR(코드 30) 가 난다. 그래서 쿼리스트링을
 *     **문자열로 직접 조립**하고 serviceKey 는 verbatim 으로 붙인다.
 *
 *  2. **HTTP 200 이 성공이 아니다.** 인증 실패도 200 또는 403 으로 오고 본문이
 *     `{ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg } } }` 형태다. 정상 응답은
 *     `response.header.resultCode === '00'`. 이걸 안 보면 조용히 0건이 된다.
 *
 *  3. **응답 지연.** 출국장 T1 은 실측에서 가끔 ~3초까지 튄다(보통 0.8초). 무한정지는
 *     관측되지 않았지만, 서울시 API 가 장애 때 첫 바이트를 영원히 안 보낸 전례가 있어
 *     `AbortSignal.timeout` 을 필수로 건다.
 *
 *  4. `response.body.items` 는 **배열로 온다**(실측). 다만 다른 data.go.kr 서비스는
 *     `{ item: [...] }` 나 빈 문자열로 주는 경우가 있어 세 형태를 모두 방어한다.
 */

const BASE = 'https://apis.data.go.kr/B551177';

/** 실측·승인 확인된 엔드포인트. */
export const ENDPOINTS = {
  parking: 'StatusOfParking/getTrackingParking',
  departureT1: 'statusOfDepartureCongestion/getDepartureCongestion',
  departureT2: 'statusOfDepartureCongestionT2/getDepartureCongestionT2',
} as const;

/** 업스트림 전체 응답 제한 시간. p95 가 3초 미만이라 넉넉하게 8초. */
const UPSTREAM_TIMEOUT_MS = 8000;

export class IncheonApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'IncheonApiFailure';
  }
}

function serviceKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim();
  if (!key) {
    throw new IncheonApiFailure('NO_KEY', 'DATA_GO_KR_KEY 가 설정되지 않았습니다.', 500);
  }
  return key;
}

/** serviceKey 는 이미 인코딩돼 있으므로 verbatim. 나머지 파라미터만 안전하게 붙인다. */
function buildUrl(path: string, rows: number): string {
  return (
    `${BASE}/${path}` +
    `?serviceKey=${serviceKey()}` +
    `&numOfRows=${rows}&pageNo=1&type=json`
  );
}

interface Envelope<T> {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { totalCount?: number; items?: T[] | { item?: T[] | T } | '' };
  };
  /** 인증 오류는 이 형태로 온다. */
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string; returnReasonCode?: string };
  };
}

/** items 가 배열 / { item } / 빈문자열 / 단일객체 중 무엇으로 와도 배열로 정규화. */
function normalizeItems<T>(items: T[] | { item?: T[] | T } | '' | undefined): T[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  const inner = (items as { item?: T[] | T }).item;
  if (!inner) return [];
  return Array.isArray(inner) ? inner : [inner];
}

export interface FetchResult<T> {
  items: T[];
  totalCount: number;
  /** 서버가 업스트림에서 응답을 받은 시각(ISO). 관측 시각(datetm/occurtime)과는 다르다. */
  fetchedAt: string;
}

/**
 * 한 엔드포인트를 호출해 items 를 정규화해 돌려준다.
 * @param revalidate Next Data Cache TTL(초). 0 이면 캐시 안 함.
 */
export async function fetchEndpoint<T>(
  path: string,
  revalidate: number,
  rows = 200,
): Promise<FetchResult<T>> {
  const url = buildUrl(path, rows);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate },
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new IncheonApiFailure('TIMEOUT', `${path}: 업스트림 응답 시간 초과`, 504);
    }
    throw new IncheonApiFailure('NETWORK', `${path}: 네트워크 오류 (${String(error)})`, 502);
  }

  const text = await response.text();
  let json: Envelope<T>;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증 오류 등은 XML 로 오기도 한다. 상태 코드로 말이 되는 메시지를 만든다.
    throw new IncheonApiFailure(
      `HTTP_${response.status}`,
      `${path}: JSON 이 아닌 응답 (HTTP ${response.status})`,
      502,
    );
  }

  // 인증/서비스 오류 봉투
  const auth = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (auth?.errMsg) {
    throw new IncheonApiFailure(
      auth.returnReasonCode ?? 'AUTH',
      `${path}: ${auth.errMsg} ${auth.returnAuthMsg ?? ''}`.trim(),
      502,
    );
  }

  const header = json.response?.header;
  if (header?.resultCode && header.resultCode !== '00') {
    throw new IncheonApiFailure(
      header.resultCode,
      `${path}: ${header.resultMsg ?? '알 수 없는 오류'}`,
      502,
    );
  }

  return {
    items: normalizeItems<T>(json.response?.body?.items),
    totalCount: json.response?.body?.totalCount ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}

/** 주차 원시 레코드. 값은 전부 문자열로 온다. */
export interface RawParking {
  /** 구역명. 예: `T1 단기주차장지하1층`, `T1 장기 P1 주차장` */
  floor: string;
  /** 현재 주차 대수(문자열). */
  parking: string;
  /** 총 주차면수(문자열). **`0` 은 '자리 0개' 가 아니라 '미운영'을 뜻한다.** */
  parkingarea: string;
  /** 수집 시각. `YYYYMMDDHHMMSS.mmm` (KST). */
  datetm: string;
}

/** 출국장 혼잡도 원시 레코드. */
export interface RawCongestion {
  /** 게이트 식별자. 예: `DG1_A`, `DG3_E` */
  gateId: string;
  /** 터미널/구역 식별자. 예: `P01`(T1), `P03`(T2) */
  terminalId: string;
  /** 예상 대기시간(분, 문자열). **`0` 은 '대기 없음' 일 수도, 닫힌 게이트일 수도 있다.** */
  waitTime: string;
  /** 대기 줄 길이(문자열). */
  waitLength: string;
  /** 관측 시각. `YYYYMMDDHHMMSS` (KST). */
  occurtime: string;
  /** 운영 시간. 예: `06:00~19:00`, `00:00~24:00`, 또는 빈 문자열. */
  operatingTime?: string;
}
