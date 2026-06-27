"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  getEmployeeSessionServerSnapshot,
  getEmployeeSessionSnapshot,
  loadEmployeeSession,
  parseEmployeeSessionSnapshot,
  subscribeEmployeeSession,
} from "@/lib/people";
import {
  formatShiftTimeRange,
  subscribeShiftSlots,
  type ShiftSlot,
} from "@/lib/shiftSlots";
import {
  createEmployeeGeneratedShiftRequests,
  createShiftRequests,
  isShiftStartInFuture,
  subscribeEmployeeShiftRequests,
  withdrawEmployeeShiftRequest,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import {
  subscribePositions,
  type OrganizationPosition,
} from "@/lib/managerOrganizations";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const monthFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
});
const timelineLaneHeight = 84;
const timelineSlotBarHeight = 72;
const positionColorClasses = [
  "border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]",
  "border-[#86efac] bg-[#dcfce7] text-[#166534]",
  "border-[#c4b5fd] bg-[#ede9fe] text-[#6d28d9]",
  "border-[#fcd34d] bg-[#fef3c7] text-[#92400e]",
  "border-[#f9a8d4] bg-[#fce7f3] text-[#be185d]",
  "border-[#67e8f9] bg-[#cffafe] text-[#0e7490]",
];

type CalendarDaySummary = {
  slotCount: number;
  availableCount: number;
  draftCount: number;
  requestedCount: number;
};

type TimelineSlot = {
  slot: ShiftSlot;
  startMinutes: number;
  endMinutes: number;
  lane: number;
};

type DraftShift = ShiftSlot & {
  isEmployeeGenerated?: boolean;
};

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}

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

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2 11 13" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="#ff650b"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 4.7 2.9 18a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const weekday = weekdays[parsedDate.getDay()];

  return `${year}年${month}月${day}日（${weekday}）`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function getMonthCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = firstDay + daysInMonth > 35 ? 42 : 35;
  const firstCalendarDate = new Date(year, month, 1 - firstDay);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(firstCalendarDate);
    date.setDate(firstCalendarDate.getDate() + index);

    return {
      value: date.getDate(),
      date: toDateString(date),
      outside: date.getMonth() !== month,
    };
  });
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sortSlots(slots: ShiftSlot[]) {
  return [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

function getSlotPositionLabel(slot: Pick<ShiftSlot, "positionName">) {
  return slot.positionName || "ポジション未設定";
}

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function isValidShiftTime(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;

  const [hour, minute] = time.split(":").map(Number);

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidShiftTimeRange(startTime: string, endTime: string) {
  return isValidShiftTime(startTime) && isValidShiftTime(endTime) && startTime !== endTime;
}

function toTimelineSlot(slot: ShiftSlot) {
  const startMinutes = parseTimeToMinutes(slot.startTime);
  const rawEndMinutes = parseTimeToMinutes(slot.endTime);
  const endMinutes =
    rawEndMinutes <= startMinutes ? rawEndMinutes + 24 * 60 : rawEndMinutes;

  return { slot, startMinutes, endMinutes };
}

function getPositionColor(positionName: string) {
  const source = positionName || "ポジション未設定";
  const hash = Array.from(source).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return positionColorClasses[hash % positionColorClasses.length];
}

function getTimelineRange(timelineSlots: ReturnType<typeof toTimelineSlot>[]) {
  const firstStart = Math.min(...timelineSlots.map((item) => item.startMinutes));
  const lastEnd = Math.max(...timelineSlots.map((item) => item.endMinutes));
  const startHour = Math.max(0, Math.min(9, Math.floor(firstStart / 60) - 1));
  const endHour = Math.min(30, Math.max(18, Math.ceil(lastEnd / 60) + 1));

  return {
    startMinutes: startHour * 60,
    endMinutes: endHour * 60,
    hours: Array.from({ length: endHour - startHour + 1 }, (_, index) =>
      startHour + index,
    ),
  };
}

function assignLanes(slots: ShiftSlot[]): TimelineSlot[] {
  const laneEndMinutes: number[] = [];

  return slots
    .map(toTimelineSlot)
    .sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return a.endMinutes - b.endMinutes;
    })
    .map((item) => {
      const lane = laneEndMinutes.findIndex(
        (endMinutes) => endMinutes <= item.startMinutes,
      );
      const nextLane = lane >= 0 ? lane : laneEndMinutes.length;
      laneEndMinutes[nextLane] = item.endMinutes;

      return { ...item, lane: nextLane };
    });
}

function formatHourLabel(hour: number) {
  const normalizedHour = hour % 24;
  const label = `${normalizedHour}:00`;

  return hour >= 24 ? `翌${label}` : label;
}

function getCalendarSummaryTone(summary: CalendarDaySummary | undefined) {
  if (!summary || summary.slotCount === 0) {
    return "border-black/10 bg-white text-[#b4b7c0]";
  }

  if (summary.availableCount > 0) {
    return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
  }

  if (summary.draftCount > 0) {
    return "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]";
  }

  return "border-black/10 bg-[#f7f8fb] text-[#717182]";
}

function getCalendarDayLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const weekday = weekdays[parsedDate.getDay()];

  return `${month}月${day}日（${weekday}）`;
}

function EmployeeShiftCalendar({
  displayMonth,
  days,
  selectedDate,
  todayDate,
  summaryByDate,
  onMonthChange,
  onSelectDate,
}: {
  displayMonth: Date;
  days: ReturnType<typeof getMonthCalendarDays>;
  selectedDate: string | null;
  todayDate: string;
  summaryByDate: Record<string, CalendarDaySummary>;
  onMonthChange: (offset: number) => void;
  onSelectDate: (date: string) => void;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">カレンダーで日付を選択</h2>
          <p className="mt-1 text-xs text-[#717182]">
            日付ごとの募集枠と選択状況を確認できます
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
          const disabled = day.outside || day.date < todayDate;

          return (
            <button
              key={`${day.date}-${index}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(day.date)}
              aria-label={
                hasSlots && summary
                  ? `${getCalendarDayLabel(day.date)}、募集${summary.slotCount}枠、選択可能${summary.availableCount}枠、追加済み${summary.draftCount}枠、希望済み${summary.requestedCount}枠`
                  : `${getCalendarDayLabel(day.date)}、募集なし`
              }
              className={[
                "min-h-[68px] rounded-md border p-1 text-left transition sm:min-h-24 sm:p-2",
                selected
                  ? "border-[#030213] bg-[#030213] text-white shadow-sm"
                  : disabled
                    ? "cursor-not-allowed border-black/10 bg-[#f7f8fb] text-[#b4b7c0]"
                    : getCalendarSummaryTone(summary),
                day.date === todayDate && !selected && !disabled
                  ? "ring-2 ring-[#030213]/20"
                  : "",
              ].join(" ")}
            >
              <span className="block text-xs font-semibold sm:text-sm">{day.value}</span>
              {hasSlots && summary ? (
                <span className="mt-1 grid gap-0.5 text-[10px] leading-tight sm:mt-2 sm:gap-1 sm:text-[11px]">
                  <span className={selected ? "text-white" : "text-current"}>
                    <span className="sm:hidden">募{summary.slotCount}</span>
                    <span className="hidden sm:inline">募集 {summary.slotCount}</span>
                  </span>
                  <span className={selected ? "text-white/90" : "text-[#475569]"}>
                    <span className="sm:hidden">可{summary.availableCount}</span>
                    <span className="hidden sm:inline">選択可 {summary.availableCount}</span>
                  </span>
                  {(summary.draftCount > 0 || summary.requestedCount > 0) && (
                    <span className={selected ? "text-white/90" : "text-[#475569]"}>
                      <span className="sm:hidden">
                        追{summary.draftCount}/済{summary.requestedCount}
                      </span>
                      <span className="hidden sm:inline">
                        追加 {summary.draftCount} / 済 {summary.requestedCount}
                      </span>
                    </span>
                  )}
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

function SelectedDayShiftTimeline({
  date,
  slots,
  requestedSlotIds,
  approvedSlotIds,
  pendingRequestBySlotId,
  draftSlotIds,
  withdrawingRequestId,
  onAddSlot,
  onWithdraw,
}: {
  date: string;
  slots: ShiftSlot[];
  requestedSlotIds: Set<string>;
  approvedSlotIds: Set<string>;
  pendingRequestBySlotId: Record<string, ShiftRequest>;
  draftSlotIds: Set<string>;
  withdrawingRequestId: string | null;
  onAddSlot: (slot: ShiftSlot) => void;
  onWithdraw: (request: ShiftRequest) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineSlots = useMemo(() => assignLanes(slots), [slots]);
  const hasSlots = timelineSlots.length > 0;
  const laneCount = hasSlots
    ? Math.max(...timelineSlots.map((item) => item.lane)) + 1
    : 1;
  const { startMinutes, endMinutes, hours } = hasSlots
    ? getTimelineRange(timelineSlots)
    : { startMinutes: 0, endMinutes: 60, hours: [] };
  const totalMinutes = endMinutes - startMinutes;
  const timelineWidth = Math.max(720, Math.max(1, hours.length - 1) * 72);
  const bodyHeight = Math.max(112, laneCount * timelineLaneHeight + 20);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasSlots) return;

    const firstStart = Math.min(...timelineSlots.map((item) => item.startMinutes));
    const scrollRatio = Math.max(0, (firstStart - startMinutes) / totalMinutes);
    container.scrollLeft = scrollRatio * (container.scrollWidth - container.clientWidth);
  }, [hasSlots, startMinutes, timelineSlots, totalMinutes]);

  if (!hasSlots) {
    return (
      <section className="rounded-lg border border-black/10 bg-white p-4 text-sm text-[#717182]">
        {formatDateLabel(date)} の募集シフト枠はありません
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{formatDateLabel(date)} の時間ビュー</h2>
          <p className="mt-1 text-xs text-[#717182]">
            募集枠を選んで希望に追加できます
          </p>
        </div>
        <p className="text-xs text-[#717182]">横にスクロールできます</p>
      </div>

      <div ref={scrollContainerRef} className="mt-3 overflow-x-auto pb-2">
        <div style={{ width: timelineWidth }}>
          <div className="relative h-7 border-b border-black/10 text-[11px] font-semibold text-[#717182]">
            {hours.map((hour) => {
              const left = ((hour * 60 - startMinutes) / totalMinutes) * 100;

              return (
                <span
                  key={hour}
                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${left}%` }}
                >
                  {formatHourLabel(hour)}
                </span>
              );
            })}
          </div>

          <div
            className="relative rounded-b-md bg-[#f8fafc]"
            style={{ height: bodyHeight }}
          >
            {hours.map((hour) => {
              const left = ((hour * 60 - startMinutes) / totalMinutes) * 100;

              return (
                <span
                  key={hour}
                  aria-hidden="true"
                  className="absolute top-0 h-full border-l border-black/10"
                  style={{ left: `${left}%` }}
                />
              );
            })}

            {timelineSlots.map(({ slot, startMinutes: start, endMinutes: end, lane }) => {
              const left = ((start - startMinutes) / totalMinutes) * 100;
              const width = Math.max(((end - start) / totalMinutes) * 100, 4);
              const positionName = getSlotPositionLabel(slot);
              const requested = requestedSlotIds.has(slot.id);
              const approved = approvedSlotIds.has(slot.id);
              const drafted = draftSlotIds.has(slot.id);
              const disabled = requested || drafted;

              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAddSlot(slot)}
                  className={[
                    "absolute min-w-32 overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm transition",
                    disabled
                      ? "cursor-not-allowed border-black/10 bg-[#eef0f4] text-[#717182] opacity-80"
                      : getPositionColor(positionName),
                  ].join(" ")}
                  style={{
                    left: `${left}%`,
                    top: 12 + lane * timelineLaneHeight,
                    width: `${width}%`,
                    height: timelineSlotBarHeight,
                  }}
                  title={`${formatShiftTimeRange(slot.startTime, slot.endTime)} / ${positionName}`}
                >
                  <span className="block truncate text-xs font-semibold">
                    {formatShiftTimeRange(slot.startTime, slot.endTime)}
                  </span>
                  <span className="block truncate text-[11px] font-semibold">
                    {positionName}
                  </span>
                  <span className="block truncate text-[10px] opacity-80">
                    {disabled
                      ? drafted
                        ? "追加済み"
                        : approved
                          ? "承認済み"
                          : "希望済み"
                      : `募集 ${slot.capacity}人 / 希望 ${slot.requestCount}人`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {slots.map((slot) => {
          const requested = requestedSlotIds.has(slot.id);
          const approved = approvedSlotIds.has(slot.id);
          const pendingRequest = pendingRequestBySlotId[slot.id];
          const drafted = draftSlotIds.has(slot.id);
          const withdrawing = pendingRequest?.id === withdrawingRequestId;
          const statusLabel = drafted
            ? "追加済み"
            : approved
              ? "承認済み"
              : pendingRequest
                ? "希望済み"
                : null;
          const disabled = drafted || withdrawing || approved;

          return (
            <div
              key={slot.id}
              className="flex items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {formatShiftTimeRange(slot.startTime, slot.endTime)}
                </p>
                <p className="truncate text-xs text-[#717182]">
                  {getSlotPositionLabel(slot)} / 募集 {slot.capacity}人 / 希望 {slot.requestCount}人
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {pendingRequest && (
                  <button
                    type="button"
                    disabled={withdrawing}
                    onClick={() => onWithdraw(pendingRequest)}
                    className="h-9 rounded-md border border-[#fecaca] px-3 text-xs font-semibold text-[#b91c1c] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-[#eef0f4] disabled:text-[#717182]"
                  >
                    {withdrawing ? "撤回中..." : "撤回"}
                  </button>
                )}
                {statusLabel && (
                  <span className="inline-flex h-9 items-center rounded-md bg-[#eef0f4] px-3 text-xs font-semibold text-[#717182]">
                    {statusLabel}
                  </span>
                )}
                {!requested && !drafted && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAddSlot(slot)}
                    className="h-9 rounded-md bg-[#030213] px-3 text-xs font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#eef0f4] disabled:text-[#717182]"
                  >
                    追加
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EmployeeShiftRequestContent() {
  const router = useRouter();
  const sessionSnapshot = useSyncExternalStore(
    subscribeEmployeeSession,
    getEmployeeSessionSnapshot,
    getEmployeeSessionServerSnapshot,
  );
  const sessionEmployee = useMemo(
    () => parseEmployeeSessionSnapshot(sessionSnapshot),
    [sessionSnapshot],
  );
  const employee = sessionEmployee;
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draftSlots, setDraftSlots] = useState<DraftShift[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [withdrawConfirmRequest, setWithdrawConfirmRequest] = useState<ShiftRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawingRequestId, setWithdrawingRequestId] = useState<string | null>(null);
  const [isSlotsLoading, setIsSlotsLoading] = useState(true);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [isPositionsLoading, setIsPositionsLoading] = useState(true);
  const [customDraftForm, setCustomDraftForm] = useState({
    startTime: "",
    endTime: "",
    positionId: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = isSlotsLoading || isRequestsLoading || isPositionsLoading;


  useEffect(() => {
    if (!sessionEmployee && !loadEmployeeSession()) {
      router.replace("/login");
    }
  }, [router, sessionEmployee]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!employee) return;

    const unsubscribeSlots = subscribeShiftSlots(
      (nextSlots) => {
        setSlots(nextSlots);
        setIsSlotsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsSlotsLoading(false);
        setErrorMessage("シフト枠の読み込みに失敗しました。");
      },
      employee.organizationId,
    );
    const unsubscribeRequests = subscribeEmployeeShiftRequests(
      employee.employeeId,
      (nextRequests) => {
        setRequests(nextRequests);
        setIsRequestsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsRequestsLoading(false);
        setErrorMessage("希望シフトの読み込みに失敗しました。");
      },
      employee.organizationId,
    );
    const unsubscribePositions = subscribePositions(
      employee.organizationId,
      (nextPositions) => {
        setPositions(nextPositions);
        setIsPositionsLoading(false);
      },
      (error) => {
        console.error(error);
        setIsPositionsLoading(false);
        setErrorMessage("ポジションの読み込みに失敗しました。");
      },
    );

    return () => {
      unsubscribeSlots();
      unsubscribeRequests();
      unsubscribePositions();
    };
  }, [employee]);

  const requestedSlotIds = useMemo(
    () => new Set(requests.map((request) => request.slotId)),
    [requests],
  );
  const approvedSlotIds = useMemo(
    () =>
      new Set(
        requests
          .filter((request) => request.status === "承認済")
          .map((request) => request.slotId),
      ),
    [requests],
  );
  const pendingRequestBySlotId = useMemo(() => {
    return requests.reduce<Record<string, ShiftRequest>>((requestBySlotId, request) => {
      if (request.status !== "承認済" && request.slotId) {
        requestBySlotId[request.slotId] = request;
      }

      return requestBySlotId;
    }, {});
  }, [requests]);
  const draftSlotIds = useMemo(
    () => new Set(draftSlots.map((slot) => slot.id)),
    [draftSlots],
  );
  const requestableSlots = useMemo(() => {
    return slots.filter((slot) => isShiftStartInFuture(slot, now));
  }, [now, slots]);
  const slotsByDate = useMemo(() => {
    return requestableSlots.reduce<Record<string, ShiftSlot[]>>((groups, slot) => {
      groups[slot.date] = [...(groups[slot.date] ?? []), slot];
      return groups;
    }, {});
  }, [requestableSlots]);
  const summaryByDate = useMemo(() => {
    return requestableSlots.reduce<Record<string, CalendarDaySummary>>((summaries, slot) => {
      const current = summaries[slot.date] ?? {
        slotCount: 0,
        availableCount: 0,
        draftCount: 0,
        requestedCount: 0,
      };
      const requested = requestedSlotIds.has(slot.id);
      const drafted = draftSlotIds.has(slot.id);

      summaries[slot.date] = {
        slotCount: current.slotCount + 1,
        availableCount: current.availableCount + (requested || drafted ? 0 : 1),
        draftCount: current.draftCount + (drafted ? 1 : 0),
        requestedCount: current.requestedCount + (requested ? 1 : 0),
      };

      return summaries;
    }, {});
  }, [draftSlotIds, requestableSlots, requestedSlotIds]);
  const selectedDateSlots = useMemo(() => {
    if (!selectedDate) return [];

    return sortSlots(slotsByDate[selectedDate] ?? []);
  }, [selectedDate, slotsByDate]);
  const calendarDays = useMemo(
    () => getMonthCalendarDays(displayMonth),
    [displayMonth],
  );
  const todayDate = useMemo(() => toDateString(new Date()), []);

  function changeDisplayMonth(offset: number) {
    setDisplayMonth((currentMonth) => {
      return new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + offset,
        1,
      );
    });
    setSelectedDate(null);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
  }

  function addDraftSlot(slot: ShiftSlot) {
    if (!isShiftStartInFuture(slot)) {
      setErrorMessage("過去または開始済みのシフトには希望を提出できません。");
      return;
    }

    if (requestedSlotIds.has(slot.id) || draftSlotIds.has(slot.id)) return;

    setDraftSlots((current) => sortSlots([...current, slot]));
    setErrorMessage(null);
  }

  function addEmployeeGeneratedDraft() {
    if (!selectedDate) {
      setErrorMessage("日付を選択してください。");
      return;
    }

    const selectedPosition = positions.find(
      (position) => position.id === customDraftForm.positionId,
    );
    const draft: DraftShift = {
      id: `employee-generated:${selectedDate}:${customDraftForm.startTime}:${customDraftForm.endTime}:${customDraftForm.positionId}`,
      date: selectedDate,
      startTime: customDraftForm.startTime,
      endTime: customDraftForm.endTime,
      positionId: selectedPosition?.id ?? "",
      positionName: selectedPosition?.name ?? "",
      employeeGenerated: true,
      capacity: 1,
      requestCount: 0,
      isEmployeeGenerated: true,
    };

    if (!isValidShiftTimeRange(draft.startTime, draft.endTime) || !selectedPosition) {
      setErrorMessage("時間とポジションを正しく入力してください。");
      return;
    }

    if (!isShiftStartInFuture(draft)) {
      setErrorMessage("過去または開始済みのシフトには希望を提出できません。");
      return;
    }

    const duplicateDraft = draftSlots.some((currentDraft) =>
      currentDraft.date === draft.date &&
      currentDraft.startTime === draft.startTime &&
      currentDraft.endTime === draft.endTime &&
      currentDraft.positionId === draft.positionId
    );
    const duplicateRequest = requests.some((request) =>
      request.date === draft.date &&
      request.startTime === draft.startTime &&
      request.endTime === draft.endTime &&
      request.positionId === draft.positionId
    );

    if (duplicateDraft || duplicateRequest) {
      setErrorMessage("同じ日時・ポジションの希望は既に追加されています。");
      return;
    }

    setDraftSlots((current) => sortSlots([...current, draft]));
    setErrorMessage(null);
  }
  function removeDraftSlot(slotId: string) {
    setDraftSlots((current) => current.filter((slot) => slot.id !== slotId));
  }

  function openWithdrawConfirm(request: ShiftRequest) {
    if (request.status === "承認済") return;

    setWithdrawConfirmRequest(request);
  }

  async function withdrawRequest() {
    if (!employee || !withdrawConfirmRequest) return;

    try {
      setWithdrawingRequestId(withdrawConfirmRequest.id);
      setErrorMessage(null);

      await withdrawEmployeeShiftRequest(withdrawConfirmRequest.id, {
        organizationId: employee.organizationId,
        employeeId: employee.employeeId,
        employeeEmail: employee.email,
      });
      setWithdrawConfirmRequest(null);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "シフト希望の撤回に失敗しました。",
      );
    } finally {
      setWithdrawingRequestId(null);
    }
  }
  async function submitRequests() {
    if (!employee || draftSlots.length === 0) return;

    const requestableDraftSlots = draftSlots.filter((slot) =>
      isShiftStartInFuture(slot),
    );

    if (requestableDraftSlots.length !== draftSlots.length) {
      setDraftSlots(requestableDraftSlots);
      setIsConfirmOpen(false);
      setErrorMessage("過去または開始済みのシフトには希望を提出できません。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const slotDrafts = requestableDraftSlots.filter(
        (slot) => !slot.isEmployeeGenerated,
      );
      const employeeGeneratedDrafts = requestableDraftSlots.filter(
        (slot) => slot.isEmployeeGenerated,
      );

      if (slotDrafts.length > 0) {
        await createShiftRequests(
          slotDrafts.map((slot) => ({
            employeeId: employee.employeeId,
            employeeName: employee.name,
            employeeEmail: employee.email,
            employmentType: employee.employmentType,
            slotId: slot.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            positionId: slot.positionId,
            positionName: slot.positionName,
          })),
          employee.organizationId,
        );
      }

      if (employeeGeneratedDrafts.length > 0) {
        await createEmployeeGeneratedShiftRequests(
          employeeGeneratedDrafts.map((slot) => ({
            employeeId: employee.employeeId,
            employeeName: employee.name,
            employeeEmail: employee.email,
            employmentType: employee.employmentType,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            positionId: slot.positionId,
            positionName: slot.positionName,
          })),
          employee.organizationId,
        );
      }
      setDraftSlots([]);
      setIsConfirmOpen(false);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "希望シフトの送信に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!employee) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] text-[#717182]">
        <p>ログイン情報を確認しています</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <header className="border-b border-black/10 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1248px] items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-0">
          <Link
            href="/employee"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
          >
            <BackIcon />
            戻る
          </Link>
          <p className="min-w-0 truncate text-sm text-[#717182]">
            {employee.organization} - {employee.department}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <header>
            <h1 className="text-xl font-semibold">希望シフト入力</h1>
            <p className="mt-1 text-sm text-[#717182]">
              {employee.organization} {employee.department}の募集シフト枠から希望を選択してください
            </p>
          </header>

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <EmployeeShiftCalendar
                displayMonth={displayMonth}
                days={calendarDays}
                selectedDate={selectedDate}
                todayDate={todayDate}
                summaryByDate={summaryByDate}
                onMonthChange={changeDisplayMonth}
                onSelectDate={selectDate}
              />

              {isLoading && (
                <p className="text-sm text-[#717182]">
                  募集シフト枠を読み込んでいます
                </p>
              )}

              {selectedDate ? (
                <>
                  <SelectedDayShiftTimeline
                    date={selectedDate}
                    slots={selectedDateSlots}
                    requestedSlotIds={requestedSlotIds}
                    approvedSlotIds={approvedSlotIds}
                    pendingRequestBySlotId={pendingRequestBySlotId}
                    draftSlotIds={draftSlotIds}
                    withdrawingRequestId={withdrawingRequestId}
                    onAddSlot={addDraftSlot}
                    onWithdraw={openWithdrawConfirm}
                  />
                  <section className="rounded-lg border border-black/10 bg-white p-4">
                    <div>
                      <h2 className="text-sm font-semibold">募集枠なしで希望を追加</h2>
                      <p className="mt-1 text-xs text-[#717182]">
                        募集されていない時間でも、管理者に希望として送信できます
                      </p>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_minmax(0,1.5fr)_auto] sm:items-end">
                      <label className="grid gap-1 text-xs font-semibold text-[#475569]">
                        開始
                        <input
                          type="time"
                          value={customDraftForm.startTime}
                          onChange={(event) =>
                            setCustomDraftForm((current) => ({
                              ...current,
                              startTime: event.target.value,
                            }))
                          }
                          className="h-10 rounded-md border border-black/10 px-3 text-sm text-[#030213]"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-[#475569]">
                        終了
                        <input
                          type="time"
                          value={customDraftForm.endTime}
                          onChange={(event) =>
                            setCustomDraftForm((current) => ({
                              ...current,
                              endTime: event.target.value,
                            }))
                          }
                          className="h-10 rounded-md border border-black/10 px-3 text-sm text-[#030213]"
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#475569]">
                        ポジション
                        <select
                          value={customDraftForm.positionId}
                          onChange={(event) =>
                            setCustomDraftForm((current) => ({
                              ...current,
                              positionId: event.target.value,
                            }))
                          }
                          className="h-10 min-w-0 rounded-md border border-black/10 px-3 text-sm text-[#030213]"
                        >
                          <option value="">選択してください</option>
                          {positions.map((position) => (
                            <option key={position.id} value={position.id}>
                              {position.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={addEmployeeGeneratedDraft}
                        disabled={positions.length === 0}
                        className="h-10 rounded-md bg-[#030213] px-4 text-sm font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#eef0f4] disabled:text-[#717182]"
                      >
                        追加
                      </button>
                    </div>
                    {positions.length === 0 && !isPositionsLoading && (
                      <p className="mt-3 text-xs text-[#b91c1c]">
                        管理者がポジションを登録すると、募集枠なしの希望を追加できます。
                      </p>
                    )}
                  </section>
                </>
              ) : (
                <section className="rounded-lg border border-black/10 bg-white p-4 text-sm text-[#717182]">
                  カレンダーから日付を選択してください
                </section>
              )}
            </div>

            <div className="space-y-4">
              <section className="rounded-lg border border-black/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">追加したシフト希望</h2>
                    <p className="mt-1 text-xs text-[#717182]">
                      送信前の希望を確認できます
                    </p>
                  </div>
                  <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-xs font-semibold text-[#1d4ed8]">
                    {draftSlots.length}件
                  </span>
                </div>
                {draftSlots.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center text-[#717182]">
                  <p>まだシフト希望がありません</p>
                  <p className="mt-1 text-sm">
                    日付を選び、時間ビューから募集枠を追加してください
                  </p>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="space-y-3">
                    {draftSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-4"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold">{formatDateLabel(slot.date)}</p>
                          <p className="mt-1 truncate text-sm font-semibold text-[#1d4ed8]">
                            {getSlotPositionLabel(slot)}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#717182]">
                            <span>{formatShiftTimeRange(slot.startTime, slot.endTime)}</span>
                            {slot.isEmployeeGenerated && (
                              <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#c2410c]">
                                自主追加枠
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDraftSlot(slot.id)}
                          className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>

                  <p className="mt-6 text-sm text-[#717182]">
                    ※ 送信後は管理者が応募者の中から承認します。
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsConfirmOpen(true)}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#030213] px-4 text-sm font-semibold text-white"
                  >
                    <SendIcon />
                    シフト希望を送信（{draftSlots.length}件）
                  </button>
                </div>
              )}
            </section>
            </div>
          </div>
        </section>
      </div>


      {withdrawConfirmRequest && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-8 sm:items-center">
          <section className="max-h-[calc(100vh-2rem)] w-full max-w-[512px] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <WarningIcon />
                <h2 className="text-xl font-semibold">撤回の確認</h2>
              </div>
              <button
                type="button"
                aria-label="閉じる"
                disabled={withdrawingRequestId === withdrawConfirmRequest.id}
                onClick={() => setWithdrawConfirmRequest(null)}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XIcon />
              </button>
            </div>
            <p className="mt-2 text-sm text-[#717182]">
              このシフト希望を撤回します。撤回後は、もう一度希望を出し直せます。
            </p>

            <div className="mt-6 flex items-center justify-between rounded-lg bg-[#f7f8fb] px-4 py-3">
              <div>
                <p className="font-semibold">{formatDateLabel(withdrawConfirmRequest.date)}</p>
                <p className="mt-1 text-sm font-semibold text-[#1d4ed8]">
                  {getSlotPositionLabel(withdrawConfirmRequest)}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-[#475569]">
                <span>
                  {formatShiftTimeRange(
                    withdrawConfirmRequest.startTime,
                    withdrawConfirmRequest.endTime,
                  )}
                </span>
                {(withdrawConfirmRequest.employeeGenerated || !withdrawConfirmRequest.slotId) && (
                  <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#c2410c]">
                    自主追加枠
                  </span>
                )}
              </div>
            </div>

            <p className="mt-6 text-sm text-[#717182]">
              ※ 承認済みのシフトは撤回できません。
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={withdrawingRequestId === withdrawConfirmRequest.id}
                onClick={() => setWithdrawConfirmRequest(null)}
                className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={withdrawingRequestId === withdrawConfirmRequest.id}
                onClick={withdrawRequest}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#b91c1c] text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
              >
                {withdrawingRequestId === withdrawConfirmRequest.id ? "撤回中..." : "撤回する"}
              </button>
            </div>
          </section>
        </div>
      )}

      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-8 sm:items-center">
          <section className="max-h-[calc(100vh-2rem)] w-full max-w-[512px] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <WarningIcon />
                <h2 className="text-xl font-semibold">送信の確認</h2>
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
              >
                <XIcon />
              </button>
            </div>
            <p className="mt-2 text-sm text-[#717182]">
              以下のシフト希望を送信します。送信後は変更できません。
            </p>

            <div className="mt-6 space-y-3">
              {draftSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f8fb] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{formatDateLabel(slot.date)}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-[#1d4ed8]">
                      {getSlotPositionLabel(slot)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm text-[#475569]">
                    <span>{formatShiftTimeRange(slot.startTime, slot.endTime)}</span>
                    {slot.isEmployeeGenerated && (
                      <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#c2410c]">
                        自主追加枠
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-6 text-sm text-[#717182]">
              ※ 管理者が承認後、シフトが確定します。
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={submitRequests}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#030213] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
              >
                <SendIcon />
                {isSubmitting ? "送信中..." : "送信する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
export default function EmployeeShiftRequestPage() {
  return (
    <Suspense>
      <EmployeeShiftRequestContent />
    </Suspense>
  );
}
