import {
  BackHeader,
  Card,
  ChevronDownIcon,
  UserPlusIcon,
} from "../../_components/shift-ui";

export default function AdminEmployeeRegistrationPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader />

      <div className="mx-auto max-w-[864px] px-4 py-8 sm:px-6 lg:px-0">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">従業員登録</h1>
          <p className="mt-1 text-sm text-[#717182]">選択中の組織に従業員を追加します</p>

          <form className="mt-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="employee-name" className="block text-sm font-semibold">
                  氏名
                </label>
                <input
                  id="employee-name"
                  placeholder="例：田中 太郎"
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none placeholder:text-[#717182]"
                />
              </div>

              <div>
                <label htmlFor="employee-email" className="block text-sm font-semibold">
                  メールアドレス
                </label>
                <input
                  id="employee-email"
                  type="email"
                  placeholder="例：tanaka@example.com"
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none placeholder:text-[#717182]"
                />
              </div>
            </div>

            <div className="mt-5 max-w-xs">
              <label htmlFor="employment-type" className="block text-sm font-semibold">
                雇用形態
              </label>
              <div className="relative mt-2">
                <select
                  id="employment-type"
                  defaultValue="正社員"
                  className="h-10 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-10 text-sm font-semibold shadow-sm outline-none"
                >
                  <option>正社員</option>
                  <option>アルバイト</option>
                  <option>パート</option>
                  <option>契約社員</option>
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
              </div>
            </div>

            <button
              type="button"
              className="mt-4 inline-flex h-10 items-center gap-3 rounded-md bg-[#030213] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#171624]"
            >
              <UserPlusIcon className="h-4 w-4" />
              登録
            </button>
          </form>
        </Card>

        <Card className="mt-6 min-h-[202px] p-6">
          <h2 className="text-xl font-semibold">登録済み従業員（0名）</h2>
          <p className="mt-1 text-sm text-[#717182]">の従業員一覧</p>

          <div className="flex min-h-28 items-center justify-center text-center text-[#717182]">
            <p>まだ従業員が登録されていません</p>
          </div>
        </Card>
      </div>
    </main>
  );
}
