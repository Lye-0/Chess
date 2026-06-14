"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  changeEmployeePassword,
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

function KeyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="7.5" cy="14.5" r="4.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 11 21 1m-4 4 2 2m-5 1 2 2" />
    </svg>
  );
}

export default function EmployeePasswordChangePage() {
  const router = useRouter();
  const sessionSnapshot = useSyncExternalStore(
    subscribeEmployeeSession,
    getEmployeeSessionSnapshot,
    getEmployeeSessionServerSnapshot,
  );
  const employee = useMemo(
    () => parseEmployeeSessionSnapshot(sessionSnapshot),
    [sessionSnapshot],
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canSubmit =
    Boolean(currentPassword) &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !isSaving;

  useEffect(() => {
    if (!employee && !loadEmployeeSession()) {
      router.replace("/login");
    }
  }, [employee, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee) return;

    if (newPassword.length < 8) {
      setErrorMessage("新しいパスワードは8文字以上で入力してください。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("新しいパスワードと確認用パスワードが一致しません。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      const changed = await changeEmployeePassword(
        employee.employeeId,
        currentPassword,
        newPassword,
      );

      if (!changed) {
        setErrorMessage("現在のパスワードが正しくありません。");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage("パスワードを変更しました。次回から新しいパスワードでログインしてください。");
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "パスワードの変更に失敗しました。",
      );
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
          <p className="text-sm text-[#717182]">{employee.employeeId}</p>
        </div>
      </header>

      <div className="mx-auto max-w-[640px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#ececf0] text-[#030213]">
            <KeyIcon />
          </div>
          <h1 className="mt-4 text-xl font-semibold">パスワード変更</h1>
          <p className="mt-1 text-sm text-[#717182]">
            {employee.name}さんのログイン用パスワードを変更します
          </p>

          {successMessage && (
            <div className="mt-6 rounded-md border border-[#b7dfc7] bg-[#effbf3] px-4 py-3 text-sm text-[#007a2f]">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mt-6 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="current-password" className="block text-sm font-semibold">
                現在のパスワード
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-[#030213]"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold">
                新しいパスワード
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="8文字以上"
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-[#717182] focus:border-[#030213]"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold">
                新しいパスワード（確認）
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-[#030213]"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                "h-10 w-full rounded-md text-sm font-semibold text-white transition",
                canSubmit
                  ? "bg-[#030213] hover:bg-[#171624]"
                  : "cursor-not-allowed bg-[#8e8d95]",
              ].join(" ")}
            >
              {isSaving ? "変更中..." : "パスワードを変更"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
