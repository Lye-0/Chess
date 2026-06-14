import Link from "next/link";

const employee = {
  name: "田中健一",
  organization: "名古屋エンジニアリング",
  department: "開発部",
  role: "正社員",
};

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4M16 2v4M3 10h18" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h12m0 0-3-3m3 3-3 3" />
    </svg>
  );
}

export default function EmployeePage() {
  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <header className="border-b border-black/10 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1248px] items-center justify-between px-4 py-5 sm:px-6 lg:px-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ececf0] text-[#030213]">
              <UserIcon />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold leading-tight">{employee.name}</h1>
              <p className="truncate text-sm text-[#717182]">
                {employee.organization} - {employee.department}（{employee.role}）
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
          >
            <LogoutIcon />
            ログアウト
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="grid gap-6 lg:grid-cols-2">
          <Link
            href="/employee/shift-request"
            className="h-[226px] rounded-xl border border-black/10 bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#ececf0] text-[#030213]">
              <CalendarIcon />
            </div>
            <h2 className="mt-2 text-xl font-semibold">希望シフト入力</h2>
            <p className="mt-1 text-sm text-[#717182]">シフト希望を入力してください</p>
            <div className="mt-5 rounded-md bg-[#030213] px-4 py-2.5 text-center text-sm font-semibold text-white">
              希望シフトを入力
            </div>
          </Link>

          <section className="h-[226px] rounded-xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#ececf0] text-[#030213]">
              <ClockIcon />
            </div>
            <h2 className="mt-2 text-xl font-semibold">直近のシフト</h2>
            <p className="mt-1 text-sm text-[#717182]">今後7日間の確定シフト</p>
            <div className="flex min-h-24 items-center justify-center pt-4">
              <p className="text-sm text-[#717182]">直近のシフトはありません</p>
            </div>
          </section>
        </section>

        <section className="mt-6 h-[262px] rounded-xl border border-black/10 bg-white shadow-sm">
          <div className="p-6">
            <h2 className="text-xl font-semibold">シフト希望一覧</h2>
            <p className="mt-1 text-sm text-[#717182]">2026年6月 — 提出済みの希望シフト</p>
          </div>
          <div className="flex min-h-40 flex-col items-center justify-center px-6 pb-6 text-center text-[#717182]">
            <p>まだシフト希望を提出していません</p>
            <p className="mt-1 text-sm">「希望シフト入力」からシフトを提出してください</p>
          </div>
        </section>
      </div>
    </main>
  );
}
