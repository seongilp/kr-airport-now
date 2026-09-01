'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Car, List, MapPin } from 'lucide-react';
import type { ParkingLot, TerminalId } from '@/lib/incheon';
import { PARKING_STATE_LABEL } from '@/lib/incheon';
import { parkingStyle, barColor, parkingAccent } from '@/lib/status-style';
import { Freshness } from './freshness';
import { cn } from '@/lib/utils';

/**
 * 지도는 보조 뷰다. 목록이 본체(게이지·대기막대·액센트)이고 커버리지도 터미널별로
 * 갈리므로(T2 전부·T1 일부), 지도는 기본값이 아니라 **눌러서 여는** 뷰로 둔다.
 * maplibre 번들도 지도를 열 때만 받도록 dynamic + ssr:false 로 지연 로드한다.
 */
const ParkingMap = dynamic(() => import('./parking-map').then((m) => m.ParkingMap), {
  ssr: false,
  loading: () => (
    <div className="bg-muted/40 flex h-[58vh] max-h-[520px] min-h-[300px] items-center justify-center rounded-xl border text-sm text-muted-foreground lg:h-[64vh] lg:max-h-[680px] lg:min-h-[480px]">
      지도를 불러오는 중…
    </div>
  ),
});

/** 잔여 많은 순으로. 미운영/정보없음은 맨 뒤로. */
function sortLots(lots: ParkingLot[]): ParkingLot[] {
  const rank = (l: ParkingLot) => (l.free === null ? -1 : l.free);
  return [...lots].sort((a, b) => rank(b) - rank(a));
}

export function ParkingSection({
  lots,
  terminal,
  observedAt,
  stale,
  now,
}: {
  lots: ParkingLot[];
  terminal: TerminalId;
  observedAt: number | null;
  stale: boolean;
  now?: number;
}) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const sorted = sortLots(lots);

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Car className="text-primary size-4" /> 주차장
          <span className="text-muted-foreground font-normal">{lots.length}곳</span>
        </h2>
        <div className="flex items-center gap-2">
          <Freshness observedAt={observedAt} now={now} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </header>

      {stale && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          최신 주차 정보를 받지 못해 마지막으로 받은 값을 보여 주고 있습니다.
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm">주차 정보를 불러오지 못했습니다.</p>
      ) : view === 'map' ? (
        // 데스크톱은 지도가 넓게 쓸모 있으니 지도(좌)+목록(우)을 나란히. 목록은 지도 높이에
        // 맞춰 내부 스크롤. 모바일/태블릿은 지도만(목록은 토글로 전환) — 나란히 둘 폭이 없다.
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <ParkingMap lots={lots} terminal={terminal} />
          <ul className="hidden content-start gap-2 xl:grid xl:max-h-[680px] xl:overflow-y-auto xl:pr-1">
            {sorted.map((lot) => (
              <LotRow key={lot.name} lot={lot} />
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((lot) => (
            <LotRow key={lot.name} lot={lot} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** 목록 ⇄ 지도 전환. 목록이 기본값이다. */
function ViewToggle({
  view,
  onChange,
}: {
  view: 'list' | 'map';
  onChange: (v: 'list' | 'map') => void;
}) {
  return (
    <div className="bg-muted flex items-center gap-0.5 rounded-full p-0.5" role="tablist" aria-label="주차장 보기 방식">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'list'}
        onClick={() => onChange('list')}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition',
          view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List className="size-3.5" /> 목록
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'map'}
        onClick={() => onChange('map')}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition',
          view === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <MapPin className="size-3.5" /> 지도
      </button>
    </div>
  );
}

function LotRow({ lot }: { lot: ParkingLot }) {
  const operating = lot.state !== 'closed' && lot.state !== 'unknown';
  const ratioPct = lot.ratio === null ? 0 : Math.round(lot.ratio * 100);

  return (
    <li
      className={cn(
        // 좌측 색 액센트로 리스트를 훑을 때 어디가 비었는지(초록)·찼는지(빨강) 즉시 스캔.
        'bg-card flex h-full flex-col rounded-xl border border-l-4 p-3',
        parkingAccent(lot.state),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{lot.label}</p>
          {operating ? (
            <p className="text-muted-foreground mt-0.5 text-xs">
              총 {lot.total?.toLocaleString('ko-KR')}면
            </p>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {lot.state === 'closed' ? '지금은 운영하지 않습니다' : '잔여면 정보가 없습니다'}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {operating && lot.free !== null ? (
            <p className="text-lg leading-none font-bold tabular-nums">
              {lot.free.toLocaleString('ko-KR')}
              <span className="text-muted-foreground ml-0.5 text-xs font-normal">면</span>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm font-medium">—</p>
          )}
          <span
            className={cn(
              'mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
              parkingStyle(lot.state),
            )}
          >
            {PARKING_STATE_LABEL[lot.state]}
          </span>
        </div>
      </div>

      {/* 채움 비율 게이지. 미운영/정보없음은 그리지 않는다 — 0% 게이지가 '텅 빔'으로 오독되면 안 된다. */}
      {operating && (
        <div className="mt-auto flex items-center gap-2 pt-2.5">
          <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full transition-all', barColor(lot.state))}
              style={{ width: `${ratioPct}%` }}
            />
          </div>
          {/* 채움 % 를 게이지 옆에 붙여 색만으로 판단하지 않게. */}
          <span className="text-muted-foreground w-11 shrink-0 text-right text-xs tabular-nums">
            {ratioPct}% 참
          </span>
        </div>
      )}
    </li>
  );
}
