'use client';

import { useState } from 'react';
import { Plane } from 'lucide-react';
import type { StatusView } from '@/lib/incheon-status';
import { DEFAULT_AIRPORT_CODE, findAirport } from '@/lib/airports';
import { AirportPicker } from './airport-picker';
import { IncheonBoard } from './incheon-board';
import { FlightBoard } from './flight-board';

/**
 * 앱 최상위 셸. 제목 + 공항 선택기(고정 헤더)와, 선택 공항에 맞는 보드를 렌더한다.
 *
 * 공항별 데이터 비대칭을 여기서 가른다(lib/airports.ts 의 kind):
 *  - 인천(incheon): 주차·출국장·지도(IncheonBoard, 서버가 미리 받은 initial 사용).
 *  - 그 외(kac): 운항 보드(FlightBoard, 선택 시 클라이언트가 /api/flights 로 받음).
 */
export function AppShell({ incheonInitial }: { incheonInitial: StatusView }) {
  const [code, setCode] = useState<string>(DEFAULT_AIRPORT_CODE);
  const airport = findAirport(code) ?? findAirport(DEFAULT_AIRPORT_CODE)!;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-10">
      <header className="bg-background/80 sticky top-0 z-10 -mx-4 mb-3 space-y-3 px-4 pt-5 pb-3 backdrop-blur">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Plane className="text-primary size-5" /> 공항 지금
        </h1>
        <AirportPicker selected={code} onSelect={setCode} />
      </header>

      <main>
        {airport.kind === 'incheon' ? (
          <IncheonBoard initial={incheonInitial} />
        ) : (
          <FlightBoard key={airport.code} code={airport.code} />
        )}
      </main>

      <Footer isIncheon={airport.kind === 'incheon'} />
    </div>
  );
}

function Footer({ isIncheon }: { isIncheon: boolean }) {
  return (
    <footer className="text-muted-foreground mt-8 space-y-1 border-t pt-4 text-[11px] leading-relaxed">
      {isIncheon ? (
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
            데이터: 한국공항공사 전국 운항현황(공공데이터포털 B551178). 지금 시각 부근의 편만
            보여 주며, 표시된 &lsquo;수신&rsquo; 시각은 서버가 데이터를 받은 시각입니다.
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
