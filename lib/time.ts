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
