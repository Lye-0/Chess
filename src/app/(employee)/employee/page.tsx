"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  clearEmployeeSession,
  getEmployeeSessionServerSnapshot,
  getEmployeeSessionSnapshot,
  loadEmployeeSession,
  parseEmployeeSessionSnapshot,
  subscribeEmployeeSession,
} from "@/lib/people";
import {
  getShiftRequestPositionLabel,
  subscribeEmployeeShiftRequests,
  withdrawEmployeeShiftRequest,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import {
  calculateShiftPayroll,
  defaultPayrollSettings,
  formatCurrency,
  subscribePayrollSettings,
  sumShiftPay,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  formatShiftTimeRange,
  subscribeShiftSlots,
  type ShiftSlot,
} from "@/lib/shiftSlots";
import { ShiftExportMenu } from "@/components/ui/shift-export-menu";
import {
  buildMonthlyShiftExportData,
  downloadIcs,
  downloadRosterPng,
  getShiftExportMonths,
  type ShiftExportFormat,
} from "@/lib/shiftExports";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const monthFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
});

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4M16 2v4M3 10h18" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
    </svg>
  );
}

function CompatibilityIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21a4 4 0 0 1 8 0M13 21a4 4 0 0 1 8 0" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14h6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h12m0 0-3-3m3 3-3 3" />
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

function formatDateOnly(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getFullYear()}年${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`;
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const firstCalendarDate = new Date(year, month, 1 - firstDay);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCalendarDate);
    date.setDate(firstCalendarDate.getDate() + index);

    return {
      date: toDateString(date),
      day: date.getDate(),
      outside: date.getMonth() !== month,
    };
  });
}
function sortRequests(requests: ShiftRequest[]) {
  return [...requests].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

function getRequestStartAt(request: ShiftRequest) {
  return new Date(`${request.date}T${request.startTime}:00`);
}

function getRequestEndAt(request: ShiftRequest) {
  const startAt = getRequestStartAt(request);
  const endAt = new Date(`${request.date}T${request.endTime}:00`);

  if (endAt <= startAt) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return endAt;
}

function isCompletedRequest(request: ShiftRequest, now: Date) {
  const endAt = getRequestEndAt(request);

  return !Number.isNaN(endAt.getTime()) && endAt <= now;
}

function isWithinNextDays(request: ShiftRequest, days: number, now: Date) {
  const startAt = getRequestStartAt(request);
  const limit = new Date(now);
  limit.setDate(now.getDate() + days);

  return startAt >= now && startAt <= limit;
}

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function formatTimelineHour(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60) % 24;

  return `${hour}:00`;
}
function calculateWorkMinutes(request: ShiftRequest) {
  const start = parseTimeToMinutes(request.startTime);
  const end = parseTimeToMinutes(request.endTime);
  const diff = end - start;

  return diff >= 0 ? diff : diff + 24 * 60;
}

function formatWorkHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) return `${hours}時間`;

  return `${hours}時間${remainingMinutes}分`;
}

function sumWorkMinutes(requests: ShiftRequest[]) {
  return requests.reduce((total, request) => total + calculateWorkMinutes(request), 0);
}

function isRequestInMonth(request: ShiftRequest, date: Date) {
  const startAt = getRequestStartAt(request);

  return (
    startAt.getFullYear() === date.getFullYear() &&
    startAt.getMonth() === date.getMonth()
  );
}

function isRequestInYear(request: ShiftRequest, year: number) {
  const startAt = getRequestStartAt(request);

  return startAt.getFullYear() === year;
}

function RequestStatusBadge({ status }: { status: ShiftRequest["status"] }) {
  const approved = status === "承認済";

  return (
    <span
      className={[
        "rounded-md px-3 py-1 text-sm font-semibold",
        approved
          ? "bg-[#dcfce7] text-[#15803d]"
          : "bg-[#dbeafe] text-[#1d4ed8]",
      ].join(" ")}
    >
      {status}
    </span>
  );
}

function WorkHoursCard({
  title,
  description,
  minutes,
}: {
  title: string;
  description: string;
  minutes: number;
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-sm text-[#717182]">{title}</p>
      <p className="mt-4 text-3xl font-semibold">{formatWorkHours(minutes)}</p>
      <p className="mt-3 text-sm text-[#717182]">{description}</p>
    </section>
  );
}

function PayCard({
  title,
  description,
  amount,
  isLoading = false,
}: {
  title: string;
  description: string;
  amount: number;
  isLoading?: boolean;
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-sm text-[#717182]">{title}</p>
      <p className="mt-4 text-3xl font-semibold">
        {isLoading ? "..." : formatCurrency(amount)}
      </p>
      <p className="mt-3 text-sm text-[#717182]">{description}</p>
    </section>
  );
}

function ShiftRequestRow({
  request,
  payrollSettings,
  onWithdraw,
  isWithdrawing = false,
}: {
  request: ShiftRequest;
  payrollSettings: PayrollSettings;
  onWithdraw?: (request: ShiftRequest) => void;
  isWithdrawing?: boolean;
}) {
  const parsedDate = new Date(`${request.date}T00:00:00`);
  const payroll = calculateShiftPayroll(request, payrollSettings);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-8">
        <div className="text-center text-sm text-[#030213]">
          <p>{weekdays[parsedDate.getDay()]}</p>
          <p className="font-semibold">{parsedDate.getDate()}</p>
        </div>
        <div>
          <p className="font-semibold">{formatDateOnly(request.date)}</p>
          <p className="mt-1 text-sm font-semibold text-[#1d4ed8]">
            {getShiftRequestPositionLabel(request)}
          </p>
          <p className="mt-1 text-sm text-[#475569]">
            {formatShiftTimeRange(request.startTime, request.endTime)}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#00a63e]">
            {formatCurrency(payroll.totalPay)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
        <RequestStatusBadge status={request.status} />
        {request.status !== "承認済" && onWithdraw && (
          <button
            type="button"
            disabled={isWithdrawing}
            onClick={() => onWithdraw(request)}
            className="h-9 rounded-md border border-[#fecaca] px-3 text-sm font-semibold text-[#b91c1c] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-[#eef0f4] disabled:text-[#717182]"
          >
            {isWithdrawing ? "撤回中..." : "撤回"}
          </button>
        )}
      </div>
    </div>
  );
}

type MyCalendarDaySummary = {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
};

function EmployeeFeatureCard({
  href,
  icon,
  title,
  description,
  actionLabel,
  toneClassName,
  children,
}: {
  href?: string;
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  toneClassName: string;
  children?: ReactNode;
}) {
  const content = (
    <>
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${toneClassName}`}>
        {icon}
      </div>
      <h2 className="mt-3 text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-[#717182]">{description}</p>
      {children}
      {actionLabel && (
        <div className="mt-5 rounded-md border border-black/10 bg-white px-4 py-2.5 text-center text-sm font-semibold shadow-sm transition group-hover:bg-[#f7f8fb]">
          {actionLabel}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group min-h-[226px] rounded-xl border border-black/10 bg-white p-6 shadow-sm transition hover:shadow-md"
      >
        {content}
      </Link>
    );
  }

  return (
    <section className="min-h-[226px] rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      {content}
    </section>
  );
}

function EmployeeMyCalendar({
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
  selectedDate: string;
  todayDate: string;
  summaryByDate: Record<string, MyCalendarDaySummary>;
  onMonthChange: (offset: number) => void;
  onSelectDate: (date: string) => void;
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">マイカレンダー</h2>
          <p className="mt-1 text-sm text-[#717182]">
            自分の希望・確定シフトを月ごとに確認できます
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(-1)}
            className="h-9 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
          >
            前月
          </button>
          <p className="min-w-32 text-center text-sm font-semibold">
            {monthFormatter.format(displayMonth)}
          </p>
          <button
            type="button"
            onClick={() => onMonthChange(1)}
            className="h-9 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
          >
            次月
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 border-l border-t border-black/10 text-center text-xs font-semibold text-[#717182]">
        {weekdays.map((weekday) => (
          <div key={weekday} className="border-b border-r border-black/10 py-2">
            {weekday}
          </div>
        ))}
        {days.map((day) => {
          const summary = summaryByDate[day.date];
          const selected = selectedDate === day.date;
          const isToday = todayDate === day.date;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date)}
              className={[
                "min-h-24 border-b border-r border-black/10 p-2 text-left transition",
                selected
                  ? "bg-[#eef2ff] ring-2 ring-inset ring-[#1d4ed8]"
                  : day.outside
                    ? "bg-[#fafafa] text-[#a1a1aa] hover:bg-[#f7f8fb]"
                    : "bg-white hover:bg-[#f7f8fb]",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-[#030213] text-white" : "",
                  ].join(" ")}
                >
                  {day.day}
                </span>
                {summary && (
                  <span className="rounded-full bg-[#eef2f7] px-2 py-0.5 text-[11px] font-semibold text-[#475569]">
                    {summary.totalCount}件
                  </span>
                )}
              </div>
              {summary && (
                <div className="mt-2 space-y-1 text-[11px] font-semibold">
                  {summary.pendingCount > 0 && (
                    <p className="truncate text-[#1d4ed8]">希望 {summary.pendingCount}</p>
                  )}
                  {summary.approvedCount > 0 && (
                    <p className="truncate text-[#15803d]">承認 {summary.approvedCount}</p>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SelectedDayTimeline({
  date,
  requests,
  payrollSettings,
  onWithdraw,
  withdrawingRequestId,
}: {
  date: string;
  requests: ShiftRequest[];
  payrollSettings: PayrollSettings;
  onWithdraw: (request: ShiftRequest) => void;
  withdrawingRequestId: string | null;
}) {
  const timelineItems = requests.map((request) => {
    const startMinutes = parseTimeToMinutes(request.startTime);
    const rawEndMinutes = parseTimeToMinutes(request.endTime);
    const endMinutes = rawEndMinutes > startMinutes
      ? rawEndMinutes
      : rawEndMinutes + 24 * 60;

    return { request, startMinutes, endMinutes };
  });
  const timelineStart = timelineItems.length > 0
    ? Math.max(0, Math.floor(Math.min(...timelineItems.map((item) => item.startMinutes)) / 60) * 60)
    : 0;
  const timelineEnd = timelineItems.length > 0
    ? Math.ceil(Math.max(...timelineItems.map((item) => item.endMinutes)) / 60) * 60
    : 24 * 60;
  const totalMinutes = Math.max(60, timelineEnd - timelineStart);
  const timelineWidth = Math.max(720, Math.ceil(totalMinutes / 60) * 72);
  const hours = Array.from(
    { length: Math.floor(totalMinutes / 60) + 1 },
    (_, index) => timelineStart + index * 60,
  );

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{formatDateLabel(date)} の予定</h2>
          <p className="mt-1 text-sm text-[#717182]">
            選択した日の希望・確定シフト
          </p>
        </div>
        <span className="rounded-full bg-[#eef2f7] px-3 py-1 text-sm font-semibold text-[#475569]">
          {requests.length}件
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="mt-5 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-black/10 text-sm text-[#717182]">
          この日のシフト希望はありません
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto pb-2">
            <div style={{ width: timelineWidth }}>
              <div className="relative h-7 border-b border-black/10 text-[11px] font-semibold text-[#717182]">
                {hours.map((hour) => (
                  <span
                    key={hour}
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${((hour - timelineStart) / totalMinutes) * 100}%` }}
                  >
                    {formatTimelineHour(hour)}
                  </span>
                ))}
              </div>
              <div className="relative min-h-28 rounded-b-md bg-[#f8fafc] py-4">
                {hours.map((hour) => (
                  <span
                    key={hour}
                    aria-hidden="true"
                    className="absolute top-0 h-full border-l border-black/10"
                    style={{ left: `${((hour - timelineStart) / totalMinutes) * 100}%` }}
                  />
                ))}
                {timelineItems.map(({ request, startMinutes, endMinutes }, index) => {
                  const left = ((startMinutes - timelineStart) / totalMinutes) * 100;
                  const width = Math.max(((endMinutes - startMinutes) / totalMinutes) * 100, 4);
                  const approved = request.status === "承認済";

                  return (
                    <div
                      key={request.id}
                      className={[
                        "absolute h-12 min-w-32 overflow-hidden rounded-md border px-3 py-2 text-left shadow-sm",
                        approved
                          ? "border-[#86efac] bg-[#dcfce7] text-[#166534]"
                          : "border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]",
                      ].join(" ")}
                      style={{
                        left: `${left}%`,
                        top: 14 + index * 56,
                        width: `${width}%`,
                      }}
                    >
                      <p className="truncate text-xs font-semibold">
                        {formatShiftTimeRange(request.startTime, request.endTime)}
                      </p>
                      <p className="truncate text-[11px] font-semibold">
                        {getShiftRequestPositionLabel(request)} / {request.status}
                      </p>
                    </div>
                  );
                })}
                <div style={{ height: Math.max(56, timelineItems.length * 56) }} />
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {requests.map((request) => (
              <ShiftRequestRow
                key={request.id}
                request={request}
                payrollSettings={payrollSettings}
                onWithdraw={request.status === "承認済" ? undefined : onWithdraw}
                isWithdrawing={withdrawingRequestId === request.id}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function EmployeePageContent() {
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
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isPayrollLoading, setIsPayrollLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));  const [selectedExportMonth, setSelectedExportMonth] = useState(
    () => getShiftExportMonths([])[0],
  );
  const [withdrawingRequestId, setWithdrawingRequestId] = useState<string | null>(null);
  const [withdrawErrorMessage, setWithdrawErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timerId);
  }, []);


  useEffect(() => {
    if (!sessionEmployee && !loadEmployeeSession()) {
      router.replace("/login");
    }
  }, [router, sessionEmployee]);

  useEffect(() => {
    if (!employee) return;

    const unsubscribeRequests = subscribeEmployeeShiftRequests(
      employee.employeeId,
      (nextRequests) => {
        setRequests(nextRequests);
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setIsLoading(false);
      },
      employee.organizationId,
    );

    const unsubscribeSlots = subscribeShiftSlots(
      (nextSlots) => {
        setSlots(nextSlots);
      },
      (error) => {
        console.error(error);
      },
      employee.organizationId,
    );

    const unsubscribePayroll = subscribePayrollSettings(
      (settings) => {
        setPayrollSettings(settings);
        setIsPayrollLoading(false);
      },
      (error) => {
        console.error(error);
        setIsPayrollLoading(false);
      },
      employee.organizationId,
    );

    return () => {
      unsubscribeRequests();
      unsubscribeSlots();
      unsubscribePayroll();
    };
  }, [employee]);

  const slotPositionNameById = useMemo(() => {
    return slots.reduce<Record<string, string>>((positions, slot) => {
      positions[slot.id] = slot.positionName;
      return positions;
    }, {});
  }, [slots]);
  const displayRequests = useMemo(() => {
    return requests.map((request) => ({
      ...request,
      positionName:
        request.positionName || slotPositionNameById[request.slotId] || "",
    }));
  }, [requests, slotPositionNameById]);
  const exportMonths = useMemo(() => getShiftExportMonths(displayRequests), [displayRequests]);
  const activeExportMonth = exportMonths.includes(selectedExportMonth)
    ? selectedExportMonth
    : exportMonths[0];


  const sortedRequests = useMemo(() => sortRequests(displayRequests), [displayRequests]);
  const pendingRequests = useMemo(
    () => sortedRequests.filter((request) => request.status !== "承認済"),
    [sortedRequests],
  );
  const approvedRequests = useMemo(
    () => sortedRequests.filter((request) => request.status === "承認済"),
    [sortedRequests],
  );
  const completedApprovedRequests = useMemo(
    () => approvedRequests.filter((request) => isCompletedRequest(request, now)),
    [approvedRequests, now],
  );
  const nearestRequest = useMemo(
    () => approvedRequests.find((request) => isWithinNextDays(request, 7, now)),
    [approvedRequests, now],
  );
  const requestsByDate = useMemo(() => {
    return sortedRequests.reduce<Record<string, ShiftRequest[]>>((groups, request) => {
      groups[request.date] = [...(groups[request.date] ?? []), request];
      return groups;
    }, {});
  }, [sortedRequests]);
  const calendarSummaryByDate = useMemo(() => {
    return sortedRequests.reduce<Record<string, MyCalendarDaySummary>>((summaries, request) => {
      const current = summaries[request.date] ?? {
        totalCount: 0,
        pendingCount: 0,
        approvedCount: 0,
      };

      summaries[request.date] = {
        totalCount: current.totalCount + 1,
        pendingCount: current.pendingCount + (request.status === "承認済" ? 0 : 1),
        approvedCount: current.approvedCount + (request.status === "承認済" ? 1 : 0),
      };

      return summaries;
    }, {});
  }, [sortedRequests]);
  const calendarDays = useMemo(
    () => getMonthCalendarDays(displayMonth),
    [displayMonth],
  );
  const selectedDateRequests = useMemo(
    () => requestsByDate[selectedDate] ?? [],
    [requestsByDate, selectedDate],
  );
  const todayDate = useMemo(() => toDateString(new Date()), []);
  const currentDate = now;
  const currentYear = currentDate.getFullYear();
  const monthlyWorkMinutes = useMemo(
    () =>
      sumWorkMinutes(
        completedApprovedRequests.filter((request) =>
          isRequestInMonth(request, currentDate),
        ),
      ),
    [completedApprovedRequests, currentDate],
  );
  const yearlyWorkMinutes = useMemo(
    () =>
      sumWorkMinutes(
        completedApprovedRequests.filter((request) =>
          isRequestInYear(request, currentYear),
        ),
      ),
    [completedApprovedRequests, currentYear],
  );
  const monthlyPay = useMemo(
    () =>
      sumShiftPay(
        completedApprovedRequests.filter((request) =>
          isRequestInMonth(request, currentDate),
        ),
        payrollSettings,
      ),
    [completedApprovedRequests, currentDate, payrollSettings],
  );
  const yearlyPay = useMemo(
    () =>
      sumShiftPay(
        completedApprovedRequests.filter((request) =>
          isRequestInYear(request, currentYear),
        ),
        payrollSettings,
      ),
    [completedApprovedRequests, currentYear, payrollSettings],
  );

  const monthlyExportData = useMemo(
    () =>
      employee
        ? buildMonthlyShiftExportData({
            organizationName: employee.organization,
            department: employee.department,
            month: activeExportMonth,
            employees: [employee],
            requests: displayRequests,
            payrollSettings,
            employeeId: employee.employeeId,
          })
        : null,
    [employee, payrollSettings, displayRequests, activeExportMonth],
  );

  function changeDisplayMonth(offset: number) {
    setDisplayMonth((currentMonth) =>
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + offset,
        1,
      ),
    );
  }

  function handleExport(format: ShiftExportFormat) {
    if (!monthlyExportData) return;

    if (format === "ics") {
      downloadIcs(monthlyExportData);
      return;
    }

    if (format === "png") {
      downloadRosterPng(monthlyExportData);
    }
  }

  async function handleWithdrawRequest(request: ShiftRequest) {
    if (!employee || request.status === "承認済") return;

    const confirmed = window.confirm(
      `${formatDateLabel(request.date)} ${formatShiftTimeRange(request.startTime, request.endTime)} の希望を撤回しますか？`,
    );

    if (!confirmed) return;

    try {
      setWithdrawingRequestId(request.id);
      setWithdrawErrorMessage(null);
      await withdrawEmployeeShiftRequest(request.id, {
        organizationId: employee.organizationId,
        employeeId: employee.employeeId,
        employeeEmail: employee.email,
      });
    } catch (error) {
      console.error(error);
      setWithdrawErrorMessage(
        error instanceof Error
          ? error.message
          : "シフト希望の撤回に失敗しました。",
      );
    } finally {
      setWithdrawingRequestId(null);
    }
  }
  async function handleLogout() {
    clearEmployeeSession();
    await signOut(auth);
    router.push("/login");
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
        <div className="mx-auto flex max-w-[1248px] items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:px-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ececf0] text-[#030213] sm:h-10 sm:w-10">
              <UserIcon />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold leading-tight sm:text-2xl">
                {employee.name}
              </h1>
              <p className="truncate text-xs text-[#717182] sm:text-sm">
                {employee.organization}
                {employee.department ? ` - ${employee.department}` : ""}・
                {employee.employmentType}
                <span className="hidden sm:inline">・{employee.employeeId}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ShiftExportMenu
              formats={[
                { format: "ics", label: "ICSをダウンロード" },
                { format: "png", label: "PNGをダウンロード" },
              ]}
              months={exportMonths}
              selectedMonth={activeExportMonth}
              onMonthChange={setSelectedExportMonth}
              onExport={handleExport}
              disabled={isLoading || isPayrollLoading}
              hasData={Boolean(monthlyExportData?.rows.length)}
            />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="ログアウト"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold transition hover:bg-[#e9ebef] sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 sm:gap-5 lg:gap-6">
          <EmployeeFeatureCard
            icon={<ClockIcon />}
            title="直近のシフト"
            description="今後7日間の確定シフト"
            toneClassName="bg-[#ececf0] text-[#030213]"
          >
            <div className="pt-3">
              {isLoading ? (
                <p className="text-sm text-[#717182]">読み込んでいます</p>
              ) : nearestRequest ? (
                <div className="rounded-lg bg-[#f7f8fb] px-4 py-3">
                  <p className="font-semibold">{formatDateLabel(nearestRequest.date)}</p>
                  <p className="mt-1 text-sm font-semibold text-[#1d4ed8]">
                    {getShiftRequestPositionLabel(nearestRequest)}
                  </p>
                  <p className="mt-1 text-sm text-[#475569]">
                    {formatShiftTimeRange(
                      nearestRequest.startTime,
                      nearestRequest.endTime,
                    )}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#00a63e]">
                    {formatCurrency(
                      calculateShiftPayroll(nearestRequest, payrollSettings).totalPay,
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-black/10">
                  <p className="text-sm text-[#717182]">直近のシフトはありません</p>
                </div>
              )}
            </div>
          </EmployeeFeatureCard>

          <EmployeeFeatureCard
            href="/employee/shift-request"
            icon={<CalendarIcon />}
            title="希望シフト入力"
            description="募集枠から希望シフトを入力します"
            actionLabel="希望シフトを入力"
            toneClassName="bg-[#eef2ff] text-[#1d4ed8]"
          />

          <EmployeeFeatureCard
            href="/employee/compatibility"
            icon={<CompatibilityIcon />}
            title="一緒に働きやすさ設定"
            description="一緒に働く人との相性を入力します"
            actionLabel="設定する"
            toneClassName="bg-[#f0fdf4] text-[#00a63e]"
          />

          <EmployeeFeatureCard
            icon={<ListIcon />}
            title="シフト希望一覧"
            description="提出済みの希望シフト"
            toneClassName="bg-[#fff7ed] text-[#f97316]"
          >
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[#f7f8fb] px-4 py-3">
                <p className="text-xs font-semibold text-[#717182]">承認待ち</p>
                <p className="mt-2 text-2xl font-semibold">{pendingRequests.length}件</p>
              </div>
              <div className="rounded-lg bg-[#f0fdf4] px-4 py-3">
                <p className="text-xs font-semibold text-[#15803d]">承認済み</p>
                <p className="mt-2 text-2xl font-semibold text-[#15803d]">
                  {approvedRequests.length}件
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[#717182]">
              日付ごとの詳細は下のマイカレンダーで確認できます
            </p>
          </EmployeeFeatureCard>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <WorkHoursCard
            title="今月の勤務時間"
            description={`${currentYear}年${currentDate.getMonth() + 1}月の終了済みシフト`}
            minutes={monthlyWorkMinutes}
          />
          <WorkHoursCard
            title="年間の勤務時間"
            description={`${currentYear}年1月1日〜12月31日の終了済みシフト`}
            minutes={yearlyWorkMinutes}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <PayCard
            title="今月のお給料"
            description={`${currentYear}年${currentDate.getMonth() + 1}月の終了済みシフト`}
            amount={monthlyPay}
            isLoading={isPayrollLoading}
          />
          <PayCard
            title="年間のお給料"
            description={`${currentYear}年1月1日〜12月31日の終了済みシフト`}
            amount={yearlyPay}
            isLoading={isPayrollLoading}
          />
        </section>

        <section className="mt-6 space-y-4">
          {withdrawErrorMessage && (
            <div className="rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {withdrawErrorMessage}
            </div>
          )}

          <EmployeeMyCalendar
            displayMonth={displayMonth}
            days={calendarDays}
            selectedDate={selectedDate}
            todayDate={todayDate}
            summaryByDate={calendarSummaryByDate}
            onMonthChange={changeDisplayMonth}
            onSelectDate={setSelectedDate}
          />

          <SelectedDayTimeline
            date={selectedDate}
            requests={selectedDateRequests}
            payrollSettings={payrollSettings}
            onWithdraw={handleWithdrawRequest}
            withdrawingRequestId={withdrawingRequestId}
          />
        </section>
      </div>
    </main>
  );
}
export default function EmployeePage() {
  return (
    <Suspense>
      <EmployeePageContent />
    </Suspense>
  );
}
