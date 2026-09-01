'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';

import {
  aggregateParking,
  type ParkingLot,
  type ParkingState,
  type TerminalId,
} from '@/lib/incheon';
import { PARKING_STATE_HEX } from '@/lib/status-style';
import { PARKING_LOCATIONS, LOCATION_BY_FLOOR, type ParkingLocation } from '@/lib/parking-locations';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * 주차 구역 지도. **목록의 보조 뷰**다.
 *
 * 목록(게이지·대기막대·좌측 액센트)이 이 앱의 본체이고, 지도는 "어디에 있는지"를 더한다.
 * 그래서 색은 목록과 **같은 팔레트**(PARKING_STATE_HEX)를 쓴다 — 두 화면이 색으로 다른
 * 말을 하면 안 되므로 상태색은 status-style 한 곳에서만 온다.
 *
 * 좌표는 정적(parking-locations.ts, 출처 OSM). 19구역 중 11구역만 매칭됐고, 매칭 안 된
 * 구역은 **지도에서 감추지 않고** 하단에 "표시 못 한 N곳"으로 명시해 목록으로 넘긴다.
 */

/** 키가 필요 없는 CARTO 다크 베이스맵(형제 앱 gofish 와 동일). 다크 UI 와 톤이 맞는다. */
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * 초기 fit 여백. 마커가 좌표 위쪽으로 솟는 말풍선 꼴(anchor bottom)이라 위를 넉넉히,
 * 아래는 저작권 배지만큼만 준다. 좌우는 말풍선이 좌표 기준 가운데라 살짝 삐져나오는 폭.
 */
const FIT_PADDING = { top: 56, right: 40, bottom: 36, left: 40 };

/** 마커가 겹쳐 뜰 만큼 가까운 T2 랜드사이드 시설들을 위해 확대 여지를 남긴다. */
const MAX_ZOOM_ON_FIT = 15.5;

interface MarkerModel {
  loc: ParkingLocation;
  label: string;
  state: ParkingState;
  free: number | null;
  ratioPct: number | null;
  total: number | null;
}

/** 현재 터미널의 좌표들을, 넘어온 lots 와 floor 이름으로 이어 붙여 마커 모델을 만든다. */
function buildMarkerModels(lots: ParkingLot[], terminal: TerminalId): MarkerModel[] {
  const byName = new Map(lots.map((l) => [l.name, l] as const));
  const models: MarkerModel[] = [];
  for (const loc of PARKING_LOCATIONS) {
    if (loc.terminal !== terminal) continue;
    const matched = loc.floors.map((f) => byName.get(f)).filter((l): l is ParkingLot => !!l);
    if (matched.length === 0) continue; // 이번 응답에 해당 구역이 없으면 마커도 안 만든다
    const agg = aggregateParking(matched);
    models.push({
      loc,
      label: loc.label,
      state: agg.state,
      free: agg.free,
      ratioPct: agg.ratio === null ? null : Math.round(agg.ratio * 100),
      total: agg.total,
    });
  }
  return models;
}

/**
 * HTML 마커 엘리먼트. 상태색 알약 + 이름 + (운영 중이면) 잔여 면수·채움%.
 * **미운영/정보없음은 숫자를 찍지 않는다** — 회색 알약에 라벨만 둬서 "잔여 0"으로 오독되지 않게.
 * (목록이 미운영일 때 막대를 아예 안 그리는 것과 같은 규칙.)
 */
function buildMarkerElement(m: MarkerModel): HTMLElement {
  const operating = m.state !== 'closed' && m.state !== 'unknown';
  const color = PARKING_STATE_HEX[m.state];

  const el = document.createElement('div');
  el.style.transform = 'translateY(-6px)';
  el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))';
  el.style.cursor = 'default';
  el.style.userSelect = 'none';

  const box = document.createElement('div');
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.alignItems = 'flex-start';
  box.style.gap = '1px';
  box.style.padding = '4px 8px';
  box.style.borderRadius = '10px';
  box.style.border = `1px solid ${color}`;
  box.style.background = operating ? `${color}22` : 'rgba(39,39,42,0.92)';
  box.style.backdropFilter = 'blur(2px)';
  box.style.whiteSpace = 'nowrap';

  const name = document.createElement('div');
  name.textContent = m.label;
  name.style.fontSize = '11px';
  name.style.fontWeight = '600';
  name.style.lineHeight = '1.1';
  name.style.color = '#f4f4f5';
  box.appendChild(name);

  const value = document.createElement('div');
  value.style.fontSize = '11px';
  value.style.lineHeight = '1.1';
  value.style.fontWeight = '700';
  value.style.color = color === '#52525b' ? '#a1a1aa' : color;
  if (operating && m.free !== null) {
    // 잔여 면수(크게) + 채움%(작게) 를 함께 — 색만으로 판단하지 않게 숫자를 병기한다.
    value.innerHTML =
      `${m.free.toLocaleString('ko-KR')}면` +
      (m.ratioPct !== null
        ? ` <span style="color:#a1a1aa;font-weight:500">· ${m.ratioPct}% 참</span>`
        : '');
  } else {
    value.textContent = m.state === 'closed' ? '미운영' : '정보 없음';
  }
  box.appendChild(value);

  // 좌표를 가리키는 작은 꼭지.
  const tip = document.createElement('div');
  tip.style.width = '0';
  tip.style.height = '0';
  tip.style.margin = '0 auto';
  tip.style.borderLeft = '5px solid transparent';
  tip.style.borderRight = '5px solid transparent';
  tip.style.borderTop = `5px solid ${color}`;

  el.appendChild(box);
  el.appendChild(tip);

  el.setAttribute(
    'aria-label',
    operating && m.free !== null
      ? `${m.label} 잔여 ${m.free}면${m.ratioPct !== null ? `, ${m.ratioPct}% 참` : ''}`
      : `${m.label} ${m.state === 'closed' ? '미운영' : '정보 없음'}`,
  );
  return el;
}

export function ParkingMap({
  lots,
  terminal,
}: {
  lots: ParkingLot[];
  terminal: TerminalId;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const models = useMemo(() => buildMarkerModels(lots, terminal), [lots, terminal]);

  /** 이번 터미널에서 좌표가 없는(매칭 안 된) 구역들 — 지도 밖에 명시한다. */
  const unmatched = useMemo(
    () => lots.filter((l) => !LOCATION_BY_FLOOR.has(l.name)),
    [lots],
  );

  // 최신 값을 지도 생성 effect(한 번만 도는) 안에서 읽기 위한 ref.
  const modelsRef = useRef(models);
  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  /* 마커를 현재 모델로 다시 그리고, 현재 터미널 범위로 맞춘다. */
  const render = (map: MapLibreMap) => {
    for (const mk of markersRef.current) mk.remove();
    markersRef.current = [];

    const current = modelsRef.current;
    if (current.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const m of current) {
      const marker = new maplibregl.Marker({ element: buildMarkerElement(m), anchor: 'bottom' })
        .setLngLat([m.loc.lng, m.loc.lat])
        .addTo(map);
      // 잔여가 많은 곳을 위로 — 겹칠 때 '빈 곳'이 가려지지 않게.
      marker.getElement().style.zIndex = String(1000 + (m.free ?? 0));
      markersRef.current.push(marker);
      bounds.extend([m.loc.lng, m.loc.lat]);
    }

    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: MAX_ZOOM_ON_FIT, duration: 0 });
  };

  /* 지도 생성 — 한 번만. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [126.44, 37.46],
      zoom: 12,
      minZoom: 10,
      maxZoom: 17,
      attributionControl: { compact: true },
      // CARTO 글리프 서버에 한글이 없어 라벨이 통째로 안 뜬다. 브라우저 폰트로 그린다.
      localIdeographFontFamily: "'Noto Sans KR', sans-serif",
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      loadedRef.current = true;
      render(map);
    });

    // 0x0 으로 생성되면 fit 이 엉뚱한 줌으로 굳는다. 실제 크기를 얻으면 한 번 다시 맞춘다.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      map.resize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      for (const mk of markersRef.current) mk.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  /* 터미널 전환·데이터 갱신 → 마커 다시 그리고 그 터미널로 이동. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    render(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  return (
    <div className="space-y-2">
      <div className="relative h-[58vh] max-h-[520px] min-h-[300px] overflow-hidden rounded-xl border lg:h-[64vh] lg:max-h-[680px] lg:min-h-[480px]">
        <div ref={containerRef} className="size-full" />
      </div>

      {/* 매칭 안 된 구역을 숨기지 않는다 — "지도에 없는 = 주차장이 없는" 오해를 막는다. */}
      {unmatched.length > 0 && (
        <div className="bg-card/60 text-muted-foreground rounded-lg border px-3 py-2 text-xs leading-relaxed">
          <p className="text-foreground mb-1 font-medium">
            지도에 표시하지 못한 {unmatched.length}곳
          </p>
          <p className="mb-1.5">
            좌표를 확실히 특정할 수 없어 지도에서 뺐습니다. 아래 목록에서 확인하세요.
          </p>
          <div className="flex flex-wrap gap-1">
            {unmatched.map((l) => (
              <span
                key={l.name}
                className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: PARKING_STATE_HEX[l.state] }}
                />
                {l.label}
                <span className="text-muted-foreground">
                  {l.free !== null
                    ? ` ${l.free.toLocaleString('ko-KR')}면`
                    : l.state === 'closed'
                      ? ' 미운영'
                      : ''}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-muted-foreground px-0.5 text-[11px] leading-relaxed">
        지도 데이터 © OpenStreetMap 기여자 (ODbL) · 베이스맵 © CARTO. 주차장 위치는 참고용이며
        잔여 면수·상태는 목록과 같은 실시간 값입니다.
      </p>
    </div>
  );
}
