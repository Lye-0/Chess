"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getEmployeeSessionServerSnapshot,
  getEmployeeSessionSnapshot,
  loadEmployeeSession,
  parseEmployeeSessionSnapshot,
  subscribeEmployeeSession,
} from "@/lib/people";
import {
  getShiftRequestPositionLabel,
  withdrawEmployeeShiftRequest,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import {
  calculateShiftPayroll,
  defaultPayrollSettings,
  formatCurrency,
  sumShiftPay,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  defaultShiftRequestSettings,
  type ShiftRequestSettings,
} from "@/lib/shiftRequestSettings";
import { fetchEmployeeShiftData } from "@/lib/employeeApi";
import {
  formatShiftTimeRange,
  type ShiftSlot,
} from "@/lib/shiftSlots";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

type RequestFilter = "completed" | "upcoming" | "pending";

const requestFilterLabels: Record<RequestFilter, string> = {
  completed: "勤務済み",
  upcoming: "勤務予定",
  pending: "承認待ち",
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

function formatDateOnly(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getFullYear()}年${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getYearValue(date: Date) {
  return String(date.getFullYear());
}

function parseMonthValue(value: string) {
  return new Date(`${value}-01T00:00:00`);
}

function formatMonthLabel(value: string) {
  const date = parseMonthValue(value);

  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}


function sortRequests(requests: ShiftRequest[]) {
  return [...requests].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function getRequestStartAt(request: ShiftRequest) {
  return new Date(`${request.date}T${request.startTime}:00`);
}

function getRequestEndAt(request: ShiftRequest) {
  const startAt = getRequestStartAt(request);
  const endAt = new Date(`${request.date}T${request.endTime}:00`);

  if (parseTimeToMinutes(request.endTime) <= parseTimeToMinutes(request.startTime)) {
    endAt.setDate(endAt.getDate() + 1);
  }

  if (endAt <= startAt) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return endAt;
}

function isCompletedRequest(request: ShiftRequest, now: Date) {
  const endAt = getRequestEndAt(request);

  return !Number.isNaN(endAt.getTime()) && endAt <= now;
}

function isRequestInMonth(request: ShiftRequest, monthValue: string) {
  return request.date.startsWith(`${monthValue}-`);
}

function isRequestInYear(request: ShiftRequest, yearValue: string) {
  return request.date.startsWith(`${yearValue}-`);
}

function sumWorkMinutes(requests: ShiftRequest[], payrollSettings: PayrollSettings) {
  return requests.reduce(
    (total, request) => total + calculateShiftPayroll(request, payrollSettings).totalMinutes,
    0,
  );
}

function formatWorkHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) return `${hours}時間`;

  return `${hours}時間${remainingMinutes}分`;
}

function applySlotPositionNames(requests: ShiftRequest[], slots: ShiftSlot[]) {
  const slotPositionNameById = slots.reduce<Record<string, string>>((positions, slot) => {
    positions[slot.id] = slot.positionName;
    return positions;
  }, {});

  return requests.map((request) => ({
    ...request,
    positionName: request.positionName || slotPositionNameById[request.slotId] || "",
  }));
}

function getAvailableFilters(monthValue: string, currentMonthValue: string): RequestFilter[] {
  if (monthValue < currentMonthValue) return ["completed"];
  if (monthValue > currentMonthValue) return ["upcoming", "pending"];

  return ["upcoming", "pending", "completed"];
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

function ShiftRequestRow({
  request,
  payrollSettings,
  showActualAdjustments,
  onWithdraw,
  isWithdrawing = false,
}: {
  request: ShiftRequest;
  payrollSettings: PayrollSettings;
  showActualAdjustments: boolean;
  onWithdraw?: (request: ShiftRequest) => void;
  isWithdrawing?: boolean;
}) {
  const parsedDate = new Date(`${request.date}T00:00:00`);
  const payroll = calculateShiftPayroll(request, payrollSettings);
  const shouldShowActuals = showActualAdjustments && request.status === "承認済";
  const hasActualTime = shouldShowActuals && payroll.usesActualTime;
  const hasActualPay = shouldShowActuals && payroll.totalPay !== payroll.scheduledPay;
  const hasActualMemo = shouldShowActuals && request.actualMemo.trim();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4 sm:gap-8">
        <div className="text-center text-sm text-[#030213]">
          <p>{weekdays[parsedDate.getDay()]}</p>
          <p className="font-semibold">{parsedDate.getDate()}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{formatDateOnly(request.date)}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#1d4ed8]">
            {getShiftRequestPositionLabel(request)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#475569]">
            {hasActualTime ? (
              <>
                <span className="text-[#94a3b8] line-through">
                  {formatShiftTimeRange(request.startTime, request.endTime)}
                </span>
                <span className="font-semibold text-[#030213]">
                  {formatShiftTimeRange(request.actualStartTime, request.actualEndTime)}
                </span>
              </>
            ) : (
              <span className="truncate">
                {formatShiftTimeRange(request.startTime, request.endTime)}
              </span>
            )}
            {(request.employeeGenerated || !request.slotId) && (
              <span className="shrink-0 rounded-md bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#c2410c]">
                自主追加枠
              </span>
            )}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#00a63e]">
            {hasActualPay && (
              <span className="mr-2 text-xs text-[#94a3b8] line-through">
                {formatCurrency(payroll.scheduledPay)}
              </span>
            )}
            {formatCurrency(payroll.totalPay)}
          </p>
          {hasActualMemo && (
            <p className="mt-1 rounded-md bg-[#f7f8fb] px-3 py-2 text-xs text-[#475569]">
              {request.actualMemo}
            </p>
          )}
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

function SummaryPanel({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm font-semibold text-[#596074]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[#030213]">{value}</p>
      <p className="mt-2 text-xs text-[#717182]">{description}</p>
    </div>
  );
}

function EmployeeShiftRequestsContent() {
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
  const now = useMemo(() => new Date(), []);
  const currentMonthValue = useMemo(() => getMonthValue(now), [now]);
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthStart(now));
  const selectedMonthValue = getMonthValue(selectedMonth);
  const selectedYearValue = getYearValue(selectedMonth);
  const [selectedFilter, setSelectedFilter] = useState<RequestFilter>("upcoming");
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [shiftRequestSettings, setShiftRequestSettings] = useState<ShiftRequestSettings>(
    defaultShiftRequestSettings,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadedYearValue, setLoadedYearValue] = useState<string | null>(null);
  const [withdrawingRequestId, setWithdrawingRequestId] = useState<string | null>(null);
  const [withdrawConfirmRequest, setWithdrawConfirmRequest] = useState<ShiftRequest | null>(null);
  const [withdrawErrorMessage, setWithdrawErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionEmployee && !loadEmployeeSession()) {
      router.replace("/login");
    }
  }, [router, sessionEmployee]);

  const loadShiftData = useCallback(async () => {
    if (!employee) return;

    setIsLoading(true);

    try {
      const data = await fetchEmployeeShiftData({ year: selectedYearValue });

      setRequests(data.requests);
      setSlots(data.slots);
      setPayrollSettings(data.payrollSettings);
      setShiftRequestSettings(data.shiftRequestSettings);
      setLoadedYearValue(selectedYearValue);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [employee, selectedYearValue]);

  useEffect(() => {
    if (!employee) return;

    let isActive = true;

    void fetchEmployeeShiftData({ year: selectedYearValue })
      .then((data) => {
        if (!isActive) return;

        setRequests(data.requests);
        setSlots(data.slots);
        setPayrollSettings(data.payrollSettings);
        setShiftRequestSettings(data.shiftRequestSettings);
      setLoadedYearValue(selectedYearValue);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [employee, selectedYearValue]);

  const displayRequests = useMemo(
    () => applySlotPositionNames(requests, slots),
    [requests, slots],
  );
  const selectableMonthValues = useMemo(() => {
    const monthValues = new Set<string>();

    displayRequests.forEach((request) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
        monthValues.add(request.date.slice(0, 7));
      }
    });

    return Array.from(monthValues).sort((a, b) => b.localeCompare(a));
  }, [displayRequests]);
  const activeMonthValue = selectableMonthValues.includes(selectedMonthValue)
    ? selectedMonthValue
    : selectableMonthValues[0] ?? selectedMonthValue;
  const availableFilters = useMemo(
    () => getAvailableFilters(activeMonthValue, currentMonthValue),
    [activeMonthValue, currentMonthValue],
  );
  const activeFilter = availableFilters.includes(selectedFilter)
    ? selectedFilter
    : availableFilters[0];

  const monthRequests = useMemo(
    () => sortRequests(displayRequests.filter((request) => isRequestInMonth(request, activeMonthValue))),
    [activeMonthValue, displayRequests],
  );
  const completedMonthRequests = useMemo(
    () => monthRequests.filter((request) => request.status === "承認済" && isCompletedRequest(request, now)),
    [monthRequests, now],
  );
  const upcomingMonthRequests = useMemo(
    () => monthRequests.filter((request) => request.status === "承認済" && !isCompletedRequest(request, now)),
    [monthRequests, now],
  );
  const pendingMonthRequests = useMemo(
    () => monthRequests.filter((request) => request.status !== "承認済" && !isCompletedRequest(request, now)),
    [monthRequests, now],
  );
  const selectedRequests = useMemo(() => {
    if (activeFilter === "completed") return completedMonthRequests;
    if (activeFilter === "pending") return pendingMonthRequests;

    return upcomingMonthRequests;
  }, [activeFilter, completedMonthRequests, pendingMonthRequests, upcomingMonthRequests]);
  const completedYearRequests = useMemo(
    () =>
      sortRequests(
        displayRequests.filter(
          (request) =>
            isRequestInYear(request, selectedYearValue) &&
            request.status === "承認済" &&
            isCompletedRequest(request, now),
        ),
      ),
    [displayRequests, now, selectedYearValue],
  );
  const monthlyWorkMinutes = useMemo(
    () => sumWorkMinutes(completedMonthRequests, payrollSettings),
    [completedMonthRequests, payrollSettings],
  );
  const monthlyPay = useMemo(
    () => sumShiftPay(completedMonthRequests, payrollSettings),
    [completedMonthRequests, payrollSettings],
  );
  const yearlyWorkMinutes = useMemo(
    () => sumWorkMinutes(completedYearRequests, payrollSettings),
    [completedYearRequests, payrollSettings],
  );
  const yearlyPay = useMemo(
    () => sumShiftPay(completedYearRequests, payrollSettings),
    [completedYearRequests, payrollSettings],
  );
  const selectedFilterLabel = requestFilterLabels[activeFilter];
  const isDataLoading = isLoading || loadedYearValue !== selectedYearValue;

  function handleWithdrawRequest(request: ShiftRequest) {
    if (!employee || request.status === "承認済") return;

    setWithdrawConfirmRequest(request);
  }

  async function confirmWithdrawRequest() {
    if (!employee || !withdrawConfirmRequest) return;

    try {
      setWithdrawingRequestId(withdrawConfirmRequest.id);
      setWithdrawErrorMessage(null);
      await withdrawEmployeeShiftRequest(withdrawConfirmRequest.id, {
        organizationId: employee.organizationId,
        employeeId: employee.employeeId,
        employeeEmail: employee.email,
      });
      await loadShiftData();
      setWithdrawConfirmRequest(null);
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
        <section className="rounded-xl border border-black/10 bg-white shadow-sm">
          <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div>
              <h1 className="text-xl font-semibold">シフト希望一覧</h1>
              <p className="mt-1 text-sm text-[#717182]">
                月ごとに勤務予定、勤務済み、承認待ちのシフトを確認できます
              </p>
              {withdrawErrorMessage && (
                <div className="mt-4 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
                  {withdrawErrorMessage}
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[225px_auto] sm:items-end">
              <label className="grid gap-1 text-sm font-semibold text-[#475569]">
                月を選択
                <select
                  value={selectableMonthValues.length > 0 ? activeMonthValue : ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      setSelectedMonth(parseMonthValue(event.target.value));
                    }
                  }}
                  className="h-12 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-[#030213] shadow-sm outline-none transition focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#bfdbfe]"
                >
                  {selectableMonthValues.length === 0 && (
                    <option value="">対象の月はありません</option>
                  )}
                  {selectableMonthValues.map((monthValue) => (
                    <option key={monthValue} value={monthValue}>
                      {formatMonthLabel(monthValue)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="inline-flex h-12 items-center justify-self-center rounded-lg border border-black/10 bg-white p-1 shadow-sm sm:justify-self-auto">
                {availableFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setSelectedFilter(filter)}
                    className={[
                      "h-10 rounded-md px-4 text-sm font-semibold transition",
                      activeFilter === filter
                        ? "bg-[#030213] text-white shadow-sm"
                        : "text-[#475569] hover:bg-[#f7f8fb]",
                    ].join(" ")}
                  >
                    {requestFilterLabels[filter]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryPanel
            label="選択月の勤務時間"
            value={formatWorkHours(monthlyWorkMinutes)}
            description={`${formatMonthLabel(activeMonthValue)}の勤務済みシフト`}
          />
          <SummaryPanel
            label="選択月のお給料"
            value={formatCurrency(monthlyPay)}
            description={`${formatMonthLabel(activeMonthValue)}の勤務済みシフト`}
          />
          <SummaryPanel
            label="年間の勤務時間"
            value={formatWorkHours(yearlyWorkMinutes)}
            description={`${selectedYearValue}年1月1日〜12月31日の勤務済みシフト`}
          />
          <SummaryPanel
            label="年間のお給料"
            value={formatCurrency(yearlyPay)}
            description={`${selectedYearValue}年1月1日〜12月31日の勤務済みシフト`}
          />
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-6">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{selectedFilterLabel}</h2>
              <p className="mt-1 text-sm text-[#717182]">
                {formatMonthLabel(activeMonthValue)}の{selectedFilterLabel}シフト
              </p>
            </div>
            <span className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#eef2f7] px-2 text-center text-sm font-semibold leading-tight text-[#475569]">
              {selectedRequests.length}件
            </span>
          </div>

          {isDataLoading ? (
            <div className="flex min-h-40 items-center justify-center px-6 pb-6 text-center text-[#717182]">
              <p>読み込んでいます</p>
            </div>
          ) : selectedRequests.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center px-6 pb-6 text-center text-[#717182]">
              <p>{selectedFilterLabel}のシフトはありません</p>
              <p className="mt-1 text-sm">月や表示内容を切り替えて確認できます</p>
            </div>
          ) : (
            <div className="space-y-3 px-6 pb-6">
              {selectedRequests.map((request) => (
                <ShiftRequestRow
                  key={request.id}
                  request={request}
                  payrollSettings={payrollSettings}
                  showActualAdjustments={shiftRequestSettings.employeeActualShiftAdjustmentsVisible}
                  onWithdraw={activeFilter === "pending" ? handleWithdrawRequest : undefined}
                  isWithdrawing={withdrawingRequestId === request.id}
                />
              ))}
            </div>
          )}
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

            <div className="mt-6 flex flex-col gap-3 rounded-lg bg-[#f7f8fb] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold">{formatDateLabel(withdrawConfirmRequest.date)}</p>
                <p className="mt-1 truncate text-sm font-semibold text-[#1d4ed8]">
                  {getShiftRequestPositionLabel(withdrawConfirmRequest)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-[#475569] sm:justify-end">
                <span>{formatShiftTimeRange(withdrawConfirmRequest.startTime, withdrawConfirmRequest.endTime)}</span>
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
                onClick={confirmWithdrawRequest}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#b91c1c] text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
              >
                {withdrawingRequestId === withdrawConfirmRequest.id ? "撤回中..." : "撤回する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function EmployeeShiftRequestsPage() {
  return (
    <Suspense>
      <EmployeeShiftRequestsContent />
    </Suspense>
  );
}
