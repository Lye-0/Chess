import Link from "next/link";

export default function EmployeePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="w-full max-w-[420px] border border-neutral-900 px-8 py-10">
        <div className="mx-auto mb-10 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <h1 className="mb-6 text-xl font-semibold">従業員用画面</h1>

        <div className="space-y-4 text-sm">
          <p>従業員ログイン後に表示する仮画面です。</p>
          <p className="border border-neutral-900 px-3 py-2">
            シフト確認や希望提出の画面は後続で実装します。
          </p>
        </div>

        <div className="mt-8 flex justify-end">
          <Link
            href="/login/employee"
            className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
          >
            従業員ログインへ
          </Link>
        </div>
      </section>
    </main>
  );
}
