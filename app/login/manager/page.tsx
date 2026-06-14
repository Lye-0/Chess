"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ManagerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/manager/select-organization");
    } catch {
      setError("メールアドレスまたはパスワードが正しくありません。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="w-full max-w-[360px] border border-neutral-900 px-8 py-10">
        <div className="mx-auto mb-10 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <h1 className="mb-6 text-xl font-semibold">アカウントにログイン</h1>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
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

          <label className="flex flex-col gap-2 text-sm font-medium">
            パスワード
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="h-10 border border-neutral-900 px-3 outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-between gap-4 pt-1">
            <Link
              href="/signup/manager"
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
            >
              新規登録
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "確認中" : "次へ"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
