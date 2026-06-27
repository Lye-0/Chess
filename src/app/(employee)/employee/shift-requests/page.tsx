"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
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
  type PayrollSettings,
} from "@/lib/payroll";
import {
  formatShiftTimeRange,
  subscribeShiftSlots,
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
          <p className="mt-1 truncate text-sm text-[#475569]">
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-[#717182]">{description}</p>
        </div>
        <span className="rounded-full bg-[#eef2f7] px-3 py-1 text-sm font-semibold text-[#475569]">
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
  const [withdrawErrorMessage, setWithdrawErrorMessage] = useState<string | null>(null);

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
      (nextSlots) => setSlots(nextSlots),
      (error) => console.error(error),
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
  const sortedRequests = useMemo(() => sortRequests(displayRequests), [displayRequests]);
  const pendingRequests = useMemo(
    () => sortedRequests.filter((request) => request.status !== "承認済"),
    [sortedRequests],
  );
  const approvedRequests = useMemo(
    () => sortedRequests.filter((request) => request.status === "承認済"),
    [sortedRequests],
  );

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
