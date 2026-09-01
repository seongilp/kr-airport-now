/**
 * 운항·현황 API 라우트의 CDN `Cache-Control` 을 만든다. **순수 함수**(node:test 로 검증).
 *
 * 사용자 요청: "느리게 뜬다 → 백그라운드로 캐싱해놓고 바로 보여주기."
 * 그 답은 **stale-while-revalidate** 다. `s-maxage` 가 지나도 CDN 이 **낡은 값을 즉시**
 * 주고 뒤에서 갱신하므로, 사용자는 스피너를 안 본다(측정: 콜드 MISS ~2.5s → STALE ~40ms).
 *
 * 세 가지를 한 번에 지킨다:
 *  1. **신선도 갱신 주기**는 `s-maxage`(baseTtl) 가 정한다 — TTL 이 지나야 백그라운드
 *     재검증이 돈다. 이걸 늘리지 않으므로 업스트림 호출 빈도(=쿼터)는 그대로다.
 *  2. **stale 제공 창은 KST 자정을 절대 넘지 않는다.** `s-maxage + swr = 자정까지 남은 초`
 *     로 못 박아, 자정을 넘긴 첫 요청은 캐시가 완전히 만료돼 새 `searchday` 로 다시 만든다
 *     (하루 밀림 사고 차단 — time.ts secondsUntilKstMidnight 주석).
 *  3. **실패는 캐시하지 않는다** — 이 헤더는 성공 응답에만 붙인다(라우트가 오류엔 no-store).
 *
 * stale 을 보여줘도 정직하다: 화면의 '수신 · N분 전' 은 응답에 박힌 `fetchedAt` 기준이라
 * 낡은 만큼 나이가 그대로 커진다. 그리고 클라이언트 자동 새로고침(2분)이 다음 요청에서
 * 갱신된 값을 받아 곧 최신으로 올라온다.
 */

import { secondsUntilKstMidnight } from './time';

/**
 * @param baseTtl 신선 주기(초). 이 시간이 지나면 백그라운드 재검증이 돈다.
 * @returns `public, s-maxage=<x>, stale-while-revalidate=<y>` — x+y 는 자정까지 남은 초.
 */
export function swrCacheControl(baseTtl: number, nowMs: number = Date.now()): string {
  const untilMidnight = secondsUntilKstMidnight(nowMs);
  // 자정 근처에선 baseTtl 보다 자정이 먼저 오므로 s-maxage 를 줄인다(신선 값도 자정을 안 넘게).
  const sMaxage = Math.min(baseTtl, untilMidnight);
  // 나머지 전부를 stale 창으로. 낮에 열면 그날 남은 시간 내내 즉시 응답(뒤에서 갱신).
  const swr = Math.max(0, untilMidnight - sMaxage);
  return `public, s-maxage=${sMaxage}, stale-while-revalidate=${swr}`;
}
