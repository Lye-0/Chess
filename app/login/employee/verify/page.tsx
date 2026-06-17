"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EmployeeVerifyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login/employee");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10 text-slate-950">
      <p className="text-sm font-semibold text-slate-500">
        従業員確認画面へ移動しています
      </p>
    </main>
  );
}
