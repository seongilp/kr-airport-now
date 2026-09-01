'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlaneLanding, PlaneTakeoff, RefreshCw } from 'lucide-react';
import type { FlightBoard as FlightBoardData, FlightSectionHealth } from '@/lib/flight-status';
import { FLIGHT_STATUS_LABEL, type Flight, type FlightDirection } from '@/lib/flights';
import { flightStatusStyle } from '@/lib/status-style';
import { formatKstClock, freshnessLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

const CLOCK_TICK_MS = 30_000;
/** 운항은 5분 캐시라 자동 새로고침도 느긋하게(2분). 캐시 HIT 이면 업스트림을 안 때린다. */
const AUTO_REFRESH_MS = 120_000;

/**
 * 공항 운항 보드. 도착/출발을 토글로 가르고, 각 편은 시각·상태(원문)·상대 공항·게이트를
 * 한 줄에 보여 준다. 결측은 결측으로(상태 없으면 '미정', 게이트 없으면 표시 안 함).
 */
export function FlightBoard({
  code,
  initial,
}: {
  code: string;
  /** 서버에서 미리 받아온 보드(있으면 첫 페인트에 씀). 없으면 클라이언트가 받는다. */
  initial?: FlightBoardData;
}) {
  const [board, setBoard] = useState<FlightBoardData | null>(initial ?? null);
  const [dir, setDir] = useState<FlightDirection>('departure');
  const [now, setNow] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(!initial);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/flights?airport=${encodeURIComponent(code)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as FlightBoardData;
      setBoard(next);
      setNow(Date.now());
    } catch {
      // 실패해도 화면을 비우지 않는다. 이전 값을 유지하고 표시만 한다.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    // 마운트 시 초기 데이터가 없으면(또는 다른 공항 값이면) 한 번 받아 온다.
    // AppShell 이 공항 코드로 remount 하므로 마운트당 한 공항이다.
    // 원격 데이터 fetch 는 effect 의 정당한 용도라 set-state-in-effect 를 명시적으로 허용한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial || initial.airportCode !== code) load();
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const auto = setInterval(load, AUTO_REFRESH_MS);
    return () => {
      clearInterval(clock);
      clearInterval(auto);
    };
  }, [load, code, initial]);

  const flights = board ? (dir === 'arrival' ? board.arrivals : board.departures) : [];
  const health: FlightSectionHealth | null = board
    ? dir === 'arrival'
      ? board.health.arrivals
      : board.health.departures
    : null;
  const keyMissing =
    board?.health.arrivals.error?.code === 'NO_KEY' ||
    board?.health.departures.error?.code === 'NO_KEY';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <DirectionToggle dir={dir} onChange={setDir} />
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-50"
          aria-label="새로고침"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          {loading ? '갱신 중' : '새로고침'}
        </button>
      </div>

      {board && (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
          <span>
            {formatKstClock(new Date(board.fetchedAt).getTime())} 수신 ·{' '}
            {freshnessLabel(new Date(board.fetchedAt).getTime(), now)}
          </span>
          <span aria-hidden>·</span>
          <span>
            {board.window.from.slice(0, 2)}:{board.window.from.slice(2)}~{board.window.to.slice(0, 2)}
            :{board.window.to.slice(2)} 창
          </span>
          {failed && <span className="text-amber-400">· 새로고침 실패, 이전 값 표시 중</span>}
        </p>
      )}

      {keyMissing ? (
        <p className="bg-card rounded-xl border p-4 text-sm text-rose-300">
          인증키가 설정되지 않아 데이터를 불러올 수 없습니다. 서버의 <code>DATA_GO_KR_KEY</code> 를
          확인하세요.
        </p>
      ) : health && !health.ok && !health.stale ? (
        <p className="bg-card rounded-xl border p-4 text-sm text-rose-300">
          운항 정보를 불러오지 못했습니다{health.error ? ` (${health.error.code})` : ''}.
        </p>
      ) : (
        <>
          {health?.stale && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              최신 운항 정보를 받지 못해 마지막으로 받은 값을 보여 주고 있습니다.
            </p>
          )}
          {loading && !board ? (
            <p className="text-muted-foreground text-sm">불러오는 중…</p>
          ) : flights.length === 0 ? (
            <p className="text-muted-foreground bg-card rounded-xl border p-4 text-sm">
              이 시간대에 표시할 {dir === 'arrival' ? '도착' : '출발'} 항공편이 없습니다.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {flights.map((f) => (
                <FlightRow key={f.key} flight={f} dir={dir} now={now} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function DirectionToggle({
  dir,
  onChange,
}: {
  dir: FlightDirection;
  onChange: (d: FlightDirection) => void;
}) {
  return (
    <div className="bg-muted flex items-center gap-0.5 rounded-full p-0.5" role="tablist" aria-label="도착/출발">
      <button
        type="button"
        role="tab"
        aria-selected={dir === 'departure'}
        onClick={() => onChange('departure')}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition',
          dir === 'departure' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <PlaneTakeoff className="size-3.5" /> 출발
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={dir === 'arrival'}
        onClick={() => onChange('arrival')}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition',
          dir === 'arrival' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <PlaneLanding className="size-3.5" /> 도착
      </button>
    </div>
  );
}

function FlightRow({ flight, dir, now }: { flight: Flight; dir: FlightDirection; now?: number }) {
  void now;
  const statusLabel = flight.statusText ?? FLIGHT_STATUS_LABEL[flight.status];
  const cancelled = flight.status === 'cancelled';
  // 지연: 예정과 예상이 다르고 15분 이상 벌어질 때만 예상 시각을 강조한다.
  const showEstimated =
    flight.estimatedAt !== null &&
    flight.scheduledAt !== null &&
    (flight.delayMinutes ?? 0) >= 5;

  return (
    <li className="bg-card flex h-full flex-col rounded-xl border p-3">
      {/* 1줄: 편명(+노선 배지)  |  예정 시각. 좁은 카드에서도 1급 정보를 위로. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold tabular-nums">
            {flight.flightId || '편명 미상'}
          </p>
          {flight.line && (
            <span className="text-muted-foreground shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
              {flight.line}
            </span>
          )}
        </div>
        {flight.scheduledAt !== null ? (
          <p
            className={cn(
              'shrink-0 text-lg leading-none font-bold tabular-nums',
              cancelled && 'text-muted-foreground line-through',
            )}
          >
            {formatKstClock(flight.scheduledAt)}
          </p>
        ) : (
          <p className="text-muted-foreground shrink-0 text-sm">시각 미상</p>
        )}
      </div>

      {/* 목적지·항공사: 좁아지면 잘라 버리지 않고 최대 2줄로 접는다. */}
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs break-words">
        {dir === 'arrival' ? '← ' : '→ '}
        {flight.counterpartName ?? '목적지 미상'}
        {flight.airline ? ` · ${flight.airline}` : ''}
      </p>

      {/* 상태 배지 + 지연 강조. 지연(주황)은 이 화면의 핵심이라 눈에 띄게 유지. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={cn(
            'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
            flightStatusStyle(flight.status),
          )}
        >
          {statusLabel}
        </span>
        {showEstimated && (
          <span className="text-xs font-medium text-amber-400 tabular-nums">
            변경 {formatKstClock(flight.estimatedAt as number)}
            {flight.delayMinutes ? ` (+${flight.delayMinutes}분)` : ''}
          </span>
        )}
      </div>

      {/* 게이트/수취대(2급): 있을 때만, 카드 맨 아래에 정렬(mt-auto). 결측은 지어내지 않는다. */}
      {(flight.gate || flight.carousel || flight.terminal) && (
        <div className="text-muted-foreground mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 text-[11px]">
          {flight.terminal && <span>터미널 {flight.terminal}</span>}
          {flight.gate && <span>탑승구 {flight.gate}</span>}
          {flight.carousel && <span>수취대 {flight.carousel}</span>}
        </div>
      )}
    </li>
  );
}
