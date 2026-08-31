'use client';

import { DoorOpen, Users } from 'lucide-react';
import type { Gate } from '@/lib/incheon';
import { GATE_STATE_LABEL } from '@/lib/incheon';
import { gateStyle, gateBarColor } from '@/lib/status-style';
import { Freshness } from './freshness';
import { cn } from '@/lib/utils';

/**
 * 대기시간 막대 정규화. 0~60분을 0~100%로 본다(60분 이상은 꽉 참).
 * 운영 중이면 아주 짧은 대기(예: 0~5분)도 눈에 보이게 최소 폭을 준다 —
 * 단, 이 함수는 '운영 중(대기값 있음)' 게이트에만 쓴다. 미운영/정보없음은 애초에 호출하지 않는다.
 */
const WAIT_BAR_CAP_MIN = 60;
function waitBarPct(waitMinutes: number): number {
  const raw = (waitMinutes / WAIT_BAR_CAP_MIN) * 100;
  return Math.min(100, Math.max(7, raw)); // 최소 7% — 원활도 빈 막대로 보이지 않게
}

/** 대기 짧은 순. 미운영/정보없음은 뒤로. */
function sortGates(gates: Gate[]): Gate[] {
  const rank = (g: Gate) => (g.waitMinutes === null ? Number.POSITIVE_INFINITY : g.waitMinutes);
  return [...gates].sort((a, b) => rank(a) - rank(b));
}

export function GateSection({
  gates,
  observedAt,
  stale,
  now,
}: {
  gates: Gate[];
  observedAt: number | null;
  stale: boolean;
  now?: number;
}) {
  const sorted = sortGates(gates);
  const open = sorted.filter((g) => g.waitMinutes !== null);

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <DoorOpen className="text-primary size-4" /> 출국장
          <span className="text-muted-foreground font-normal">
            {open.length}/{gates.length} 운영
          </span>
        </h2>
        <Freshness observedAt={observedAt} now={now} />
      </header>

      {stale && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          최신 출국장 정보를 받지 못해 마지막으로 받은 값을 보여 주고 있습니다.
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-sm">출국장 정보를 불러오지 못했습니다.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {sorted.map((gate) => (
            <GateCard key={gate.gateId} gate={gate} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GateCard({ gate }: { gate: Gate }) {
  const hasWait = gate.waitMinutes !== null;
  return (
    <li className="bg-card rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{gate.label} 게이트</p>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
            gateStyle(gate.state),
          )}
        >
          {GATE_STATE_LABEL[gate.state]}
        </span>
      </div>
      {hasWait ? (
        <>
          <p className="mt-1.5 text-2xl leading-none font-bold tabular-nums">
            {gate.waitMinutes}
            <span className="text-muted-foreground ml-0.5 text-xs font-normal">분</span>
          </p>
          {/* 대기시간 막대: 짧은 곳/긴 곳이 즉시 비교되게. 상태 색과 연동. */}
          <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full transition-all', gateBarColor(gate.state))}
              style={{ width: `${waitBarPct(gate.waitMinutes as number)}%` }}
            />
          </div>
          {gate.queueLength !== null && gate.queueLength > 0 && (
            <p className="text-muted-foreground mt-1.5 inline-flex items-center gap-1 text-xs">
              <Users className="size-3" /> 약 {gate.queueLength.toLocaleString('ko-KR')}명
            </p>
          )}
        </>
      ) : (
        // 미운영/정보없음: 막대를 그리지 않는다. 빈 막대가 '대기 0분·빠름'처럼 읽히면 안 된다.
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="bg-muted h-2 w-2 rounded-full" aria-hidden />
          <p className="text-muted-foreground text-sm">
            {gate.state === 'closed' ? '미운영' : '정보 없음'}
          </p>
        </div>
      )}
    </li>
  );
}
