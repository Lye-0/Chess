"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function EmployeeVerifyContent() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId") ?? "";
  const email = searchParams.get("email") ?? "";
  const [verificationCode, setVerificationCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!verificationCode.trim()) {
      setError("確認用コードを入力してください。");
      return;
    }

    setMessage("確認コード認証処理は後続で実装します。");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="w-full max-w-[360px] border border-neutral-900 px-8 py-10">
        <div className="mx-auto mb-10 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <h1 className="mb-6 text-xl font-semibold">確認用コード</h1>

        <div className="mb-6 space-y-2 text-sm">
          <p>入力されたメールアドレスに確認用コードを送信しました。</p>
          {organizationId && (
            <p className="border border-neutral-900 px-3 py-2">
              組織ID: {organizationId}
            </p>
          )}
          {email && (
            <p className="border border-neutral-900 px-3 py-2">
              メールアドレス: {email}
            </p>
          )}
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            確認用コード
            <input
              type="text"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-10 border border-neutral-900 px-3 outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </label>

          {message && <p className="text-sm text-blue-700">{message}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-between gap-4 pt-1">
            <Link
              href="/login/employee"
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

export default function EmployeeVerifyPage() {
  return (
    <Suspense>
      <EmployeeVerifyContent />
    </Suspense>
  );
}
