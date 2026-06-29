"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  subscribeEmployees,
  type EmployeeProfile,
} from "@/lib/people";
import {
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import {
  calculateShiftPayroll,
  defaultPayrollSettings,
  formatCurrency,
  subscribePayrollSettings,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  BackHeader,
  Card,
  ChevronDownIcon,
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

function isApprovedShift(request: ShiftRequest) {
  return request.status === "承認済";
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
  pay: number;
  shiftCount: number;
};

function AdminTimesheetContent() {
  const {
    organizationId,
    organizationQuery,
    organization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthValue());
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [isPayrollLoading, setIsPayrollLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = isEmployeesLoading || isRequestsLoading || isPayrollLoading;


  useEffect(() => {
    if (!organization) return;

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
    const unsubscribePayroll = subscribePayrollSettings(
      (settings) => {
        setPayrollSettings(settings);
        setIsPayrollLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsPayrollLoading(false);
        setErrorMessage("給与設定の読み込みに失敗しました。");
      },
      organizationId,
    );

    return () => {
      unsubscribeEmployees();
      unsubscribeRequests();
      unsubscribePayroll();
    };
  }, [organization, organizationId]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>([getMonthValue()]);

    requests.forEach((request) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
        months.add(request.date.slice(0, 7));
      }
    });

    return [...months].sort().reverse();
  }, [requests]);

  const approvedRequests = useMemo(() => {
    return requests.filter((request) => {
      return request.date.startsWith(selectedMonth) && isApprovedShift(request);
    });
  }, [requests, selectedMonth]);

  const workMinutesByEmployee = useMemo(() => {
    return approvedRequests.reduce<Record<string, { minutes: number; count: number }>>(
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
  }, [approvedRequests]);

  const payByEmployee = useMemo(() => {
    return approvedRequests.reduce<Record<string, number>>((groups, request) => {
      groups[request.employeeId] =
        (groups[request.employeeId] ?? 0) +
        calculateShiftPayroll(request, payrollSettings).totalPay;
      return groups;
    }, {});
  }, [approvedRequests, payrollSettings]);

  const employeeSummaries = useMemo<EmployeeWorkSummary[]>(() => {
    return employees.map((employee) => {
      const work = workMinutesByEmployee[employee.employeeId] ?? {
        minutes: 0,
        count: 0,
      };

      return {
        employee,
        minutes: work.minutes,
        pay: payByEmployee[employee.employeeId] ?? 0,
        shiftCount: work.count,
      };
    });
  }, [employees, payByEmployee, workMinutesByEmployee]);

  const totalWorkMinutes = useMemo(() => {
    return approvedRequests.reduce(
      (total, request) => total + calculateWorkMinutes(request),
      0,
    );
  }, [approvedRequests]);
  const totalMonthlyPay = useMemo(() => {
    return approvedRequests.reduce(
      (total, request) =>
        total + calculateShiftPayroll(request, payrollSettings).totalPay,
      0,
    );
  }, [approvedRequests, payrollSettings]);
  const activeEmployeeCount = useMemo(() => {
    return new Set(approvedRequests.map((request) => request.employeeId)).size;
  }, [approvedRequests]);
  const averageWorkMinutes =
    activeEmployeeCount > 0 ? Math.round(totalWorkMinutes / activeEmployeeCount) : 0;
  const averagePay =
    activeEmployeeCount > 0 ? Math.round(totalMonthlyPay / activeEmployeeCount) : 0;

  if (isCheckingOrganization || !organization) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] text-[#717182]">
        <p>管理できる組織を確認しています</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader backHref={`/admin${organizationQuery}`} />

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">勤務時間管理</h1>
            <p className="mt-2 text-sm text-[#717182]">
              {formatMonthLabel(selectedMonth)}の承認済みシフト
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

        <section className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          <Card className="p-6">
            <p className="text-sm text-[#717182]">平均勤務時間</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatHoursOnly(averageWorkMinutes)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">出勤人数1人あたり</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">平均給与</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatCurrency(averagePay)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">出勤人数1人あたり</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">合計勤務時間</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatHoursOnly(totalWorkMinutes)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">承認済みシフトの合計</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">合計給与</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatCurrency(totalMonthlyPay)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">承認済みシフトの合計</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">出勤人数</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : `${activeEmployeeCount}人`}
            </p>
            <p className="mt-4 text-sm text-[#475569]">1件以上の確定シフト</p>
          </Card>
        </section>

        <Card className="mt-6 min-h-[196px] p-6">
          <div>
            <h2 className="text-xl font-semibold">従業員別の勤務時間一覧</h2>
            <p className="mt-1 text-sm text-[#717182]">
              {employeeSummaries.length}名の従業員別勤務時間
            </p>
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
              {employeeSummaries.map(
                ({ employee, minutes, pay, shiftCount }) => (
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
                      <p className="mt-1 text-sm font-semibold text-[#00a63e]">
                        給与 {formatCurrency(pay)}
                      </p>
                      <p className="mt-1 text-sm text-[#717182]">
                        承認済みシフト {shiftCount}件
                      </p>
                    </div>
                  </div>
                ),
              )}
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
