import Link from "next/link";
import {
  ArrowLeftIcon,
  BuildingIcon,
  CalendarIcon,
  LogOutIcon,
  UsersIcon,
} from "@/components/icons";

type ManagerPageProps = {
  searchParams: Promise<{
    organizationId?: string;
  }>;
};

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const { organizationId } = await searchParams;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link
            href="/manager/select-organization"
            className="inline-flex items-center gap-2 text-sm font-bold transition hover:text-blue-600"
          >
            <ArrowLeftIcon className="size-5" />
            組織選択
          </Link>

          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <BuildingIcon className="size-7" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold sm:text-3xl">
                管理者ホーム
              </h1>
              <p className="truncate text-sm text-slate-500">
                {organizationId ?? "組織未選択"}
              </p>
            </div>
          </div>

          <Link
            href="/login/manager"
            className="inline-flex items-center gap-2 text-sm font-bold transition hover:text-blue-600"
          >
            <LogOutIcon className="size-5" />
            ログアウト
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold">管理者用画面</h2>
          <p className="mt-4 text-lg text-slate-600">
            シフト管理や従業員情報の管理を行うことができます
          </p>
        </div>

        <div className="grid gap-6">
          <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-blue-600 text-white">
              <CalendarIcon className="size-8" />
            </div>
            <h3 className="text-2xl font-bold">シフト管理</h3>
            <p className="mt-3 text-slate-500">
              シフトの作成・編集・確定を行います
            </p>
            <button
              type="button"
              className="mt-8 h-12 w-full rounded-xl border border-slate-200 bg-white text-base font-bold shadow-sm transition hover:bg-slate-50"
            >
              開く
            </button>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-green-500 text-white">
              <UsersIcon className="size-8" />
            </div>
            <h3 className="text-2xl font-bold">従業員管理</h3>
            <p className="mt-3 text-slate-500">
              従業員情報の確認・編集を行います
            </p>
            <button
              type="button"
              className="mt-8 h-12 w-full rounded-xl border border-slate-200 bg-white text-base font-bold shadow-sm transition hover:bg-slate-50"
            >
              開く
            </button>
          </article>
        </div>
      </section>
    </main>
  );
}
