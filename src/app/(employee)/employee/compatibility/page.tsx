"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  fetchEmployeeCompatibilityData,
  saveEmployeeCompatibilityScores,
  type EmployeeCompatibilityTarget,
} from "@/lib/employeeApi";
import {
  getEmployeeSessionServerSnapshot,
  getEmployeeSessionSnapshot,
  loadEmployeeSession,
  parseEmployeeSessionSnapshot,
  subscribeEmployeeSession,
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
  const [employees, setEmployees] = useState<EmployeeCompatibilityTarget[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [isScoresLoading, setIsScoresLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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


  useEffect(() => {
    if (!sessionEmployee && !loadEmployeeSession()) {
      router.replace("/login");
    }
  }, [router, sessionEmployee]);

  useEffect(() => {
    if (!employee) return;

    let isActive = true;

    async function loadData() {
      try {
        const data = await fetchEmployeeCompatibilityData();
        if (!isActive) return;

        setEmployees(data.employees);
        setScores(data.scores);
        setErrorMessage(null);
      } catch (error) {
        console.error(error);
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "働きやすさ設定の読み込みに失敗しました。",
          );
        }
      } finally {
        if (isActive) {
          setIsEmployeesLoading(false);
          setIsScoresLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isActive = false;
    };
  }, [employee]);

  const targetEmployees = employees;

  function updateScore(employeeName: string, value: number) {
    setScores((currentScores) => ({
      ...currentScores,
      [employeeName]: value,
    }));
    setSuccessMessage(null);
  }

  async function saveScores() {
    if (!employee) return;

    const nextScores = targetEmployees.reduce<Record<string, number>>(
      (currentScores, targetEmployee) => {
        currentScores[targetEmployee.name] = scores[targetEmployee.name] ?? 0;
        return currentScores;
      },
      {},
    );

    try {
      setIsSaving(true);
      setErrorMessage(null);
      const result = await saveEmployeeCompatibilityScores(nextScores);
      setScores(result.scores);
      setSuccessMessage("働きやすさ設定を保存しました。");
    } catch (error) {
      console.error(error);
      setErrorMessage("働きやすさ設定の保存に失敗しました。");
    } finally {
      setIsSaving(false);
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
        <div className="mx-auto flex max-w-[992px] items-center justify-between px-4 py-4 sm:px-6 lg:px-0">
          <Link
            href="/employee"
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
          {successMessage && (
            <div className="mt-5 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#15803d]">
              {successMessage}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {isEmployeesLoading || isScoresLoading ? (
              <div className="flex min-h-40 items-center justify-center text-center text-[#717182]">
                <p>設定情報を読み込んでいます</p>
              </div>
            ) : targetEmployees.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center text-center text-[#717182]">
                <p>設定できる従業員がまだいません</p>
              </div>
            ) : (
              targetEmployees.map((targetEmployee) => {
                const score = scores[targetEmployee.name] ?? 0;

                return (
                  <section
                    key={targetEmployee.name}
                    className="rounded-lg border border-black/10 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{targetEmployee.name}</p>
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
                            targetEmployee.name,
                            Number(event.target.value),
                          )
                        }
                        className="w-full accent-[#00a63e]"
                        aria-label={targetEmployee.name + "さんとの働きやすさ"}
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

          {targetEmployees.length > 0 && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#717182]">
                未入力の相手は 0 点として保存されます。
              </p>
              <button
                type="button"
                disabled={isSaving || isEmployeesLoading || isScoresLoading}
                onClick={saveScores}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#00a63e] px-5 text-sm font-semibold text-white transition hover:bg-[#008c35] disabled:cursor-not-allowed disabled:bg-[#9bcfaa]"
              >
                {isSaving ? "保存中..." : "保存する"}
              </button>
            </div>
          )}
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
