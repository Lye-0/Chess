"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeftIcon, BuildingIcon, PlusIcon } from "@/components/icons";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-950">
      <section className="w-full max-w-[460px] rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <Link
          href="/manager/select-organization"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
        >
          <ArrowLeftIcon className="size-4" />
          組織選択へ戻る
        </Link>

        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-950">
          <BuildingIcon className="size-9" />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">組織を追加</h1>
          <p className="mt-3 text-sm text-slate-500">
            管理対象にする勤務先の名前を入力してください
          </p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            組織名
            <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <BuildingIcon className="size-5 text-slate-400" />
              <input
                type="text"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
                autoComplete="organization"
                className="h-full min-w-0 flex-1 bg-transparent outline-none"
              />
            </span>
          </label>

          {message && (
            <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-4 pt-2">
            <Link
              href="/manager/select-organization"
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-950"
            >
              戻る
            </Link>
            <button
              type="submit"
              className="inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <PlusIcon className="size-4" />
              登録
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
