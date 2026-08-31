'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { StatusView, TerminalStatus } from '@/lib/incheon-status';
import type { TerminalId } from '@/lib/incheon';
import { ParkingSection } from './parking-section';
import { GateSection } from './gate-section';
import { SummaryCard } from './summary-card';
import { formatKstClock, freshnessLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * 인천 전용 보드 — 주차 · 출국장 · 지도. 인천국제공항공사(B551177) 소관이라 다른 공항엔
 * 없는 고유 데이터다. (앱 제목/공항 선택기는 상위 AppShell 이 담당하고, 여기는 인천 내용만.)
 *
 * 관측 시각 라벨을 흐르게 하는 틱(30초). 데이터는 자동 새로고침(60초)이 따로 당긴다.
 */
const CLOCK_TICK_MS = 30_000;
const AUTO_REFRESH_MS = 60_000;

export function IncheonBoard({ initial }: { initial: StatusView }) {
  const [view, setView] = useState<StatusView>(initial);
  const [terminal, setTerminal] = useState<TerminalId>('T1');
  const [now, setNow] = useState<number>(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [failedRefresh, setFailedRefresh] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setFailedRefresh(false);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as StatusView;
      setView(next);
      setNow(Date.now());
    } catch {
      // 새로고침 실패는 화면을 비우지 않는다. 마지막으로 그려진 값을 유지하고 표시만 한다.
      setFailedRefresh(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const auto = setInterval(refresh, AUTO_REFRESH_MS);
    return () => {
      clearInterval(clock);
      clearInterval(auto);
    };
  }, [refresh]);

  const current: TerminalStatus =
    view.terminals.find((t) => t.id === terminal) ?? view.terminals[0];

  const keyMissing =
    view.health.parking.error?.code === 'NO_KEY' ||
    view.health.departure.error?.code === 'NO_KEY';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <TerminalToggle terminal={terminal} onChange={setTerminal} view={view} />
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-50"
          aria-label="새로고침"
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          {refreshing ? '갱신 중' : '새로고침'}
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        {formatKstClock(new Date(view.fetchedAt).getTime())} 수신 ·{' '}
        {freshnessLabel(new Date(view.fetchedAt).getTime(), now)}
        {failedRefresh && <span className="text-amber-400"> · 새로고침 실패, 이전 값 표시 중</span>}
      </p>

      {keyMissing ? (
        <p className="bg-card rounded-xl border p-4 text-sm text-rose-300">
          인증키가 설정되지 않아 데이터를 불러올 수 없습니다. 서버의 <code>DATA_GO_KR_KEY</code> 를 확인하세요.
        </p>
      ) : (
        <div className="space-y-6 pt-1">
          <SummaryCard terminal={current} now={now} />
          <ParkingSection
            lots={current.lots}
            terminal={current.id}
            observedAt={current.parkingObservedAt}
            stale={view.health.parking.stale}
            now={now}
          />
          <GateSection
            gates={current.gates}
            observedAt={current.gatesObservedAt}
            stale={view.health.departure.stale}
            now={now}
          />
        </div>
      )}
    </div>
  );
}

function TerminalToggle({
  terminal,
  onChange,
  view,
}: {
  terminal: TerminalId;
  onChange: (t: TerminalId) => void;
  view: StatusView;
}) {
  return (
    <div className="bg-muted flex items-center gap-0.5 rounded-full p-0.5" role="tablist" aria-label="터미널 선택">
      {view.terminals.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={terminal === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'rounded-full px-3 py-1 text-sm font-medium transition',
            terminal === t.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
