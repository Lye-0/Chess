"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function EmployeeLoginPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!organizationId.trim()) {
      setError("組織IDを入力してください。");
      return;
    }

    if (!email.trim()) {
      setError("メールアドレスを入力してください。");
      return;
    }

    setMessage("従業員認証処理は後続で実装します。");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="w-full max-w-[360px] border border-neutral-900 px-8 py-10">
        <div className="mx-auto mb-10 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <h1 className="mb-6 text-xl font-semibold">従業員ログイン</h1>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            組織ID
            <input
              type="text"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              required
              autoComplete="organization"
              className="h-10 border border-neutral-900 px-3 outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            メールアドレス
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="h-10 border border-neutral-900 px-3 outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </label>

          {message && <p className="text-sm text-blue-700">{message}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-between gap-4 pt-1">
            <Link
              href="/login"
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
            >
              戻る
            </Link>
            <button
              type="submit"
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
            >
              次へ
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
