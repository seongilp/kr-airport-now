/**
 * 공공데이터포털(data.go.kr) 항공 서비스 공용 저수준 클라이언트. **서버 전용.**
 *
 * B551178(한국공항공사)·B551177(인천공항공사)이 봉투/오류/키 규칙을 공유하므로 여기 모은다.
 * (검증된 incheon-api.ts 는 인천 주차/출국장 전용이라 건드리지 않고, 같은 방어를 여기 둔다.)
 *
 * 실측으로 확정한 함정:
 *  1. **serviceKey 는 이미 %-인코딩** — verbatim 으로 붙인다(URLSearchParams 금지, 재인코딩되면
 *     SERVICE_KEY_IS_NOT_REGISTERED_ERROR 코드 30).
 *  2. **HTTP 200 이 성공이 아니다** — `response.header.resultCode === '00'` 을 확인.
 *  3. `AbortSignal.timeout` 필수.
 */

import 'server-only';
import type { RawFlight } from './flights';

/** 업스트림 응답 제한 시간. incheon-api 와 동일하게 8초. */
const UPSTREAM_TIMEOUT_MS = 8000;
/** 페이지당 행 수. 300 이면 서비스가 거부(코드 04)하므로 100 고정. */
export const ROWS = 100;

export class DgkApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'DgkApiFailure';
  }
}

export function serviceKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim();
  if (!key) {
    throw new DgkApiFailure('NO_KEY', 'DATA_GO_KR_KEY 가 설정되지 않았습니다.', 500);
  }
  return key;
}

interface Envelope {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      totalCount?: number;
      items?: RawFlight[] | { item?: RawFlight[] | RawFlight } | '';
    };
  };
  /** 인증/서비스 오류는 이 형태로 온다. */
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string; returnReasonCode?: string };
  };
}

/** items 가 배열 / { item } / 빈문자열 / 단일객체 중 무엇이든 배열로 정규화. */
function normalizeItems(
  items: RawFlight[] | { item?: RawFlight[] | RawFlight } | '' | undefined,
): RawFlight[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  const inner = (items as { item?: RawFlight[] | RawFlight }).item;
  if (!inner) return [];
  return Array.isArray(inner) ? inner : [inner];
}

/** 한 페이지를 받아 items/totalCount 로 정규화. label 은 오류 메시지용(도착/출발 등). */
async function fetchPage(
  url: string,
  label: string,
  revalidate: number,
): Promise<{ items: RawFlight[]; totalCount: number }> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate },
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new DgkApiFailure('TIMEOUT', `${label}: 업스트림 응답 시간 초과`, 504);
    }
    throw new DgkApiFailure('NETWORK', `${label}: 네트워크 오류 (${String(error)})`, 502);
  }

  const text = await response.text();
  let json: Envelope;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DgkApiFailure(
      `HTTP_${response.status}`,
      `${label}: JSON 이 아닌 응답 (HTTP ${response.status})`,
      502,
    );
  }

  const auth = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (auth?.errMsg) {
    throw new DgkApiFailure(
      auth.returnReasonCode ?? 'AUTH',
      `${label}: ${auth.errMsg} ${auth.returnAuthMsg ?? ''}`.trim(),
      502,
    );
  }

  const header = json.response?.header;
  if (header?.resultCode && header.resultCode !== '00') {
    throw new DgkApiFailure(
      header.resultCode,
      `${label}: ${header.resultMsg ?? '알 수 없는 오류'}`,
      502,
    );
  }

  return {
    items: normalizeItems(json.response?.body?.items),
    totalCount: json.response?.body?.totalCount ?? 0,
  };
}

export interface DgkFetchResult {
  items: RawFlight[];
  totalCount: number;
  /** 서버가 업스트림 응답을 받은 시각(ISO). */
  fetchedAt: string;
}

/**
 * `buildPageUrl(pageNo)` 로 페이지를 순회해 items 를 모은다. 시간창으로 좁혔으므로 보통
 * 1~2페이지지만, maxPages 로 상한을 둬 쿼터가 빡빡한 서비스(인천 500/일)를 보호한다.
 */
export async function fetchAllPages(
  buildPageUrl: (pageNo: number) => string,
  label: string,
  maxPages: number,
  revalidate: number,
): Promise<DgkFetchResult> {
  const first = await fetchPage(buildPageUrl(1), label, revalidate);
  const items = [...first.items];
  const totalPages = Math.min(maxPages, Math.ceil(first.totalCount / ROWS) || 1);

  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(buildPageUrl(page), label, revalidate);
    items.push(...next.items);
  }

  return { items, totalCount: first.totalCount, fetchedAt: new Date().toISOString() };
}
