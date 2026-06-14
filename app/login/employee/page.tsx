"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeftIcon, BadgeIcon, BuildingIcon, MailIcon } from "@/components/icons";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!organizationId.trim()) {
      setError("組織IDを入力してください。");
      return;
    }

    if (!email.trim()) {
      setError("メールアドレスを入力してください。");
      return;
    }

    const params = new URLSearchParams({
      organizationId: organizationId.trim(),
      email: email.trim(),
    });

    router.push(`/login/employee/verify?${params.toString()}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-950">
      <section className="w-full max-w-[430px] rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
        >
          <ArrowLeftIcon className="size-4" />
          ログイン選択へ
        </Link>

        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-2xl bg-green-50 text-green-600">
          <BadgeIcon className="size-9" />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">従業員ログイン</h1>
          <p className="mt-3 text-sm text-slate-500">
            所属する組織IDとメールアドレスを入力してください
          </p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            組織ID
            <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-green-400 focus-within:ring-4 focus-within:ring-green-100">
              <BuildingIcon className="size-5 text-slate-400" />
              <input
                type="text"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                required
                autoComplete="organization"
                className="h-full min-w-0 flex-1 bg-transparent outline-none"
              />
            </span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            メールアドレス
            <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-green-400 focus-within:ring-4 focus-within:ring-green-100">
              <MailIcon className="size-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="h-full min-w-0 flex-1 bg-transparent outline-none"
              />
            </span>
          </label>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-4 pt-2">
            <Link
              href="/login"
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-950"
            >
              戻る
            </Link>
            <button
              type="submit"
              className="h-11 min-w-28 rounded-xl bg-green-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
            >
              次へ
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
