"use client";

import { Suspense } from "react";
import {
  BackHeader,
  Card,
  ChevronDownIcon,
  DownloadIcon,
} from "../../_components/shift-ui";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";

function AdminTimesheetContent() {
  const {
    organizationQuery,
    organization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();

  if (isCheckingOrganization || !organization) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] text-[#717182]">
        <p>管理できる組織を確認しています</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader
        backHref={`/admin${organizationQuery}`}
        right={
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
          >
            <DownloadIcon />
            CSVエクスポート
          </button>
        }
      />

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <p className="text-sm text-[#717182]">総希望時間</p>
            <p className="mt-4 text-3xl font-semibold">0h</p>
            <p className="mt-4 text-sm text-[#475569]">合計</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">平均希望時間</p>
            <p className="mt-4 text-3xl font-semibold">0h</p>
            <p className="mt-4 text-sm text-[#475569]">従業員1人あたり</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">従業員数</p>
            <p className="mt-4 text-3xl font-semibold">0人</p>
            <p className="mt-4 text-sm text-[#475569]">この組織の登録人数</p>
          </Card>
        </section>

        <Card className="mt-6 min-h-[196px] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold">稼働時間管理</h1>
              <p className="mt-1 text-sm text-[#717182]">0従業員別希望時間</p>
            </div>

            <button
              type="button"
              className="inline-flex h-10 w-full items-center justify-between rounded-md border border-black/10 bg-white px-4 text-sm font-semibold shadow-sm sm:w-[182px]"
            >
              2026年6月
              <ChevronDownIcon className="h-4 w-4 text-[#717182]" />
            </button>
          </div>

          <div className="flex min-h-24 items-center justify-center text-center text-[#717182]">
            <p>従業員が登録されていません</p>
          </div>
        </Card>
      </div>
    </main>
  );
}

export default function AdminTimesheetPage() {
  return (
    <Suspense>
      <AdminTimesheetContent />
    </Suspense>
  );
}
