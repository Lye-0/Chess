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
  type PayrollSettings,
} from "@/lib/payroll";
import { fetchEmployeeShiftData } from "@/lib/employeeApi";
import {
  formatShiftTimeRange,
  type ShiftSlot,
} from "@/lib/shiftSlots";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

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

function getRequestEndAt(request: ShiftRequest) {
  const endAt = new Date(`${request.date}T${request.endTime}:00`);

  if (parseTimeToMinutes(request.endTime) <= parseTimeToMinutes(request.startTime)) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return endAt;
}

function isRequestUpcoming(request: ShiftRequest) {
  const endAt = getRequestEndAt(request);

  return !Number.isNaN(endAt.getTime()) && endAt > new Date();
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
            <span className="truncate">
              {formatShiftTimeRange(request.startTime, request.endTime)}
            </span>
            {(request.employeeGenerated || !request.slotId) && (
              <span className="shrink-0 rounded-md bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#c2410c]">
                自主追加枠
              </span>
            )}
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

function ShiftRequestGroup({
  title,
  description,
  requests,
  emptyText,
  payrollSettings,
  onWithdraw,
  withdrawingRequestId,
}: {
  title: string;
  description: string;
  requests: ShiftRequest[];
  emptyText: string;
  payrollSettings: PayrollSettings;
  onWithdraw?: (request: ShiftRequest) => void;
  withdrawingRequestId?: string | null;
}) {
  return (
    <section className="rounded-md border border-black/10 bg-white px-4 py-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#717182] sm:text-sm">{description}</p>
        </div>
        <span className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#eef2f7] px-2 text-center text-sm font-semibold leading-tight text-[#475569]">
          {requests.length}件
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="mt-3 flex min-h-24 items-center justify-center rounded-lg border border-dashed border-black/10 text-sm text-[#717182]">
          {emptyText}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {requests.map((request) => (
            <ShiftRequestRow
              key={request.id}
              request={request}
              payrollSettings={payrollSettings}
              onWithdraw={onWithdraw}
              isWithdrawing={withdrawingRequestId === request.id}
            />
          ))}
        </div>
      )}
    </section>
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
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isPayrollLoading, setIsPayrollLoading] = useState(true);
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

    try {
      const data = await fetchEmployeeShiftData();

      setRequests(data.requests);
      setSlots(data.slots);
      setPayrollSettings(data.payrollSettings);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
      setIsPayrollLoading(false);
    }
  }, [employee]);

  useEffect(() => {
    if (!employee) return;

    let isActive = true;

    void fetchEmployeeShiftData()
      .then((data) => {
        if (!isActive) return;

        setRequests(data.requests);
        setSlots(data.slots);
        setPayrollSettings(data.payrollSettings);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
          setIsPayrollLoading(false);
        }
      });

    return () => {
      isActive = false;
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
  const sortedRequests = useMemo(
    () => sortRequests(displayRequests.filter(isRequestUpcoming)),
    [displayRequests],
  );
  const pendingRequests = useMemo(
    () => sortedRequests.filter((request) => request.status !== "承認済"),
    [sortedRequests],
  );
  const approvedRequests = useMemo(
    () => sortedRequests.filter((request) => request.status === "承認済"),
    [sortedRequests],
  );

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
          <div className="p-6">
            <h1 className="text-xl font-semibold">シフト希望一覧</h1>
            <p className="mt-1 text-sm text-[#717182]">提出済みの希望シフト</p>
            {withdrawErrorMessage && (
              <div className="mt-4 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
                {withdrawErrorMessage}
              </div>
            )}
          </div>
          {isLoading || isPayrollLoading ? (
            <div className="flex min-h-40 items-center justify-center px-6 pb-6 text-center text-[#717182]">
              <p>読み込んでいます</p>
            </div>
          ) : sortedRequests.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center px-6 pb-6 text-center text-[#717182]">
              <p>まだシフト希望を提出していません</p>
              <p className="mt-1 text-sm">
                「希望シフト入力」からシフトを提出してください
              </p>
            </div>
          ) : (
            <div className="grid gap-6 px-6 pb-6 lg:grid-cols-2">
              <ShiftRequestGroup
                title="承認待ち"
                description="管理者の承認を待っている希望シフト"
                requests={pendingRequests}
                emptyText="承認待ちのシフト希望はありません"
                payrollSettings={payrollSettings}
                onWithdraw={handleWithdrawRequest}
                withdrawingRequestId={withdrawingRequestId}
              />
              <ShiftRequestGroup
                title="承認済み"
                description="管理者が承認した確定シフト"
                requests={approvedRequests}
                emptyText="承認済みのシフトはありません"
                payrollSettings={payrollSettings}
              />
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
