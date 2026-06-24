"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OrganizationSelectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/manager/select-organization");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] text-[#717182]">
      <p>組織選択画面へ移動しています</p>
    </main>
  );
}
