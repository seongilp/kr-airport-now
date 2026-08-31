'use client';

import { Car, DoorOpen } from 'lucide-react';
import type { TerminalStatus } from '@/lib/incheon-status';
import type { Gate, ParkingLot } from '@/lib/incheon';
import { barColor, gateBarColor } from '@/lib/status-style';
import { cn } from '@/lib/utils';

/** 요약 게이트 대기 막대도 본문과 같은 0~60분 스케일·최소 폭을 쓴다. */
function waitBarPct(waitMinutes: number): number {
  return Math.min(100, Math.max(7, (waitMinutes / 60) * 100));
}

/**
 * 커브사이드 한눈에: '자리 가장 많은 주차장' 과 '대기 가장 짧은 출국장' 만 크게.
 * 캐리어 끌면서 폰을 3초 보는 사용자를 위한 결론. 상세는 아래 섹션에서.
 */
export function SummaryCard({ terminal, now }: { terminal: TerminalStatus; now?: number }) {
  void now; // 요약은 관측 시각을 다시 계산하지 않는다(섹션 헤더에서 이미 보여 준다).
  const bestLot = pickBestLot(terminal.lots);
  const bestGate = pickBestGate(terminal.gates);

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-card rounded-xl border p-3">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Car className="size-3" /> 자리 많은 주차장
        </p>
        {bestLot ? (
          <>
            <p className="mt-1.5 truncate text-sm font-semibold">{bestLot.label}</p>
            <p className="text-primary text-xl leading-tight font-bold tabular-nums">
              {bestLot.free?.toLocaleString('ko-KR')}
              <span className="text-muted-foreground ml-0.5 text-xs font-normal">면 남음</span>
            </p>
            {bestLot.ratio !== null && (
              <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className={cn('h-full rounded-full', barColor(bestLot.state))}
                  style={{ width: `${Math.round(bestLot.ratio * 100)}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground mt-1.5 text-sm">운영 중인 주차장 정보 없음</p>
        )}
      </div>

      <div className="bg-card rounded-xl border p-3">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <DoorOpen className="size-3" /> 대기 짧은 출국장
        </p>
        {bestGate ? (
          <>
            <p className="mt-1.5 truncate text-sm font-semibold">{bestGate.label} 게이트</p>
            <p className="text-primary text-xl leading-tight font-bold tabular-nums">
              {bestGate.waitMinutes}
              <span className="text-muted-foreground ml-0.5 text-xs font-normal">분 대기</span>
            </p>
            {bestGate.waitMinutes !== null && (
              <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className={cn('h-full rounded-full', gateBarColor(bestGate.state))}
                  style={{ width: `${waitBarPct(bestGate.waitMinutes)}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground mt-1.5 text-sm">운영 중인 출국장 정보 없음</p>
        )}
      </div>
    </div>
  );
}

function pickBestLot(lots: ParkingLot[]): ParkingLot | null {
  const operating = lots.filter((l) => l.free !== null && l.state !== 'full');
  if (operating.length === 0) return null;
  return operating.reduce((best, l) => ((l.free ?? 0) > (best.free ?? 0) ? l : best));
}

function pickBestGate(gates: Gate[]): Gate | null {
  const open = gates.filter((g) => g.waitMinutes !== null);
  if (open.length === 0) return null;
  return open.reduce((best, g) => ((g.waitMinutes ?? 0) < (best.waitMinutes ?? 0) ? g : best));
}
