'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plane, RefreshCw } from 'lucide-react';
import type { StatusView, TerminalStatus } from '@/lib/incheon-status';
import type { TerminalId } from '@/lib/incheon';
import { ParkingSection } from './parking-section';
import { GateSection } from './gate-section';
import { SummaryCard } from './summary-card';
import { formatKstClock, freshnessLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

/** 관측 시각 라벨을 흐르게 하는 틱(30초). 데이터는 자동 새로고침(60초)이 따로 당긴다. */
const CLOCK_TICK_MS = 30_000;
const AUTO_REFRESH_MS = 60_000;

export function StatusBoard({ initial }: { initial: StatusView }) {
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
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 mb-3 bg-background/80 px-4 pt-5 pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Plane className="text-primary size-5" /> 인천공항 지금
          </h1>
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
        <p className="text-muted-foreground mt-1 text-xs">
          {formatKstClock(new Date(view.fetchedAt).getTime())} 수신 · {freshnessLabel(new Date(view.fetchedAt).getTime(), now)}
          {failedRefresh && <span className="text-amber-400"> · 새로고침 실패, 이전 값 표시 중</span>}
        </p>

        <TerminalToggle terminal={terminal} onChange={setTerminal} view={view} />
      </header>

      {keyMissing ? (
        <p className="bg-card rounded-xl border p-4 text-sm text-rose-300">
          인증키가 설정되지 않아 데이터를 불러올 수 없습니다. 서버의 <code>DATA_GO_KR_KEY</code> 를 확인하세요.
        </p>
      ) : (
        <main className="space-y-6">
          <SummaryCard terminal={current} now={now} />
          <ParkingSection
            lots={current.lots}
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
        </main>
      )}

      <Footer />
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
    <div className="bg-muted mt-3 grid grid-cols-2 gap-1 rounded-full p-1">
      {view.terminals.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'rounded-full py-1.5 text-sm font-medium transition',
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

function Footer() {
  return (
    <footer className="text-muted-foreground mt-8 space-y-1 border-t pt-4 text-[11px] leading-relaxed">
      <p>
        데이터: 인천국제공항공사 공공데이터(주차 현황 · 출국장 혼잡도). 값은 분 단위로 갱신되며,
        표시된 &lsquo;기준&rsquo; 시각은 공항이 관측한 시각입니다.
      </p>
      <p>
        &lsquo;미운영&rsquo;은 자리·대기가 없다는 뜻이 아니라 그 시각에 운영하지 않는다는 뜻입니다.
        탑승·수속 시간은 반드시 항공사 안내를 따르세요.
      </p>
    </footer>
  );
}
