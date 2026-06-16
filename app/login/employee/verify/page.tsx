"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { BadgeIcon, CheckIcon, KeyIcon } from "@/components/icons";
import { findEmployeeByEmail, getEmployeePageQuery, saveEmployeeSession } from "@/lib/people";

function EmployeeVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId") ?? "";
  const email = searchParams.get("email") ?? "";
  const [verificationCode, setVerificationCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!verificationCode.trim()) {
      setError("確認用コードを入力してください。");
      return;
    }

    if (!organizationId || !email) {
      setError("従業員確認に必要な情報が不足しています。もう一度入力してください。");
      return;
    }

    try {
      setIsSubmitting(true);
      const employee = await findEmployeeByEmail(organizationId, email);

      if (!employee) {
        setError("従業員情報を確認できませんでした。もう一度入力してください。");
        return;
      }

      saveEmployeeSession(employee);
      router.push(`/employee${getEmployeePageQuery(employee)}`);
    } catch (verifyError) {
      console.error(verifyError);
      setError("確認処理に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-950">
      <section className="w-full max-w-[460px] rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-2xl bg-green-50 text-green-600">
          <BadgeIcon className="size-9" />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">確認用コード</h1>
          <p className="mt-3 text-sm text-slate-500">
            メールに届いたコードを入力
          </p>
        </div>

        <div className="mb-6 space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="flex items-center gap-2 font-semibold text-slate-950">
            <CheckIcon className="size-4 text-green-600" />
            確認用コードを送信しました
          </p>
          {organizationId && (
            <p className="rounded-lg bg-white px-3 py-2">
              組織ID: {organizationId}
            </p>
          )}
          {email && (
            <p className="rounded-lg bg-white px-3 py-2">
              メールアドレス: {email}
            </p>
          )}
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            確認用コード
            <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-green-400 focus-within:ring-4 focus-within:ring-green-100">
              <KeyIcon className="size-5 text-slate-400" />
              <input
                type="text"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
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
              href="/login/employee"
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-950"
            >
              戻る
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 min-w-28 rounded-xl bg-green-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? "確認中" : "次へ"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function EmployeeVerifyPage() {
  return (
    <Suspense>
      <EmployeeVerifyContent />
    </Suspense>
  );
}
