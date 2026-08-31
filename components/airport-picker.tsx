'use client';

import { AIRPORTS } from '@/lib/airports';
import { cn } from '@/lib/utils';

/**
 * 공항 선택기. 가로 스크롤 칩. 모바일에서 엄지로 훑게 만든다.
 * 선택은 색만으로 말하지 않으므로 aria-current + 굵기/배경을 함께 준다.
 */
export function AirportPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="공항 선택"
    >
      <div className="flex w-max gap-1.5">
        {AIRPORTS.map((a) => {
          const active = a.code === selected;
          return (
            <button
              key={a.code}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(a.code)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:text-foreground border-border',
              )}
            >
              {a.name}
              <span className={cn('ml-1 text-[10px]', active ? 'opacity-80' : 'opacity-60')}>
                {a.code}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
