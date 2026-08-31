'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { formatKstClock, freshnessLabel, isStaleObservation } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * '언제 관측된 값인지' 를 정직하게 보여 준다. 이 앱을 고른 이유 그 자체다.
 * observedAt 이 null 이면(파싱 실패) 시각을 지어내지 않고 '시각 불명' 이라고 쓴다.
 */
export function Freshness({
  observedAt,
  className,
  now,
}: {
  observedAt: number | null;
  className?: string;
  /** 테스트/SSR 일관성용. 기본은 렌더 시점. */
  now?: number;
}) {
  if (observedAt === null) {
    return (
      <span className={cn('text-muted-foreground inline-flex items-center gap-1 text-xs', className)}>
        <Clock className="size-3" /> 관측 시각 불명
      </span>
    );
  }
  const stale = isStaleObservation(observedAt, now);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        stale ? 'text-amber-400' : 'text-muted-foreground',
        className,
      )}
    >
      {stale ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
      {formatKstClock(observedAt)} 기준 · {freshnessLabel(observedAt, now)}
      {stale && ' (지연)'}
    </span>
  );
}
