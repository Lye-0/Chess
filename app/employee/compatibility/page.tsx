"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  findEmployeeById,
  getEmployeePageQuery,
  getEmployeeSessionServerSnapshot,
  getEmployeeSessionSnapshot,
  loadEmployeeSession,
  parseEmployeeSessionSnapshot,
  subscribeEmployeeSession,
  subscribeEmployees,
  type EmployeeProfile,
} from "@/lib/people";

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

function formatScore(score: number) {
  if (score > 0) return `+${score}`;
  return String(score);
}

function EmployeeCompatibilityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeOrganizationId = searchParams.get("organizationId")?.trim() ?? "";
  const routeEmployeeId = searchParams.get("employeeId")?.trim() ?? "";
  const hasRouteEmployee = Boolean(routeOrganizationId && routeEmployeeId);
  const [routeEmployee, setRouteEmployee] = useState<EmployeeProfile | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      employee.organizationId,
    );

    return () => {
      unsubscribeEmployees();
    };
  }, [employee]);

  const targetEmployees = useMemo(() => {
    if (!employee) return [];
    return employees.filter(
      (targetEmployee) => targetEmployee.employeeId !== employee.employeeId,
    );
  }, [employee, employees]);
  const employeeQuery = useMemo(
    () => (employee ? getEmployeePageQuery(employee) : ""),
    [employee],
  );

  function updateScore(employeeId: string, value: number) {
    setScores((currentScores) => ({
      ...currentScores,
      [employeeId]: value,
    }));
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
        <div className="mx-auto flex max-w-[992px] items-center justify-between px-4 py-4 sm:px-6 lg:px-0">
          <Link
            href={`/employee${employeeQuery}`}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
          >
            <BackIcon />
            戻る
          </Link>
          <p className="text-sm text-[#717182]">
            {employee.organization} - {employee.department}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[992px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#f0fdf4] text-[#00a63e]">
              <CompatibilityIcon />
            </div>
            <div>
              <h1 className="text-xl font-semibold">一緒に働きやすさ設定</h1>
              <p className="mt-1 text-sm text-[#717182]">
                他の従業員ごとに -5 から +5 で入力します
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {isEmployeesLoading ? (
              <div className="flex min-h-40 items-center justify-center text-center text-[#717182]">
                <p>従業員を読み込んでいます</p>
              </div>
            ) : targetEmployees.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center text-center text-[#717182]">
                <p>設定できる従業員がまだいません</p>
              </div>
            ) : (
              targetEmployees.map((targetEmployee) => {
                const score = scores[targetEmployee.employeeId] ?? 0;

                return (
                  <section
                    key={targetEmployee.employeeId}
                    className="rounded-lg border border-black/10 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{targetEmployee.name}</p>
                        <p className="mt-1 text-sm text-[#717182]">
                          {targetEmployee.employmentType}
                          <span className="ml-4 font-mono">
                            {targetEmployee.employeeId}
                          </span>
                        </p>
                      </div>
                      <span className="inline-flex h-10 min-w-16 items-center justify-center rounded-md bg-[#eef2ff] px-3 font-mono text-lg font-semibold text-[#1d4ed8]">
                        {formatScore(score)}
                      </span>
                    </div>

                    <div className="mt-5">
                      <input
                        type="range"
                        min="-5"
                        max="5"
                        step="1"
                        value={score}
                        onChange={(event) =>
                          updateScore(
                            targetEmployee.employeeId,
                            Number(event.target.value),
                          )
                        }
                        className="w-full accent-[#00a63e]"
                        aria-label={`${targetEmployee.name}さんとの働きやすさ`}
                      />
                      <div className="mt-2 flex justify-between text-xs font-semibold text-[#717182]">
                        <span>-5</span>
                        <span>0</span>
                        <span>+5</span>
                      </div>
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function EmployeeCompatibilityPage() {
  return (
    <Suspense>
      <EmployeeCompatibilityContent />
    </Suspense>
  );
}
