"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  defaultOrganizationId,
  subscribeEmployees,
  type EmployeeProfile,
} from "@/lib/people";
import {
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import {
  BackHeader,
  Card,
  ChevronDownIcon,
  DownloadIcon,
} from "../../_components/shift-ui";

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function getMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");

  return `${year}年${Number(monthNumber)}月`;
}

function parseShiftDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function getShiftStartEnd(request: ShiftRequest) {
  const startAt = parseShiftDateTime(request.date, request.startTime);
  const endAt = parseShiftDateTime(request.date, request.endTime);

  if (endAt <= startAt) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return { startAt, endAt };
}

function isCompletedApprovedShift(request: ShiftRequest, now: Date) {
  const { endAt } = getShiftStartEnd(request);

  return (
    request.status === "承認済" &&
    !Number.isNaN(endAt.getTime()) &&
    endAt <= now
  );
}

function calculateWorkMinutes(request: ShiftRequest) {
  const { startAt, endAt } = getShiftStartEnd(request);
  const diff = endAt.getTime() - startAt.getTime();

  if (!Number.isFinite(diff) || diff < 0) return 0;

  return Math.round(diff / 60000);
}

function formatHoursOnly(minutes: number) {
  const roundedHours = Math.round((minutes / 60) * 10) / 10;

  if (Number.isInteger(roundedHours)) {
    return `${roundedHours.toLocaleString()}h`;
  }

  return `${roundedHours.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}h`;
}

type EmployeeWorkSummary = {
  employee: EmployeeProfile;
  minutes: number;
  shiftCount: number;
};

function AdminTimesheetContent() {
  const searchParams = useSearchParams();
  const selectedOrganizationId = searchParams.get("organizationId")?.trim();
  const organizationId = selectedOrganizationId || defaultOrganizationId;
  const organizationQuery = `?organizationId=${encodeURIComponent(organizationId)}`;
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthValue());
  const [now, setNow] = useState(() => new Date());
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = isEmployeesLoading || isRequestsLoading;

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const unsubscribeEmployees = subscribeEmployees(
      (nextEmployees) => {
        setEmployees(nextEmployees);
        setIsEmployeesLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsEmployeesLoading(false);
        setErrorMessage("従業員一覧の読み込みに失敗しました。");
      },
      organizationId,
    );
    const unsubscribeRequests = subscribeShiftRequests(
      (nextRequests) => {
        setRequests(nextRequests);
        setIsRequestsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsRequestsLoading(false);
        setErrorMessage("シフト情報の読み込みに失敗しました。");
      },
      organizationId,
    );

    return () => {
      unsubscribeEmployees();
      unsubscribeRequests();
    };
  }, [organizationId]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>([getMonthValue()]);

    requests.forEach((request) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
        months.add(request.date.slice(0, 7));
      }
    });

    return [...months].sort().reverse();
  }, [requests]);

  const completedRequests = useMemo(() => {
    return requests.filter((request) => {
      return (
        request.date.startsWith(selectedMonth) &&
        isCompletedApprovedShift(request, now)
      );
    });
  }, [now, requests, selectedMonth]);

  const workMinutesByEmployee = useMemo(() => {
    return completedRequests.reduce<Record<string, { minutes: number; count: number }>>(
      (groups, request) => {
        const current = groups[request.employeeId] ?? { minutes: 0, count: 0 };
        groups[request.employeeId] = {
          minutes: current.minutes + calculateWorkMinutes(request),
          count: current.count + 1,
        };
        return groups;
      },
      {},
    );
  }, [completedRequests]);

  const employeeSummaries = useMemo<EmployeeWorkSummary[]>(() => {
    return employees.map((employee) => {
      const work = workMinutesByEmployee[employee.employeeId] ?? {
        minutes: 0,
        count: 0,
      };

      return {
        employee,
        minutes: work.minutes,
        shiftCount: work.count,
      };
    });
  }, [employees, workMinutesByEmployee]);

  const totalWorkMinutes = completedRequests.reduce(
    (total, request) => total + calculateWorkMinutes(request),
    0,
  );
  const averageWorkMinutes =
    employees.length > 0 ? Math.round(totalWorkMinutes / employees.length) : 0;

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader
        backHref={`/admin${organizationQuery}`}
        right={
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
          >
            <DownloadIcon />
            CSVエクスポート
          </button>
        }
      />

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <p className="text-sm text-[#717182]">総勤務時間</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatHoursOnly(totalWorkMinutes)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">
              終了済みシフトの合計
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">平均勤務時間</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatHoursOnly(averageWorkMinutes)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">従業員1人あたり</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">従業員数</p>
            <p className="mt-4 text-3xl font-semibold">
              {isEmployeesLoading ? "..." : `${employees.length}人`}
            </p>
            <p className="mt-4 text-sm text-[#475569]">この組織の登録人数</p>
          </Card>
        </section>

        <Card className="mt-6 min-h-[196px] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold">勤務時間管理</h1>
              <p className="mt-1 text-sm text-[#717182]">
                {employeeSummaries.length}名の従業員別勤務時間
              </p>
            </div>

            <div className="relative w-full sm:w-[182px]">
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="h-10 w-full appearance-none rounded-md border border-black/10 bg-white px-4 pr-10 text-sm font-semibold shadow-sm outline-none"
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
            </div>
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-24 items-center justify-center text-center text-[#717182]">
              <p>読み込んでいます</p>
            </div>
          ) : employees.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center text-center text-[#717182]">
              <p>従業員が登録されていません</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {employeeSummaries.map(({ employee, minutes, shiftCount }) => (
                <div
                  key={employee.employeeId}
                  className="flex flex-col gap-3 rounded-lg border border-black/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{employee.name}</p>
                    <p className="mt-1 truncate text-sm text-[#717182]">
                      {employee.email} / {employee.employmentType}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-semibold">
                      {formatHoursOnly(minutes)}
                    </p>
                    <p className="mt-1 text-sm text-[#717182]">
                      終了済みシフト {shiftCount}件
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

export default function AdminTimesheetPage() {
  return (
    <Suspense>
      <AdminTimesheetContent />
    </Suspense>
  );
}
