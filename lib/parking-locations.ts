/**
 * 주차 구역 → 지도 좌표. **정적 데이터.** 런타임에 OSM 을 치지 않는다 —
 * 주차장 위치는 변하지 않으므로 한 번 받아 여기에 박아 둔다.
 *
 * 출처: OpenStreetMap (© OpenStreetMap contributors, ODbL).
 * 2026-08-31 Overpass 로 인천공항 일대(37.42~37.51, 126.41~126.48) `amenity=parking`
 * 132건(이름 있는 것 24건)을 받아, 우리 API 19구역과 아래 근거로 매칭했다.
 *
 * ── 매칭 원칙 ──────────────────────────────────────────────
 * 좌표를 추측으로 붙이지 않는다. 근거가 약한 구역은 지도에 올리지 않고 목록에만 둔다.
 * (반쪽 지도가 "여기 없는 주차장은 없는 것"처럼 오해되는 걸 막는 게, 몇 곳 더 얹는 것보다 낫다.)
 *
 *  - 1순위 **capacity 정확 일치**: OSM `capacity` 가 우리 총면수와 딱 맞으면 확정.
 *  - 2순위 **이름·유일성**: 터미널 내 유일한 종류(예약/장기)라 이름으로 확정.
 *  - 위도로 T1(37.44대)/T2(37.48대)를 갈라 후보를 좁혔다.
 *
 * ── 매칭 결과 (19구역 중 11구역 = 57.9%) ──────────────────
 * [T2 = 9/9 전부 매칭, T1 = 2/10 매칭] — 커버리지가 터미널별로 크게 갈린다.
 *
 * 매칭됨(지도 표시):
 *  T1 장기 P3 주차장   ← OSM "제1여객터미널 장기주차장" capacity=1605 **정확 일치**
 *  T1 P5 예약주차장    ← OSM "제1여객터미널 예약주차장" (T1 유일 예약주차장, cap 1256≈1276)
 *  T2 단기주차장 5개층  ← OSM "제2여객터미널 단기주차장" capacity=4558 = **5개층 합계와 정확 일치**
 *                       (한 건물이라 5개층을 좌표 1점으로 묶어 표시한다)
 *  T2 장기 주차장      ← OSM "제2여객터미널 장기주차장" (T2 유일 장기 지상)
 *  T2 예약 주차장      ← OSM "제2여객터미널 예약주차장" (T2 유일 예약)
 *  T2 P1 장기주차타워   ← OSM "P1 주차타워" (이름 일치)
 *  T2 P2 장기주차타워   ← OSM "P2 주차타워" (이름 일치)
 *
 * 매칭 안 됨(지도 제외, 목록에만):
 *  T1 단기 지하1·2·3층·지상층 (4곳)
 *     → OSM 에 "제1여객터미널 단기주차장" 항목 자체가 없다(터미널 하부라 미매핑). 합계로도 안 맞음.
 *  T1 장기 P1 주차장 / P2 주차장 (2곳)
 *     → 지상 장기 폴리곤이 OSM 에 여러 개인데 capacity 가 우리 2769/2581 과 안 맞아 못 가른다.
 *  T1 장기 P1 주차타워 / P2 주차타워 (2곳)
 *     → 둘 다 capacity=1379. OSM 은 "동측/서측 주차타워"(둘 다 1379)로 두는데,
 *       어느 쪽이 P1 인지 확정할 근거가 없다. 220m 라벨 뒤바뀜 위험이라 **일부러 뺀다.**
 */

export interface ParkingLocation {
  /** 안정 키. */
  id: string;
  terminal: 'T1' | 'T2';
  /** 지도 마커에 쓸 짧은 이름. */
  label: string;
  /** 경도. */
  lng: number;
  /** 위도. */
  lat: number;
  /**
   * 이 좌표가 대표하는 API 구역명(`floor`) 목록.
   * 대부분 1개. T2 단기주차장만 한 건물이라 5개층을 묶는다 — 이때 총면수·잔여를 합산해 보여 준다.
   */
  floors: string[];
  /** 매칭 근거(출처 표기·신뢰도 판단용). */
  basis: 'capacity' | 'name';
}

export const PARKING_LOCATIONS: ParkingLocation[] = [
  /* ── T1 (37.44대) ── */
  {
    id: 't1-p3',
    terminal: 'T1',
    label: '장기 P3',
    lng: 126.4583,
    lat: 37.44508,
    floors: ['T1 장기 P3 주차장'],
    basis: 'capacity',
  },
  {
    id: 't1-p5-reserve',
    terminal: 'T1',
    label: 'P5 예약',
    lng: 126.45565,
    lat: 37.44127,
    floors: ['T1 P5 예약주차장'],
    basis: 'name',
  },

  /* ── T2 (37.47~37.48대) ── */
  {
    id: 't2-short',
    terminal: 'T2',
    label: '단기',
    lng: 126.43275,
    lat: 37.46963,
    // 한 건물(지하M·지상1~4층). OSM capacity=4558 이 5개층 합계와 정확히 맞아 한 점으로 묶는다.
    floors: [
      'T2 단기주차장지하M층',
      'T2 단기주차장지상1층',
      'T2 단기주차장지상2층',
      'T2 단기주차장지상3층',
      'T2 단기주차장지상4층',
    ],
    basis: 'capacity',
  },
  {
    id: 't2-long',
    terminal: 'T2',
    label: '장기',
    lng: 126.4159,
    lat: 37.48148,
    floors: ['T2 장기 주차장'],
    basis: 'name',
  },
  {
    id: 't2-reserve',
    terminal: 'T2',
    label: '예약',
    lng: 126.41848,
    lat: 37.47856,
    floors: ['T2 예약 주차장'],
    basis: 'name',
  },
  {
    id: 't2-p1-tower',
    terminal: 'T2',
    label: 'P1 타워',
    lng: 126.41343,
    lat: 37.48328,
    floors: ['T2 P1 장기주차타워'],
    basis: 'name',
  },
  {
    id: 't2-p2-tower',
    terminal: 'T2',
    label: 'P2 타워',
    lng: 126.41463,
    lat: 37.48388,
    floors: ['T2 P2 장기주차타워'],
    basis: 'name',
  },
];

/** floor 이름 → 좌표 조회. 매칭 안 된 구역은 undefined. */
export const LOCATION_BY_FLOOR: ReadonlyMap<string, ParkingLocation> = new Map(
  PARKING_LOCATIONS.flatMap((loc) => loc.floors.map((f) => [f, loc] as const)),
);
