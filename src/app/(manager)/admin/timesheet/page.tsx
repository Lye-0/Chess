"use client";

import type { FormEvent } from "react";
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
  employmentTypes,
  formatCurrency,
  subscribePayrollSettings,
  updatePayrollSettings,
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
  pay: number;
  yearlyPay: number;
  shiftCount: number;
};

function toPayrollForm(settings: PayrollSettings) {
  return {
    hourlyRates: employmentTypes.reduce<Record<string, string>>((rates, type) => {
      rates[type] = String(settings.hourlyRates[type] ?? 0);
      return rates;
    }, {}),
    nightStartTime: settings.nightStartTime,
    nightEndTime: settings.nightEndTime,
    nightMultiplier: String(settings.nightMultiplier),
  };
}

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
  const [payrollForm, setPayrollForm] = useState(() =>
    toPayrollForm(defaultPayrollSettings),
  );
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthValue());
  const [now, setNow] = useState(() => new Date());
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [isPayrollLoading, setIsPayrollLoading] = useState(true);
  const [isSavingPayroll, setIsSavingPayroll] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = isEmployeesLoading || isRequestsLoading || isPayrollLoading;

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timerId);
  }, []);

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
        setPayrollForm(toPayrollForm(settings));
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
  const selectedYear = Number(selectedMonth.split("-")[0]);

  const completedRequests = useMemo(() => {
    return requests.filter((request) => {
      return (
        request.date.startsWith(selectedMonth) &&
        isCompletedApprovedShift(request, now)
      );
    });
  }, [now, requests, selectedMonth]);
  const yearlyCompletedRequests = useMemo(() => {
    return requests.filter((request) => {
      return (
        request.date.startsWith(`${selectedYear}-`) &&
        isCompletedApprovedShift(request, now)
      );
    });
  }, [now, requests, selectedYear]);

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
      const employeeRequests = completedRequests.filter(
        (request) => request.employeeId === employee.employeeId,
      );
      const employeeYearlyRequests = yearlyCompletedRequests.filter(
        (request) => request.employeeId === employee.employeeId,
      );

      return {
        employee,
        minutes: work.minutes,
        pay: employeeRequests.reduce(
          (total, request) =>
            total + calculateShiftPayroll(request, payrollSettings).totalPay,
          0,
        ),
        yearlyPay: employeeYearlyRequests.reduce(
          (total, request) =>
            total + calculateShiftPayroll(request, payrollSettings).totalPay,
          0,
        ),
        shiftCount: work.count,
      };
    });
  }, [
    completedRequests,
    employees,
    payrollSettings,
    workMinutesByEmployee,
    yearlyCompletedRequests,
  ]);

  const totalWorkMinutes = completedRequests.reduce(
    (total, request) => total + calculateWorkMinutes(request),
    0,
  );
  const averageWorkMinutes =
    employees.length > 0 ? Math.round(totalWorkMinutes / employees.length) : 0;
  const totalMonthlyPay = useMemo(() => {
    return completedRequests.reduce(
      (total, request) =>
        total + calculateShiftPayroll(request, payrollSettings).totalPay,
      0,
    );
  }, [completedRequests, payrollSettings]);
  const totalYearlyPay = useMemo(() => {
    return yearlyCompletedRequests.reduce(
      (total, request) =>
        total + calculateShiftPayroll(request, payrollSettings).totalPay,
      0,
    );
  }, [payrollSettings, yearlyCompletedRequests]);

  async function handlePayrollSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSavingPayroll(true);
      setErrorMessage(null);
      await updatePayrollSettings(
        {
          hourlyRates: employmentTypes.reduce<Record<string, number>>(
            (rates, type) => {
              const rate = Number(payrollForm.hourlyRates[type] ?? 0);
              rates[type] = Number.isFinite(rate) && rate >= 0 ? rate : 0;
              return rates;
            },
            {},
          ),
          nightStartTime: payrollForm.nightStartTime,
          nightEndTime: payrollForm.nightEndTime,
          nightMultiplier: Number(payrollForm.nightMultiplier),
        },
        organizationId,
      );
    } catch (error) {
      console.error(error);
      setErrorMessage("給与設定の保存に失敗しました。");
    } finally {
      setIsSavingPayroll(false);
    }
  }

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
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
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
            <p className="text-sm text-[#717182]">月間給与合計</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatCurrency(totalMonthlyPay)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">
              終了済みシフトの合計
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">年間給与合計</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoading ? "..." : formatCurrency(totalYearlyPay)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">
              {selectedYear}年の終了済みシフト
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

        <Card className="mt-6 p-6">
          <h1 className="text-xl font-semibold">給与設定</h1>
          <p className="mt-1 text-sm text-[#717182]">
            雇用形態ごとの時給と深夜割増を設定します
          </p>

          <form className="mt-6 space-y-5" onSubmit={handlePayrollSubmit}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {employmentTypes.map((employmentType) => (
                <label key={employmentType} className="block">
                  <span className="text-sm font-semibold">{employmentType}</span>
                  <input
                    type="number"
                    min="0"
                    value={payrollForm.hourlyRates[employmentType] ?? "0"}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        hourlyRates: {
                          ...current.hourlyRates,
                          [employmentType]: event.target.value,
                        },
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                  />
                </label>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-sm font-semibold">深夜開始</span>
                <input
                  type="time"
                  value={payrollForm.nightStartTime}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      nightStartTime: event.target.value,
                    }))
                  }
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">深夜終了</span>
                <input
                  type="time"
                  value={payrollForm.nightEndTime}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      nightEndTime: event.target.value,
                    }))
                  }
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">深夜倍率</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={payrollForm.nightMultiplier}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      nightMultiplier: event.target.value,
                    }))
                  }
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSavingPayroll}
              className="h-10 rounded-md bg-[#030213] px-5 text-sm font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
            >
              {isSavingPayroll ? "保存中..." : "給与設定を保存"}
            </button>
          </form>
        </Card>

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
              {employeeSummaries.map(
                ({ employee, minutes, pay, yearlyPay, shiftCount }) => (
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
                        月間 {formatCurrency(pay)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#c2410c]">
                        年間 {formatCurrency(yearlyPay)}
                      </p>
                      <p className="mt-1 text-sm text-[#717182]">
                        終了済みシフト {shiftCount}件
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
