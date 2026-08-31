'use client';

import { useState } from 'react';
import { Plane } from 'lucide-react';
import type { StatusView } from '@/lib/incheon-status';
import { DEFAULT_AIRPORT_CODE, findAirport } from '@/lib/airports';
import { AirportPicker } from './airport-picker';
import { IncheonBoard } from './incheon-board';
import { FlightBoard } from './flight-board';
import { cn } from '@/lib/utils';

/**
 * 앱 최상위 셸. 제목 + 공항 선택기(고정 헤더)와, 선택 공항에 맞는 보드를 렌더한다.
 *
 * 공항별 데이터 비대칭을 여기서 가른다(lib/airports.ts 의 kind):
 *  - 인천(incheon): 주차·출국장·지도 + 운항 보드를 하위 탭으로 함께 제공한다.
 *    기본 탭은 기존 주차·출국장(회귀 안전) — 첫 페인트에 서버가 준 initial 을 그대로 쓴다.
 *    운항 탭은 IIAC(B551177)라 눌렀을 때 클라이언트가 /api/flights?airport=ICN 로 받는다.
 *  - 그 외(kac): 운항 보드만(선택 시 클라이언트가 /api/flights 로 받음).
 */
type IncheonMode = 'status' | 'flights';

export function AppShell({ incheonInitial }: { incheonInitial: StatusView }) {
  const [code, setCode] = useState<string>(DEFAULT_AIRPORT_CODE);
  const [incheonMode, setIncheonMode] = useState<IncheonMode>('status');
  const airport = findAirport(code) ?? findAirport(DEFAULT_AIRPORT_CODE)!;
  const isIncheon = airport.kind === 'incheon';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-10">
      <header className="bg-background/80 sticky top-0 z-10 -mx-4 mb-3 space-y-3 px-4 pt-5 pb-3 backdrop-blur">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Plane className="text-primary size-5" /> 공항 지금
        </h1>
        <AirportPicker selected={code} onSelect={setCode} />
        {isIncheon && <IncheonModeToggle mode={incheonMode} onChange={setIncheonMode} />}
      </header>

      <main>
        {isIncheon ? (
          incheonMode === 'status' ? (
            <IncheonBoard initial={incheonInitial} />
          ) : (
            <FlightBoard key="ICN" code="ICN" />
          )
        ) : (
          <FlightBoard key={airport.code} code={airport.code} />
        )}
      </main>

      <Footer isIncheon={isIncheon} incheonMode={incheonMode} />
    </div>
  );
}

/** 인천 하위 탭: 주차·출국장 ⇄ 운항. 인천만 두 소스가 있어 여기서 가른다. */
function IncheonModeToggle({
  mode,
  onChange,
}: {
  mode: IncheonMode;
  onChange: (m: IncheonMode) => void;
}) {
  return (
    <div className="bg-muted grid grid-cols-2 gap-1 rounded-full p-1" role="tablist" aria-label="인천 보기 방식">
      {(
        [
          ['status', '주차 · 출국장'],
          ['flights', '운항'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-full py-1.5 text-sm font-medium transition',
            mode === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Footer({ isIncheon, incheonMode }: { isIncheon: boolean; incheonMode: IncheonMode }) {
  // 인천 '주차·출국장' 탭만 IIAC 주차/혼잡도 안내, 그 외(인천 운항 포함 KAC/IIAC 운항)는 운항 안내.
  const showStatusNote = isIncheon && incheonMode === 'status';
  return (
    <footer className="text-muted-foreground mt-8 space-y-1 border-t pt-4 text-[11px] leading-relaxed">
      {showStatusNote ? (
        <>
          <p>
            데이터: 인천국제공항공사 공공데이터(주차 현황 · 출국장 혼잡도). 값은 분 단위로
            갱신되며, 표시된 &lsquo;기준&rsquo; 시각은 공항이 관측한 시각입니다.
          </p>
          <p>
            &lsquo;미운영&rsquo;은 자리·대기가 없다는 뜻이 아니라 그 시각에 운영하지 않는다는
            뜻입니다. 탑승·수속 시간은 반드시 항공사 안내를 따르세요.
          </p>
        </>
      ) : (
        <>
          <p>
            데이터: 공공데이터포털 운항정보(한국공항공사 B551178 · 인천공항은 인천국제공항공사
            B551177). 지금 시각 부근의 편만 보여 주며, &lsquo;수신&rsquo; 시각은 서버가 데이터를
            받은 시각입니다.
          </p>
          <p>
            상태(도착·출발·지연·결항)와 시각은 항공사·공항 사정으로 바뀔 수 있습니다. 탑승·수속
            시간은 반드시 항공사 안내를 따르세요.
          </p>
        </>
      )}
    </footer>
  );
}
