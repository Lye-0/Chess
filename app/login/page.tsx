"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  loginEmployee,
  saveEmployeeSession,
} from "@/lib/people";
import { UserCircleIcon } from "../_components/shift-ui";

export default function LoginPage() {
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const isEmployee = role === "employee";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!isEmployee) {
      router.push("/organization-select");
      return;
    }

    if (!employeeId.trim() || !password) {
      setErrorMessage("従業員IDとパスワードを入力してください。");
      return;
    }

    try {
      setIsSubmitting(true);
      const employee = await loginEmployee(employeeId, password);

      if (!employee) {
        setErrorMessage("従業員IDまたはパスワードが正しくありません。");
        return;
      }

      saveEmployeeSession(employee);
      router.push("/employee");
    } catch (error) {
      console.error(error);
      setErrorMessage("ログインに失敗しました。Firestoreの設定を確認してください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectRole(nextRole: "employee" | "admin") {
    setRole(nextRole);
    setErrorMessage(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] p-4 text-[#030213]">
      <section className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ececf0]">
            <UserCircleIcon className="h-9 w-9" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold">シフト管理システム</h1>
          <p className="mt-2 text-sm text-[#717182]">ログインしてください</p>
        </div>

        <div className="mt-6 grid h-9 grid-cols-2 rounded-lg bg-[#e7e7ec] p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => selectRole("employee")}
            className={[
              "rounded-md transition",
              isEmployee ? "bg-white shadow-sm" : "text-[#3d4150]",
            ].join(" ")}
          >
            従業員
          </button>
          <button
            type="button"
            onClick={() => selectRole("admin")}
            className={[
              "rounded-md transition",
              !isEmployee ? "bg-white shadow-sm" : "text-[#3d4150]",
            ].join(" ")}
          >
            管理者
          </button>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
            {errorMessage}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {isEmployee ? (
            <div>
              <label htmlFor="employee-id" className="block text-sm font-semibold">
                従業員ID
              </label>
              <input
                id="employee-id"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                placeholder="例：E123456"
                autoComplete="username"
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-[#717182] focus:border-[#030213]"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="admin-email" className="block text-sm font-semibold">
                メールアドレス
              </label>
              <input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="example@company.com"
                autoComplete="email"
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-[#717182] focus:border-[#030213]"
              />
            </div>
          )}
          <div>
            <label htmlFor="password" className="block text-sm font-semibold">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="パスワードを入力"
              autoComplete={isEmployee ? "current-password" : "password"}
              className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-[#717182] focus:border-[#030213]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-10 w-full rounded-md bg-[#030213] text-sm font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
          >
            {isSubmitting ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </section>
    </main>
  );
}
