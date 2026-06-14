import {
  BackHeader,
  Card,
  SearchIcon,
} from "../../_components/shift-ui";

export default function AdminEmployeeListPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader />

      <div className="mx-auto grid max-w-[1248px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-0">
        <Card className="min-h-[252px] p-6">
          <h1 className="text-xl font-semibold">従業員シフト表</h1>
          <p className="mt-1 text-sm text-[#717182]">（0名）</p>

          <div className="relative mt-5">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
            <input
              type="search"
              placeholder="従業員名で検索..."
              className="h-10 w-full rounded-md border border-black/10 bg-white pl-10 pr-3 text-sm shadow-sm outline-none placeholder:text-[#717182]"
            />
          </div>

          <div className="flex min-h-32 items-center justify-center text-center text-[#717182]">
            <p>従業員が見つかりません</p>
          </div>
        </Card>

        <Card className="min-h-[252px] p-6">
          <h2 className="text-xl font-semibold">シフト詳細</h2>
          <p className="mt-1 text-sm text-[#717182]">左側から従業員を選択してください</p>

          <div className="flex min-h-32 items-center justify-center text-center text-[#717182]">
            <p>従業員を選択してください</p>
          </div>
        </Card>
      </div>
    </main>
  );
}
