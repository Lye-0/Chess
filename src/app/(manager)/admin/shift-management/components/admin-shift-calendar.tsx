import { weekdays } from "../constants";
import { getDateLabel } from "../date-utils";

const monthFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
});

export type CalendarDay = {
  value: number;
  date: string;
  outside: boolean;
};

export type CalendarDaySummary = {
  slotCount: number;
  requestCount: number;
  approvedCount: number;
  capacity: number;
};

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      {direction === "left" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
      )}
    </svg>
  );
}

function getSummaryTone(summary: CalendarDaySummary | undefined) {
  if (!summary || summary.slotCount === 0) {
    return "border-black/10 bg-white text-[#b4b7c0]";
  }

  if (summary.approvedCount >= summary.capacity) {
    return "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]";
  }

  if (summary.requestCount > 0) {
    return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
  }

  return "border-[#fde68a] bg-[#fffbeb] text-[#92400e]";
}

export function AdminShiftCalendar({
  displayMonth,
  days,
  selectedDate,
  todayDate,
  summaryByDate,
  onMonthChange,
  onSelectDate,
}: {
  displayMonth: Date;
  days: CalendarDay[];
  selectedDate: string | null;
  todayDate: string;
  summaryByDate: Record<string, CalendarDaySummary>;
  onMonthChange: (offset: number) => void;
  onSelectDate: (date: string) => void;
}) {
  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">カレンダーで日付を選択</h2>
          <p className="mt-1 text-xs text-[#717182]">
            日付ごとのシフト枠・希望者・承認状況を確認できます
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <button
            type="button"
            aria-label="前の月へ"
            onClick={() => onMonthChange(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#596074] shadow-sm transition hover:bg-[#eef2f7]"
          >
            <ChevronIcon direction="left" />
          </button>
          <p className="min-w-28 text-center text-sm font-semibold">
            {monthFormatter.format(displayMonth)}
          </p>
          <button
            type="button"
            aria-label="次の月へ"
            onClick={() => onMonthChange(1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#596074] shadow-sm transition hover:bg-[#eef2f7]"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-0.5 text-center text-xs font-semibold text-[#717182] sm:gap-1">
        {weekdays.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1">
        {days.map((day, index) => {
          const summary = summaryByDate[day.date];
          const hasSlots = Boolean(summary && summary.slotCount > 0);
          const selected = selectedDate === day.date;
          const disabled = day.outside || !hasSlots;
          const isToday = todayDate === day.date;

          return (
            <button
              key={`${day.date}-${index}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(day.date)}
              aria-label={
                hasSlots
                  ? `${getDateLabel(day.date)}、${summary.slotCount}枠、希望${summary.requestCount}人、承認${summary.approvedCount}人`
                  : `${getDateLabel(day.date)}、シフトなし`
              }
              className={[
                "flex min-h-[68px] flex-col items-start justify-start rounded-md border p-1 text-left transition sm:min-h-24 sm:p-2",
                selected
                  ? "border-[#030213] bg-[#030213] text-white shadow-sm"
                  : disabled
                    ? "cursor-not-allowed border-black/10 bg-[#f7f8fb] text-[#b4b7c0]"
                    : getSummaryTone(summary),
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:text-sm",
                  isToday
                    ? selected
                      ? "bg-white text-[#030213]"
                      : "bg-[#030213] text-white"
                    : "",
                ].join(" ")}
              >
                {day.value}
              </span>
              {hasSlots && summary ? (
                <span className="mt-1 grid gap-0.5 text-[10px] leading-tight sm:mt-2 sm:gap-1 sm:text-[11px]">
                  <span className={selected ? "text-white" : "text-current"}>
                    <span className="sm:hidden">枠{summary.slotCount}</span>
                    <span className="hidden sm:inline">{summary.slotCount}枠</span>
                  </span>
                  <span className={selected ? "text-white/90" : "text-[#475569]"}>
                    <span className="sm:hidden">希{summary.requestCount}</span>
                    <span className="hidden sm:inline">希望 {summary.requestCount}</span>
                  </span>
                  <span className={selected ? "text-white/90" : "text-[#475569]"}>
                    <span className="sm:hidden">承{summary.approvedCount}/{summary.capacity}</span>
                    <span className="hidden sm:inline">承認 {summary.approvedCount}/{summary.capacity}</span>
                  </span>
                </span>
              ) : (
                <span className="mt-1 block text-[10px] leading-tight sm:mt-2 sm:text-[11px]">-</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
