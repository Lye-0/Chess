"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BuildingIcon, PlusIcon } from "@/components/icons";

const managedOrganizations = [
  { id: "nagoya-engineering", name: "名古屋エンジニアリング", department: "開発部" },
  { id: "sample-organization-1", name: "株式会社東京テック", department: "総務部" },
  { id: "sample-organization-2", name: "大阪商事株式会社", department: "営業部" },
];

export default function SelectOrganizationPage() {
  const router = useRouter();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    managedOrganizations[0]?.id ?? "",
  );
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedOrganizationId) {
      setError("管理する組織を選択してください。");
      return;
    }

    router.push(`/admin?organizationId=${selectedOrganizationId}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-950">
      <section className="w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-950">
          <BuildingIcon className="size-9" />
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold">組織を選択</h1>
          <p className="mt-3 text-base text-slate-500">
            管理する組織を選択してください
          </p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <fieldset>
            <legend className="sr-only">管理している組織名</legend>
            <div className="space-y-4">
              {managedOrganizations.map((organization) => (
                <label
                  key={organization.id}
                  className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <input
                    type="radio"
                    name="organization"
                    value={organization.id}
                    checked={selectedOrganizationId === organization.id}
                    onChange={(event) =>
                      setSelectedOrganizationId(event.target.value)
                    }
                    className="size-5 accent-slate-950"
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-bold">
                      {organization.name}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {organization.department}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-4 pt-1">
            <Link
              href="/manager/organizations/new"
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-base font-bold shadow-sm transition hover:bg-slate-50"
            >
              <PlusIcon className="size-5" />
              組織を追加
            </Link>
            <button
              type="submit"
              className="h-12 rounded-xl bg-slate-950 text-base font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-300"
            >
              次へ
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
