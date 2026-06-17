"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  clearEmployeeSession,
  findEmployeeById,
  getEmployeePageQuery,
  getEmployeeSessionServerSnapshot,
  getEmployeeSessionSnapshot,
  loadEmployeeSession,
  parseEmployeeSessionSnapshot,
  subscribeEmployeeSession,
  type EmployeeProfile,
} from "@/lib/people";
import {
  subscribeEmployeeShiftRequests,
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

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

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
}: {
  request: ShiftRequest;
  payrollSettings: PayrollSettings;
}) {
  const parsedDate = new Date(`${request.date}T00:00:00`);
  const payroll = calculateShiftPayroll(request, payrollSettings);

  return (
    <div className="flex items-center justify-between rounded-lg border border-black/10 px-6 py-4">
      <div className="flex items-center gap-8">
        <div className="text-center text-sm text-[#030213]">
          <p>{weekdays[parsedDate.getDay()]}</p>
          <p className="font-semibold">{parsedDate.getDate()}</p>
        </div>
        <div>
          <p className="font-semibold">{formatDateOnly(request.date)}</p>
          <p className="mt-1 text-sm text-[#475569]">
            {request.startTime} - {request.endTime}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#00a63e]">
            {formatCurrency(payroll.totalPay)}
          </p>
        </div>
      </div>
      <RequestStatusBadge status={request.status} />
    </div>
  );
}

function ShiftRequestGroup({
  title,
  description,
  requests,
  emptyText,
  payrollSettings,
}: {
  title: string;
  description: string;
  requests: ShiftRequest[];
  emptyText: string;
  payrollSettings: PayrollSettings;
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
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmployeePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeOrganizationId = searchParams.get("organizationId")?.trim() ?? "";
  const routeEmployeeId = searchParams.get("employeeId")?.trim() ?? "";
  const hasRouteEmployee = Boolean(routeOrganizationId && routeEmployeeId);
  const [routeEmployee, setRouteEmployee] = useState<EmployeeProfile | null>(null);
  const sessionSnapshot = useSyncExternalStore(
    subscribeEmployeeSession,
    getEmployeeSessionSnapshot,
    getEmployeeSessionServerSnapshot,
  );
  const sessionEmployee = useMemo(
    () => parseEmployeeSessionSnapshot(sessionSnapshot),
    [sessionSnapshot],
  );
  const routeEmployeeMatches = Boolean(
    routeEmployee &&
      routeEmployee.organizationId === routeOrganizationId &&
      routeEmployee.employeeId === routeEmployeeId,
  );
  const employee = hasRouteEmployee
    ? routeEmployeeMatches
      ? routeEmployee
      : null
    : sessionEmployee;
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isPayrollLoading, setIsPayrollLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    let active = true;

    if (!hasRouteEmployee) return;

    findEmployeeById(routeOrganizationId, routeEmployeeId)
      .then((nextEmployee) => {
        if (!active) return;
        setRouteEmployee(nextEmployee);
        if (!nextEmployee) router.replace("/login");
      })
      .catch((error) => {
        console.error(error);
        if (active) router.replace("/login");
      });

    return () => {
      active = false;
    };
  }, [hasRouteEmployee, routeEmployeeId, routeOrganizationId, router]);

  useEffect(() => {
    if (hasRouteEmployee) return;

    if (!sessionEmployee && !loadEmployeeSession()) {
      router.replace("/login");
    }
  }, [hasRouteEmployee, router, sessionEmployee]);

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
      unsubscribePayroll();
    };
  }, [employee]);

  const sortedRequests = useMemo(() => sortRequests(requests), [requests]);
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

  const employeeQuery = useMemo(
    () => (employee ? getEmployeePageQuery(employee) : ""),
    [employee],
  );

  function handleLogout() {
    clearEmployeeSession();
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
        <div className="mx-auto flex max-w-[1248px] items-center justify-between px-4 py-5 sm:px-6 lg:px-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ececf0] text-[#030213]">
              <UserIcon />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold leading-tight">
                {employee.name}
              </h1>
              <p className="truncate text-sm text-[#717182]">
                {employee.organization} - {employee.department}・{employee.employmentType}・
                {employee.employeeId}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
          >
            <LogoutIcon />
            ログアウト
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="grid gap-6 lg:grid-cols-3">
          <Link
            href={`/employee/shift-request${employeeQuery}`}
            className="h-[226px] rounded-xl border border-black/10 bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#ececf0] text-[#030213]">
              <CalendarIcon />
            </div>
            <h2 className="mt-2 text-xl font-semibold">希望シフト入力</h2>
            <p className="mt-1 text-sm text-[#717182]">シフト希望を入力してください</p>
            <div className="mt-5 rounded-md bg-[#030213] px-4 py-2.5 text-center text-sm font-semibold text-white">
              希望シフトを入力
            </div>
          </Link>

          <Link
            href={`/employee/compatibility${employeeQuery}`}
            className="h-[226px] rounded-xl border border-black/10 bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#f0fdf4] text-[#00a63e]">
              <CompatibilityIcon />
            </div>
            <h2 className="mt-2 text-xl font-semibold">一緒に働きやすさ設定</h2>
            <p className="mt-1 text-sm text-[#717182]">一緒に働く人との相性を入力します</p>
            <div className="mt-5 rounded-md bg-[#00a63e] px-4 py-2.5 text-center text-sm font-semibold text-white">
              設定する
            </div>
          </Link>

          <section className="h-[226px] rounded-xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#ececf0] text-[#030213]">
              <ClockIcon />
            </div>
            <h2 className="mt-2 text-xl font-semibold">直近のシフト</h2>
            <p className="mt-1 text-sm text-[#717182]">今後7日間の確定シフト</p>
            <div className="pt-3">
              {isLoading ? (
                <p className="text-sm text-[#717182]">読み込んでいます</p>
              ) : nearestRequest ? (
                <div className="flex items-center justify-between rounded-lg bg-[#f7f8fb] px-4 py-3">
                  <div>
                    <p className="font-semibold">{formatDateLabel(nearestRequest.date)}</p>
                    <p className="mt-1 text-sm text-[#475569]">
                      {nearestRequest.startTime} - {nearestRequest.endTime}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#00a63e]">
                      {formatCurrency(
                        calculateShiftPayroll(nearestRequest, payrollSettings).totalPay,
                      )}
                    </p>
                  </div>
                  <RequestStatusBadge status={nearestRequest.status} />
                </div>
              ) : (
                <div className="flex min-h-24 items-center justify-center">
                  <p className="text-sm text-[#717182]">直近のシフトはありません</p>
                </div>
              )}
            </div>
          </section>

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

        <section className="mt-6 rounded-xl border border-black/10 bg-white shadow-sm">
          <div className="p-6">
            <h2 className="text-xl font-semibold">シフト希望一覧</h2>
            <p className="mt-1 text-sm text-[#717182]">提出済みの希望シフト</p>
          </div>
          {isLoading ? (
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
export default function EmployeePage() {
  return (
    <Suspense>
      <EmployeePageContent />
    </Suspense>
  );
}
