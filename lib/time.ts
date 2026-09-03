/**
 * 인천공항 API 시각 필드 파싱. 서버·클라이언트 공용.
 *
 * 왜 따로 두는가 — 실측으로 확인한 함정 때문이다.
 *  - 주차 `datetm` 은 `20260831193627.000` (YYYYMMDDHHMMSS.mmm),
 *    출국장 `occurtime` 은 `20260831193627` (YYYYMMDDHHMMSS) 형식이다.
 *  - **둘 다 타임존 표기가 없다. 실측값이 한국 벽시계와 일치했으므로 KST 로 해석한다.**
 *  - Vercel 함수는 UTC 로 돈다. 이 숫자를 그대로 `new Date()` 에 넣으면 서버에선 UTC 로,
 *    브라우저에선 로컬로 해석돼 9시간이 어긋난다. 그래서 **KST 벽시계 → UTC 인스턴트(epoch)**
 *    로 한 번에 확정한 뒤, 표시할 때만 다시 KST 로 포맷한다. 기준을 하나로 못 박아
 *    형제 앱(입양)에서 겪은 '하루/시간 밀림' 을 원천 차단한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * `20260831193627` 또는 `20260831193627.000` → UTC epoch(ms).
 * 자리 수가 안 맞거나 존재하지 않는 날짜/시각이면 null.
 *
 * 되돌려 비교해서 `20260231`(2월 31일) 같은 값이 조용히 굴러가지 않게 한다.
 */
export function parseKstStamp(value: string | undefined | null): number | null {
  if (!value) return null;
  const digits = String(value).trim().split('.')[0];
  if (!/^\d{14}$/.test(digits)) return null;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  const h = Number(digits.slice(8, 10));
  const mi = Number(digits.slice(10, 12));
  const s = Number(digits.slice(12, 14));
  // 입력 숫자를 UTC 로 조립한 뒤 9시간을 빼면, 그 숫자를 'KST 벽시계' 로 본 실제 인스턴트가 된다.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(asUtc)) return null;
  const back = new Date(asUtc);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    back.getUTCHours() !== h ||
    back.getUTCMinutes() !== mi ||
    back.getUTCSeconds() !== s
  ) {
    return null;
  }
  return asUtc - KST_OFFSET_MS;
}

const KST_CLOCK = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** epoch(ms) → KST `HH:MM`. 표시 전용. */
export function formatKstClock(epochMs: number): string {
  return KST_CLOCK.format(new Date(epochMs));
}

/**
 * 관측 시각의 신선도 라벨. "방금 전" / "N분 전" / "N시간 전".
 * 미래로 나오면(시계 오차) "방금 전" 으로 뭉갠다.
 */
export function freshnessLabel(epochMs: number, nowMs: number = Date.now()): string {
  const diffSec = Math.floor((nowMs - epochMs) / 1000);
  if (diffSec < 60) return '방금 전';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  return `${day}일 전`;
}

/**
 * 관측값이 '너무 오래됐는지'. 갱신 주기가 분당 1회(실측)이므로, 10분을 넘으면
 * 업스트림 스크레이핑이 멈췄을 가능성이 크다 — 화면에서 경고를 띄우는 기준.
 */
export function isStaleObservation(epochMs: number, nowMs: number = Date.now()): boolean {
  return nowMs - epochMs > 10 * 60 * 1000;
}

/* --------------------------- 운항 조회 창(KST) --------------------------- */

/** KST 벽시계 분(0~1439). 서버가 UTC 라도 한국 시각으로 창을 잡아야 한다. */
function kstMinutes(nowMs: number): number {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/**
 * 오늘(KST) `searchday`(YYYYMMDD). B551178 은 미지정 시 오늘이 아니라 축적분을 주므로
 * **반드시 명시**해야 한다(실측: 미지정이면 며칠 전 데이터가 섞임).
 */
export function kstSearchday(nowMs: number = Date.now()): string {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${d}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 지금부터 다음 KST 자정까지 남은 '초'. 항상 1 이상(자정 정각이면 86400).
 *
 * 왜 필요한가 — 운항 캐시는 `searchday`(하루 단위)에 묶여 있다. 낡은 응답을
 * 자정 너머까지 stale 로 재사용하면 **어제 날짜의 편**을 오늘인 척 보여 준다(실제로
 * 두 번 난 하루 밀림 사고). 그래서 CDN 이 stale 을 주더라도 그 창을 KST 자정에서
 * 잘라, 자정을 넘긴 첫 요청은 새 searchday 로 다시 만들게 한다(cache-control.ts).
 */
export function secondsUntilKstMidnight(nowMs: number = Date.now()): number {
  const kstNow = nowMs + KST_OFFSET_MS;
  const msIntoDay = ((kstNow % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.max(1, Math.ceil((DAY_MS - msIntoDay) / 1000));
}

/**
 * 조회 시간창을 버킷 경계로 끊는 크기(분). **캐시 키 안정화의 핵심.**
 *
 * 왜 필요한가 — `from_time`/`to_time` 가 '지금' 분 단위면 **URL 이 매분 바뀌어**(하루 1440키)
 * Next Data Cache 키가 매분 회전한다. 그러면 인스턴스 간 공유 캐시가 안 먹고, 콜드 인스턴스마다
 * 업스트림을 새로 때린다(실측 확인한 근본 원인). `nowMin` 을 15분 경계로 **내림**하면 하루 96키로
 * 안정돼 **Data Cache 가 인스턴스 간에 공유**된다 — 같은 버킷의 두 번째 요청부터 업스트림 0.
 *
 * 왜 15분인가 — 쿼터가 가장 빡빡한 인천 IIAC 의 캐시 신선주기(s-maxage=900초=15분)와 맞춘다.
 * 키 회전 주기 = 신선 주기라 낭비가 없다(KAC 는 TTL 300초라 한 버킷 안에서 더 자주 갱신되지만
 * 한도가 10배 넉넉해 흡수된다). 창이 -1h~+6h(7시간)라 15분 내림은 스팬의 3.6%로, 뒤로만 살짝
 * 넓어지고(from 이 최대 15분 앞당겨짐) **앞쪽 임박편은 절대 빠지지 않는다**(to 는 항상 now+5h↑).
 */
const WINDOW_BUCKET_MINUTES = 15;

/**
 * '지금' 을 중심으로 한 조회 시간창을 HHMM 두 개로. 업스트림 전량(하루치)을 받지 않고
 * 근시간대만 받아 쿼터를 아끼는 장치(B551178 `from_time`/`to_time` 는 HHMM 을 받는다).
 *
 * **버킷팅**: `nowMin` 을 15분 경계로 내려(WINDOW_BUCKET_MINUTES) URL/캐시 키를 안정시킨다.
 * `searchday` 는 실제 now 로 따로 계산하므로(kstSearchday) 이 내림이 날짜를 건드리지 않는다
 * — 00:07 이어도 버킷은 00:00, searchday 는 여전히 오늘. **자정 밀림 없음.**
 *
 * 자정을 넘는 창은 하루 경계(searchday 는 하루 단위)를 벗어나므로 **당일 안으로 자른다**
 * (from 은 00:00, to 는 23:59 로 클램프). 심야엔 다음날 새벽 편이 안 보일 수 있다 — v1 한계.
 */
export function kstFlightWindow(
  nowMs: number = Date.now(),
  backHours = 1,
  forwardHours = 6,
): { from: string; to: string } {
  // 버킷 경계로 내림 → 15분 동안 같은 창(=같은 URL=같은 Data Cache 키).
  const nowMin = Math.floor(kstMinutes(nowMs) / WINDOW_BUCKET_MINUTES) * WINDOW_BUCKET_MINUTES;
  const fromMin = Math.max(0, nowMin - backHours * 60);
  const toMin = Math.min(24 * 60 - 1, nowMin + forwardHours * 60);
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
  return { from: hhmm(fromMin), to: hhmm(toMin) };
}

/* --------------------------- 지연/조기 분(分) 표기 --------------------------- */

/**
 * 예정 대비 변경 시각의 차이(분)를 사람이 읽기 좋게. 부호는 항상 붙인다(0 은 `0분`).
 *  - 60분 미만: `+45분`, `-20분`
 *  - 정각 시간: `+9시간`, `-2시간`
 *  - 그 외: `+1시간 30분`
 * 소수·NaN 은 반올림/`0분` 으로 뭉갠다(입력은 lib/flights 의 delayMinutes).
 */
export function formatDelta(minutes: number): string {
  const total = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  if (total === 0) return '0분';
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  if (abs < 60) return `${sign}${abs}분`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h}시간` : `${sign}${h}시간 ${m}분`;
}
