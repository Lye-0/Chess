"use client";

import Link from "next/link";
import { useState } from "react";
import {
  adminOrganizations,
  BuildingIcon,
  IconBadge,
  PlusIcon,
} from "../_components/shift-ui";

export default function OrganizationSelectPage() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] p-4 text-[#030213]">
      <section className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <IconBadge className="h-16 w-16 rounded-full bg-[#ececf0]">
            <BuildingIcon className="h-9 w-9" />
          </IconBadge>
          <h1 className="mt-6 text-xl font-semibold">組織を選択</h1>
          <p className="mt-2 text-sm text-[#717182]">管理する組織を選択してください</p>
        </div>

        <div className="mt-8 space-y-3">
          {adminOrganizations.map((organization, index) => (
            <button
              key={`${organization.company}-${organization.department}`}
              type="button"
              onClick={() => setSelected(index)}
              className={[
                "flex h-14 w-full items-center gap-3 rounded-lg border px-4 text-left text-sm transition",
                selected === index
                  ? "border-[#030213] bg-[#f7f8fb]"
                  : "border-black/10 bg-white hover:bg-[#f7f8fb]",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-4 w-4 shrink-0 rounded-full border",
                  selected === index ? "border-[5px] border-[#030213]" : "border-[#030213]",
                ].join(" ")}
              />
              <span className="min-w-0">
                <span className="font-semibold">{organization.company}</span>
                <span className="ml-2 text-[#717182]">{organization.department}</span>
              </span>
            </button>
          ))}

          <button
            type="button"
            className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
          >
            <PlusIcon />
            組織を追加
          </button>

          {selected === null ? (
            <button
              type="button"
              className="h-10 w-full rounded-md bg-[#8e8d95] text-sm font-semibold text-white"
            >
              次へ
            </button>
          ) : (
            <Link
              href="/admin"
              className="flex h-10 w-full items-center justify-center rounded-md bg-[#030213] text-sm font-semibold text-white transition hover:bg-[#171624]"
            >
              次へ
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
