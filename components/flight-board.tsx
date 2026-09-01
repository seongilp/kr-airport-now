'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlaneLanding, PlaneTakeoff, RefreshCw } from 'lucide-react';
import type { FlightBoard as FlightBoardData, FlightSectionHealth } from '@/lib/flight-status';
import { FLIGHT_STATUS_LABEL, type Flight, type FlightDirection } from '@/lib/flights';
import { classifyByAirportCode, REGIONS, type Region } from '@/lib/regions';
import { airlineBadgeColor, parseAirlineCode } from '@/lib/airlines';
import { flightStatusStyle } from '@/lib/status-style';
import { formatKstClock, freshnessLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

/** 권역 필터 값. 'all' 은 전체. */
type RegionFilter = Region | 'all';

/** 일부 권역 칩에만 대표 국기를 붙인다(단일 국가인 것만; 동남아·유럽·기타는 여러 나라라 생략). */
const REGION_CHIP_FLAG: Partial<Record<Region, string>> = { 일본: '🇯🇵', 미국: '🇺🇸' };

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
  const [region, setRegion] = useState<RegionFilter>('all');
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

  // 권역 분류는 코드 기반 순수 계산이라 클라이언트에서 건다(서버 왕복 없음). 데이터 로직 불변.
  const regionCounts = useMemo(() => {
    const counts: Record<Region, number> = { 일본: 0, 동남아: 0, 미국: 0, 유럽: 0, 기타: 0 };
    for (const f of flights) counts[classifyByAirportCode(f.counterpartCode).region]++;
    return counts;
  }, [flights]);

  // 권역 미상(테이블에 없는 코드) 종류. 조용히 기타에 쌓이지 않게 개발자에게 남긴다.
  const unmapped = useMemo(() => {
    const set = new Map<string, string>();
    for (const f of flights) {
      const info = classifyByAirportCode(f.counterpartCode);
      if (!info.mapped) set.set(f.counterpartCode ?? '(코드없음)', f.counterpartName ?? '');
    }
    return set;
  }, [flights]);

  useEffect(() => {
    if (unmapped.size > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[kr-airport-now] 권역 미매핑 ${unmapped.size}종 — lib/regions.ts 갱신 필요:`,
        Object.fromEntries(unmapped),
      );
    }
  }, [unmapped]);

  const visibleFlights =
    region === 'all'
      ? flights
      : flights.filter((f) => classifyByAirportCode(f.counterpartCode).region === region);

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
            <>
              <RegionFilter
                selected={region}
                counts={regionCounts}
                total={flights.length}
                onSelect={setRegion}
              />
              {/* 기타 선택 시, 권역을 특정 못 한 편이 섞여 있으면 명시한다(결측을 숨기지 않는다). */}
              {region === '기타' && unmapped.size > 0 && (
                <p className="text-muted-foreground text-xs">
                  권역을 특정하지 못한 {unmapped.size}종의 공항 포함
                </p>
              )}
              {visibleFlights.length === 0 ? (
                <p className="text-muted-foreground bg-card rounded-xl border p-4 text-sm">
                  이 시간대에 {region} 권역 {dir === 'arrival' ? '도착' : '출발'} 편이 없습니다.
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleFlights.map((f) => (
                    <FlightRow key={f.key} flight={f} dir={dir} now={now} />
                  ))}
                </ul>
              )}
            </>
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

/**
 * 권역 필터 칩. 전체 + 사용자가 지정한 5개 권역(일본·동남아·미국·유럽·기타)을 건수와 함께.
 * 권역 taxonomy 는 고정 — 0건 권역도 숨기지 않고 흐리게(disabled) 둬서 목록이 예측 가능하게.
 */
function RegionFilter({
  selected,
  counts,
  total,
  onSelect,
}: {
  selected: RegionFilter;
  counts: Record<Region, number>;
  total: number;
  onSelect: (r: RegionFilter) => void;
}) {
  const chip = (value: RegionFilter, label: string, count: number, flag?: string) => {
    const active = selected === value;
    const empty = count === 0;
    return (
      <button
        key={value}
        type="button"
        role="tab"
        aria-selected={active}
        // 0건 권역은 눌러도 소용없으니 비활성. 단 전체는 항상 활성.
        disabled={empty && value !== 'all'}
        onClick={() => onSelect(value)}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
          active
            ? 'bg-primary text-primary-foreground border-primary'
            : 'text-muted-foreground hover:text-foreground border-border',
          empty && value !== 'all' && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
        )}
      >
        {flag && <span aria-hidden>{flag}</span>}
        {label}
        <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-60')}>{count}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="권역 필터">
      {chip('all', '전체', total)}
      {REGIONS.map((r) => chip(r, r, counts[r], REGION_CHIP_FLAG[r]))}
    </div>
  );
}

/**
 * 항공사 코드 배지. 편명 앞 2자(IATA)를 항공사별 결정적 색으로 — 로고 대체.
 * 로고 CDN(avs.io 등)은 미지원 코드에 404 대신 일반 실루엣을 주고(폴백 불가) 대부분 가로 워드마크라
 * 305px 카드에 안 맞아, 100% 커버·시프트 0·저작권 무해한 코드 배지를 택했다.
 */
function AirlineBadge({ code }: { code: string }) {
  const { background, color } = airlineBadgeColor(code);
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold tabular-nums"
      style={{ background, color }}
    >
      {code}
    </span>
  );
}

function FlightRow({ flight, dir, now }: { flight: Flight; dir: FlightDirection; now?: number }) {
  void now;
  const statusLabel = flight.statusText ?? FLIGHT_STATUS_LABEL[flight.status];
  const airlineCode = parseAirlineCode(flight.flightId);
  const { flag } = classifyByAirportCode(flight.counterpartCode);
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
          {/* 항공사 코드 배지(로고 대체). 파싱 실패하면 배지 없이 편명만. */}
          {airlineCode && <AirlineBadge code={airlineCode} />}
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

      {/* 목적지·항공사: 국기(있을 때만) + 방향 화살표 + 목적지 · 항공사. 좁으면 최대 2줄로 접는다. */}
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs break-words">
        {dir === 'arrival' ? '← ' : '→ '}
        {flag && <span aria-hidden>{flag} </span>}
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
