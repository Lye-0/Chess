"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function NewOrganizationPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!organizationName.trim()) {
      setError("組織名を入力してください。");
      return;
    }

    setMessage("組織登録処理は後続で実装します。");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="w-full max-w-[360px] border border-neutral-900 px-8 py-10">
        <div className="mx-auto mb-10 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <h1 className="mb-6 text-xl font-semibold">管理する勤務先を追加</h1>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            組織名
            <input
              type="text"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              required
              autoComplete="organization"
              className="h-10 border border-neutral-900 px-3 outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </label>

          {message && <p className="text-sm text-blue-700">{message}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-between gap-4 pt-1">
            <Link
              href="/manager/select-organization"
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
            >
              戻る
            </Link>
            <button
              type="submit"
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
            >
              登録
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
