import Link from "next/link";
import { BadgeIcon, CalendarIcon } from "@/components/icons";

export default function EmployeePage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-950">
      <section className="mx-auto max-w-5xl">
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                <BadgeIcon className="size-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">従業員用画面</h1>
                <p className="mt-2 text-slate-500">
                  従業員ログイン後に表示する仮画面です
                </p>
              </div>
            </div>
            <Link
              href="/login/employee"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold shadow-sm transition hover:bg-slate-50"
            >
              従業員ログインへ
            </Link>
          </div>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-blue-600 text-white">
            <CalendarIcon className="size-8" />
          </div>
          <h2 className="text-2xl font-bold">シフト確認</h2>
          <p className="mt-3 text-slate-500">
            シフト確認や希望提出の画面は後続で実装します。
          </p>
          <button
            type="button"
            className="mt-8 h-12 w-full rounded-xl border border-slate-200 bg-white text-base font-bold shadow-sm transition hover:bg-slate-50"
          >
            開く
          </button>
        </article>
      </section>
    </main>
  );
}
