"use client";

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { auth } from "@/lib/firebase";
import { ArrowLeftIcon, BuildingIcon, KeyIcon, MailIcon } from "@/components/icons";

const getSignupErrorMessage = (error: unknown) => {
  if (!(error instanceof FirebaseError)) {
    return "新規登録に失敗しました。時間をおいてもう一度お試しください。";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "このメールアドレスはすでに登録されています。";
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/weak-password":
      return "パスワードは6文字以上で入力してください。";
    default:
      return "新規登録に失敗しました。入力内容を確認してください。";
  }
};

export default function ManagerSignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await sendEmailVerification(userCredential.user);
      await signOut(auth);

      setEmail("");
      setPassword("");
      router.push("/login/manager?verificationEmailSent=1");
    } catch (signupError) {
      setError(getSignupErrorMessage(signupError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-950">
      <section className="w-full max-w-[460px] rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <Link
          href="/login/manager"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
        >
          <ArrowLeftIcon className="size-4" />
          管理者ログインへ
        </Link>

        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-950">
          <BuildingIcon className="size-9" />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">アカウントを新規作成</h1>
          <p className="mt-3 text-sm text-slate-500">
            確認メールを受け取れるアドレスで登録
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
                minLength={6}
                autoComplete="new-password"
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
              href="/login/manager"
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-950"
            >
              ログインへ
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 min-w-28 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? "送信中" : "登録"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
