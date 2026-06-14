"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const managedOrganizations = [
  { id: "sample-organization-1", name: "管理している組織名 1" },
  { id: "sample-organization-2", name: "管理している組織名 2" },
  { id: "sample-organization-3", name: "管理している組織名 3" },
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

    router.push(`/manager?organizationId=${selectedOrganizationId}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="w-full max-w-[360px] border border-neutral-900 px-8 py-10">
        <div className="mx-auto mb-10 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <h1 className="mb-6 text-xl font-semibold">組織名を選択</h1>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <fieldset className="border border-neutral-900">
            <legend className="sr-only">管理している組織名</legend>
            <div className="divide-y divide-neutral-900">
              {managedOrganizations.map((organization) => (
                <label
                  key={organization.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-neutral-100"
                >
                  <input
                    type="radio"
                    name="organization"
                    value={organization.id}
                    checked={selectedOrganizationId === organization.id}
                    onChange={(event) =>
                      setSelectedOrganizationId(event.target.value)
                    }
                    className="size-4 accent-neutral-950"
                  />
                  <span>{organization.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-between gap-4 pt-1">
            <Link
              href="/manager/organizations/new"
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
            >
              管理する勤務先を追加
            </Link>
            <button
              type="submit"
              className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
            >
              次へ
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
