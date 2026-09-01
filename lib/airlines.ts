/**
 * 편명 → IATA 항공사 코드, 그리고 코드 → 배지 색. **순수 함수만**(외부 조회 없음).
 *
 * 왜 편명에서 코드를 뽑나: 편명 앞 2자가 곧 IATA 항공사 코드다(`KE5031`→KE, `OZ577`→OZ).
 * 한글 항공사명은 표기가 흔들리지만(`KLM네덜란드항공`) 코드는 고정이라 안전하다.
 *
 * 파싱 함정: IATA 항공사 코드는 **2자**이고 **숫자가 섞인다**(`7C` 제주항공, `9C` 춘추항공,
 * `3U` 사천항공, `5J` 세부퍼시픽). "앞 알파벳만" 잘라 내면 `7C1234` 가 깨진다. 그래서
 * '숫자|영문 2자(단, 최소 1자는 영문) + 뒤에 숫자' 형태를 정규식으로 고정한다.
 */

/**
 * 편명에서 IATA 항공사 코드(2자)를 뽑는다. 없거나 형식이 아니면 null.
 * 허용: `AA`(영문2), `7C`/`9C`(숫자+영문), `B7`(영문+숫자). 뒤에 편수 숫자가 와야 한다.
 */
export function parseAirlineCode(flightId: string | null): string | null {
  if (!flightId) return null;
  const m = flightId.trim().toUpperCase().match(/^([A-Z]{2}|[0-9][A-Z]|[A-Z][0-9])(?=\d)/);
  return m ? m[1] : null;
}

/**
 * 항공사 코드 → 배지 색(HSL). 코드 해시로 색상(hue)을 정해 **결정적**이고 유지보수 0.
 * 채도·명도를 고정해 다크 UI 에서 흰 글자 대비를 보장한다(색만으로 판단하지 않게 코드도 함께 표시).
 */
export function airlineBadgeColor(code: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return { background: `hsl(${hue} 55% 38%)`, color: '#f4f4f5' };
}
