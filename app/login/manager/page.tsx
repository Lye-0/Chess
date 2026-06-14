"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  getIdTokenResult,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ArrowLeftIcon, BuildingIcon, KeyIcon, MailIcon } from "@/components/icons";

export default function ManagerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await userCredential.user.reload();
      const tokenResult = await getIdTokenResult(userCredential.user, true);
      const isEmailVerified =
        userCredential.user.emailVerified ||
        tokenResult.claims.email_verified === true;

      if (!isEmailVerified) {
        await signOut(auth);
        setMessage(
          "メール確認がまだ完了していません。確認リンクを開いてから、もう一度ログインしてください。",
        );
        return;
      }

      router.push("/manager/select-organization");
    } catch {
      setError("メールアドレスまたはパスワードが正しくありません。");
    } finally {
      setIsSubmitting(false);
    }
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

        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-950">
          <BuildingIcon className="size-9" />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">管理者ログイン</h1>
          <p className="mt-3 text-sm text-slate-500">
            登録済みのメールアドレスとパスワードを入力してください
          </p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            メールアドレス
            <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
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

          <label className="flex flex-col gap-2 text-sm font-semibold">
            パスワード
            <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <KeyIcon className="size-5 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
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
              href="/signup/manager"
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              新規登録
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 min-w-28 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? "確認中" : "次へ"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
