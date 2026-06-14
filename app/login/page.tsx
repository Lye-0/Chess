import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="flex min-h-[360px] w-full max-w-[280px] flex-col items-center justify-center border border-neutral-900 px-8 py-10">
        <div className="mb-16 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <div className="flex w-full flex-col gap-5">
          <Link
            href="/login/employee"
            className="flex h-10 items-center justify-center border border-neutral-900 text-base font-medium transition-colors hover:bg-neutral-100"
          >
            従業員
          </Link>
          <Link
            href="/login/manager"
            className="flex h-10 items-center justify-center border border-neutral-900 text-base font-medium transition-colors hover:bg-neutral-100"
          >
            管理者
          </Link>
        </div>
      </section>
    </main>
  );
}
