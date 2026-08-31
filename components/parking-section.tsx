'use client';

import { Car } from 'lucide-react';
import type { ParkingLot } from '@/lib/incheon';
import { PARKING_STATE_LABEL } from '@/lib/incheon';
import { parkingStyle, barColor, parkingAccent } from '@/lib/status-style';
import { Freshness } from './freshness';
import { cn } from '@/lib/utils';

/** 잔여 많은 순으로. 미운영/정보없음은 맨 뒤로. */
function sortLots(lots: ParkingLot[]): ParkingLot[] {
  const rank = (l: ParkingLot) => (l.free === null ? -1 : l.free);
  return [...lots].sort((a, b) => rank(b) - rank(a));
}

export function ParkingSection({
  lots,
  observedAt,
  stale,
  now,
}: {
  lots: ParkingLot[];
  observedAt: number | null;
  stale: boolean;
  now?: number;
}) {
  const sorted = sortLots(lots);

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Car className="text-primary size-4" /> 주차장
          <span className="text-muted-foreground font-normal">{lots.length}곳</span>
        </h2>
        <Freshness observedAt={observedAt} now={now} />
      </header>

      {stale && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          최신 주차 정보를 받지 못해 마지막으로 받은 값을 보여 주고 있습니다.
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm">주차 정보를 불러오지 못했습니다.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((lot) => (
            <LotRow key={lot.name} lot={lot} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LotRow({ lot }: { lot: ParkingLot }) {
  const operating = lot.state !== 'closed' && lot.state !== 'unknown';
  const ratioPct = lot.ratio === null ? 0 : Math.round(lot.ratio * 100);

  return (
    <li
      className={cn(
        // 좌측 색 액센트로 리스트를 훑을 때 어디가 비었는지(초록)·찼는지(빨강) 즉시 스캔.
        'bg-card rounded-xl border border-l-4 p-3',
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
        <div className="mt-2.5 flex items-center gap-2">
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
