"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextInput, UserCircleIcon } from "../_components/shift-ui";

export default function LoginPage() {
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const router = useRouter();
  const isEmployee = role === "employee";

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
            onClick={() => setRole("employee")}
            className={[
              "rounded-md transition",
              isEmployee ? "bg-white shadow-sm" : "text-[#3d4150]",
            ].join(" ")}
          >
            従業員
          </button>
          <button
            type="button"
            onClick={() => setRole("admin")}
            className={[
              "rounded-md transition",
              !isEmployee ? "bg-white shadow-sm" : "text-[#3d4150]",
            ].join(" ")}
          >
            管理者
          </button>
        </div>

        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            router.push(isEmployee ? "/employee" : "/organization-select");
          }}
        >
          {isEmployee ? (
            <TextInput id="employee-id" label="従業員ID" placeholder="従業員IDを入力" />
          ) : (
            <TextInput
              id="admin-email"
              label="メールアドレス"
              placeholder="example@company.com"
              type="email"
            />
          )}
          <TextInput id="password" label="パスワード" placeholder="パスワードを入力" type="password" />

          <button
            type="submit"
            className="h-10 w-full rounded-md bg-[#030213] text-sm font-semibold text-white transition hover:bg-[#171624]"
          >
            ログイン
          </button>
        </form>
      </section>
    </main>
  );
}
