"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeftIcon, BuildingIcon, PlusIcon } from "@/components/icons";
import { auth } from "@/lib/firebase";
import { createManagerOrganization } from "@/lib/managerOrganizations";

export default function NewOrganizationPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login/manager");
        return;
      }

      setCurrentUser(user);
      setIsCheckingAuth(false);
    });
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!organizationName.trim()) {
      setError("組織名を入力してください。");
      return;
    }

    if (!currentUser) {
      setError("管理者ログインを確認できませんでした。もう一度ログインしてください。");
      return;
    }

    try {
      setIsSubmitting(true);
      const organization = await createManagerOrganization(
        currentUser.uid,
        currentUser.email,
        {
          name: organizationName,
          department,
        },
      );
      router.push(`/admin?organizationId=${encodeURIComponent(organization.id)}`);
    } catch (createError) {
      console.error(createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "組織の登録に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
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
            この管理者アカウントで管理する組織を作成します
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

          <label className="flex flex-col gap-2 text-sm font-semibold">
            部署・拠点名
            <span className="flex h-12 items-center rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <input
                type="text"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="例: 開発部"
                className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
              />
            </span>
          </label>

          <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
            組織IDは自動発行されます。従業員ログインに使う組織IDは、作成後の管理者ホームに表示されます。
          </p>

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
              disabled={isCheckingAuth || isSubmitting}
              className="inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <PlusIcon className="size-4" />
              {isSubmitting ? "登録中" : "登録"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
