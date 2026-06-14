import Link from "next/link";
import { BadgeIcon, BuildingIcon } from "@/components/icons";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-950">
      <section className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white shadow-sm">
          Chess
        </div>

        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            Chess
          </p>
          <h1 className="mt-3 text-3xl font-bold">利用者を選択</h1>
          <p className="mt-3 text-base text-slate-500">
            Chessを利用する立場を選択してください
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/login/employee"
            className="group flex flex-col items-center rounded-xl border border-slate-200 p-5 text-center transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-green-500 text-white">
              <BadgeIcon className="size-6" />
            </span>
            <span className="mt-5 block text-lg font-bold">従業員</span>
            <span className="mt-1 block text-sm text-slate-500">
              シフトを確認・提出します
            </span>
          </Link>
          <Link
            href="/login/manager"
            className="group flex flex-col items-center rounded-xl border border-slate-200 p-5 text-center transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white">
              <BuildingIcon className="size-6" />
            </span>
            <span className="mt-5 block text-lg font-bold">管理者</span>
            <span className="mt-1 block text-sm text-slate-500">
              組織とシフトを管理します
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
