/**
 * 원시 항공편 응답 → 화면용 모델. **순수 함수만**(node:test 로 검증).
 *
 * 이 파일이 푸는 두 가지 함정:
 *
 *  1. **필드명 케이싱이 서비스마다 다르다.** 같은 '예정시각' 이
 *       한국공항공사(B551178)      `scheduledatetime`   (전부 소문자)
 *       인천 여객기 상세(B551177)   `scheduleDateTime`   (D·T 대문자)
 *       인천 항공기 상세(B551177)   `scheduleDatetime`   (t 소문자)
 *     처럼 온다. 하나로 뭉쳐 `raw.scheduledatetime` 을 읽으면 다른 서비스에선 조용히
 *     `undefined` 가 된다. 그래서 **키를 소문자로 접어(case-insensitive) 조회**한다 —
 *     `pick(raw, 'scheduledatetime')` 하나가 세 케이싱을 모두 잡는다.
 *
 *  2. **상대 공항 필드가 방향·서비스마다 이름이 다르다.**
 *       B551178 도착: 출발지 `depAirport`/`depAirportCode`
 *       B551178 출발: 목적지 `arrAirport`/`arrvAirportCode`  (arr**v** — v 가 붙는다)
 *       B551177    : `airport`/`airportCode` (도착이면 출발지, 출발이면 목적지)
 *     방향을 알아야 어느 필드가 '상대 공항' 인지 정해지므로 `direction` 을 받아 고른다.
 *
 * 결측 원칙(형제 앱 사고 방지): 상태(remark/rmkKor)가 비면 '정상' 이 아니라 **'미정'**.
 * 게이트가 없으면 지어내지 않고 null.
 */

import { parseKstStamp } from './time';

/** 원시 레코드. 서비스마다 키 케이싱/이름이 달라 느슨하게 받는다. */
export type RawFlight = Record<string, unknown>;

export type FlightDirection = 'arrival' | 'departure';

/**
 * 운항 상태 범주. 색/정렬용으로만 쓰고, 화면 라벨은 원문(remark)을 그대로 보여 준다
 * (한글 원문이 가장 정확하다). 원문이 비면 unknown → '미정'.
 */
export type FlightStatus =
  | 'scheduled' // 예정(출발/도착 전)
  | 'delayed' // 지연
  | 'boarding' // 탑승/수속 중
  | 'departed' // 출발함
  | 'arrived' // 도착함
  | 'cancelled' // 결항/사전결항/회항
  | 'unknown'; // 상태 정보 없음

export interface Flight {
  /** 편명. 예: `KE1150`. 없으면 빈 문자열(키로 못 쓰니 fid 보조). */
  flightId: string;
  /** 안정적 고유 키(정렬/리스트용). fid 우선, 없으면 편명+시각. */
  key: string;
  airline: string | null;
  /** 상대 공항 표시명(도착=출발지, 출발=목적지). */
  counterpartName: string | null;
  /** 상대 공항 코드. */
  counterpartCode: string | null;
  /** 국내/국제 원문(`국내`/`국제`) 또는 null. */
  line: string | null;
  /** 예정 시각(epoch ms). 파싱 실패면 null. */
  scheduledAt: number | null;
  /** 변경(예상) 시각(epoch ms). 없거나 파싱 실패면 null. */
  estimatedAt: number | null;
  /** 상태 원문(그대로 표시). 비면 null → 화면에서 '미정'. */
  statusText: string | null;
  /** 상태 범주(색/정렬). */
  status: FlightStatus;
  /** 탑승구. 없으면 null(지어내지 않는다). */
  gate: string | null;
  /** 수하물 수취대(도착·인천 상세만). 없으면 null. */
  carousel: string | null;
  /** 터미널 식별자(인천 상세만). 예: `P01`/`P02`. */
  terminal: string | null;
  /** 예정 대비 지연 분. 계산 불가면 null. 양수면 지연, 음수면 당김. */
  delayMinutes: number | null;
}

/** 키를 소문자로 접어 조회한다. 세 서비스의 케이싱 차이를 한 번에 흡수한다. */
function pick(raw: RawFlight, ...names: string[]): string | null {
  // 원시 키를 소문자→원본으로 접어 둔다(레코드마다 한 번).
  for (const name of names) {
    const target = name.toLowerCase();
    for (const key of Object.keys(raw)) {
      if (key.toLowerCase() === target) {
        const v = raw[key];
        if (v == null) continue;
        const s = String(v).trim();
        if (s === '') continue; // 빈 문자열은 결측으로 본다(0/정상으로 뭉개지 않는다)
        return s;
      }
    }
  }
  return null;
}

/** 상태 원문 → 범주. 키워드 부분일치로 서비스별 표기 차이를 흡수한다. */
export function classifyStatus(text: string | null): FlightStatus {
  if (!text) return 'unknown';
  const t = text.replace(/\s/g, '');
  if (/(결항|회항|취소|CANCEL|DIVERT|RETURN)/i.test(t)) return 'cancelled';
  if (/(지연|DELAY)/i.test(t)) return 'delayed';
  if (/(탑승|수속|마감|BOARD|CHECK|FINAL|GATE\s*OPEN)/i.test(t)) return 'boarding';
  if (/(출발|이륙|DEPART)/i.test(t)) return 'departed';
  if (/(도착|착륙|ARRIV|LAND)/i.test(t)) return 'arrived';
  return 'scheduled'; // 그 외는 예정으로 본다(원문은 그대로 보여 주므로 손해가 없다)
}

/**
 * 원시 레코드 → Flight. direction 으로 '상대 공항' 필드를 고른다.
 *
 * 상대 공항(방향·서비스별 필드명 매핑):
 *   도착: 출발지 = depAirport(B551178) / airport(B551177)
 *   출발: 목적지 = arrAirport(B551178) / airport(B551177), 코드는 arrvAirportCode(v!)
 */
export function toFlight(raw: RawFlight, direction: FlightDirection): Flight {
  const flightId = pick(raw, 'flightid') ?? '';
  const fid = pick(raw, 'fid');
  const scheduledRaw = pick(raw, 'scheduledatetime', 'std');
  const scheduledAt = parseFlightStamp(scheduledRaw);
  const estimatedAt = parseFlightStamp(pick(raw, 'estimateddatetime', 'etd'));

  let counterpartName: string | null;
  let counterpartCode: string | null;
  if (direction === 'arrival') {
    counterpartName = pick(raw, 'depairport', 'airport');
    counterpartCode = pick(raw, 'depairportcode', 'airportcode');
  } else {
    counterpartName = pick(raw, 'arrairport', 'airport');
    // 출발은 상대 코드가 arrvAirportCode(v) 로 온다 — arrAirportCode 도 방어.
    counterpartCode = pick(raw, 'arrvairportcode', 'arrairportcode', 'airportcode');
  }

  const statusText = pick(raw, 'rmkkor', 'remark');
  const status = classifyStatus(statusText);

  const delayMinutes =
    scheduledAt !== null && estimatedAt !== null
      ? Math.round((estimatedAt - scheduledAt) / 60000)
      : null;

  return {
    flightId,
    key: fid ?? `${flightId}-${scheduledRaw ?? ''}-${direction}`,
    airline: pick(raw, 'airline'),
    counterpartName,
    counterpartCode,
    line: pick(raw, 'line'),
    scheduledAt,
    estimatedAt,
    statusText,
    status,
    gate: pick(raw, 'gatenumber', 'gate'),
    carousel: pick(raw, 'carousel'),
    terminal: pick(raw, 'terminalid'),
    delayMinutes,
  };
}

/**
 * 항공편 시각 파싱. 12자리 `YYYYMMDDHHMM`(초 없음) 또는 14자리 `YYYYMMDDHHMMSS`.
 * time.ts 의 parseKstStamp 는 14자리를 받으므로, 12자리는 `00` 초를 붙여 위임한다.
 * 4자리(HHMM, /info 의 std/etd)는 날짜가 없어 파싱하지 않는다(그 소스는 쓰지 않는다).
 */
export function parseFlightStamp(value: string | null): number | null {
  if (!value) return null;
  const digits = value.trim();
  if (/^\d{14}$/.test(digits)) return parseKstStamp(digits);
  if (/^\d{12}$/.test(digits)) return parseKstStamp(digits + '00');
  return null;
}

/** 상태 범주 → 한글 라벨(원문이 없을 때의 폴백/보조). */
export const FLIGHT_STATUS_LABEL: Record<FlightStatus, string> = {
  scheduled: '예정',
  delayed: '지연',
  boarding: '탑승',
  departed: '출발',
  arrived: '도착',
  cancelled: '결항',
  unknown: '미정',
};

/** 시각 순 정렬(예정 시각 기준, 결측은 뒤로). */
export function sortByScheduled(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) => {
    if (a.scheduledAt === null) return 1;
    if (b.scheduledAt === null) return -1;
    return a.scheduledAt - b.scheduledAt;
  });
}
