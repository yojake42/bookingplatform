import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonthsIso, applyDayClick, dayState, monthGrid, monthKey, todayIso } from '../lib/calendar';
import type { DateSpan } from '../lib/types';

type Props = {
  checkIn: string | null;
  checkOut: string | null;
  onChange: (value: { checkIn: string | null; checkOut: string | null }) => void;
  unavailable?: DateSpan[];
  minNights?: number;
  maxNights?: number;
  months?: 1 | 2;
  /** Maximum months ahead that can be browsed. */
  horizonMonths?: number;
  /** The home's local date; defaults to the viewer's. */
  today?: string;
};

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DateRangeCalendar({ checkIn, checkOut, onChange, unavailable = [], minNights = 1, maxNights = 365, months = 2, horizonMonths = 18, today: homeToday }: Props) {
  const today = homeToday ?? todayIso();
  const firstMonth = `${monthKey(today)}-01`;
  const [viewMonth, setViewMonth] = useState(() => `${monthKey(checkIn ?? today)}-01`);
  const [hovered, setHovered] = useState<string | null>(null);
  const lastMonth = addMonthsIso(firstMonth, horizonMonths - months);

  const context = useMemo(
    () => ({ today, spans: unavailable, checkIn, checkOut, minNights, maxNights }),
    [today, unavailable, checkIn, checkOut, minNights, maxNights],
  );

  const choosingCheckOut = Boolean(checkIn && !checkOut);
  const rangeEnd = checkOut ?? (choosingCheckOut && hovered && hovered > checkIn! && dayState(hovered, context).canCheckOut ? hovered : null);

  const visible = Array.from({ length: months }, (_, index) => addMonthsIso(viewMonth, index));

  return (
    <div className="select-none">
      <div className="relative flex gap-8">
        <button
          type="button"
          aria-label="Previous month"
          disabled={viewMonth <= firstMonth}
          onClick={() => setViewMonth(addMonthsIso(viewMonth, -1))}
          className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-md border border-ink-300 bg-white transition hover:border-pine-700 disabled:opacity-25"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          disabled={viewMonth >= lastMonth}
          onClick={() => setViewMonth(addMonthsIso(viewMonth, 1))}
          className="absolute top-0 right-0 flex size-8 items-center justify-center rounded-md border border-ink-300 bg-white transition hover:border-pine-700 disabled:opacity-25"
        >
          <ChevronRight className="size-4" />
        </button>

        {visible.map((month) => (
          <div key={month} className="min-w-0 flex-1">
            <div className="display mb-4 flex h-8 items-center justify-center text-xl">{format(parseISO(month), 'MMMM')}<span className="ml-2 font-light text-ink-400">{format(parseISO(month), 'yyyy')}</span></div>
            <div className="grid grid-cols-7 text-center text-[10px] font-bold tracking-[0.14em] text-ink-400 uppercase">
              {weekdays.map((day) => (
                <div key={day} className="pb-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7" onMouseLeave={() => setHovered(null)}>
              {monthGrid(month).map((iso, index) => {
                if (!iso) return <div key={`blank-${index}`} />;
                const state = dayState(iso, context);
                const isStart = iso === checkIn;
                const isEnd = iso === rangeEnd;
                const inRange = Boolean(checkIn && rangeEnd && iso > checkIn && iso < rangeEnd);
                const selectable = choosingCheckOut ? state.canCheckOut || state.canCheckIn : state.canCheckIn;
                const column = index % 7;
                const band = inRange || (isStart && rangeEnd) || (isEnd && checkIn);
                return (
                  <div
                    key={iso}
                    className={clsx(
                      'relative flex h-11 items-center justify-center',
                      band && 'bg-pine-50',
                      isStart && rangeEnd && 'rounded-l-md',
                      isEnd && checkIn && 'rounded-r-md',
                      inRange && column === 0 && 'rounded-l-md',
                      inRange && column === 6 && 'rounded-r-md',
                    )}
                  >
                    <button
                      type="button"
                      disabled={!selectable}
                      title={!selectable ? (state.hint ?? (state.past ? undefined : 'Unavailable')) : (state.hint ?? undefined)}
                      onMouseEnter={() => setHovered(iso)}
                      onClick={() => {
                        const next = applyDayClick(iso, { checkIn, checkOut }, state);
                        if (next) onChange(next);
                      }}
                      className={clsx(
                        'relative flex size-11 items-center justify-center rounded-md text-sm font-semibold tabular-nums transition-colors',
                        isStart || isEnd
                          ? 'bg-pine-700 text-paper'
                          : selectable
                            ? 'text-ink-900 hover:bg-white hover:ring-1 hover:ring-pine-700'
                            : 'cursor-not-allowed text-ink-300',
                        !selectable && state.blocked && !state.past && 'line-through decoration-ink-300',
                      )}
                    >
                      {Number(iso.slice(8))}
                      {iso === today && !isStart && !isEnd && <span className="absolute bottom-1.5 h-0.5 w-3 rounded-full bg-brass" />}
                    </button>
                    {choosingCheckOut && hovered === iso && state.hint && !state.canCheckOut && (
                      <span className="pointer-events-none absolute -top-7 z-10 rounded-md bg-ink-900 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow-lg">
                        {state.hint}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
