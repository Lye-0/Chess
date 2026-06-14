import Link from "next/link";

type ManagerPageProps = {
  searchParams: Promise<{
    organizationId?: string;
  }>;
};

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const { organizationId } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-950">
      <section className="w-full max-w-[420px] border border-neutral-900 px-8 py-10">
        <div className="mx-auto mb-10 flex size-16 items-center justify-center rounded-full border border-neutral-900 text-lg font-semibold">
          Chess
        </div>

        <h1 className="mb-6 text-xl font-semibold">管理者用画面</h1>

        <div className="space-y-4 text-sm">
          <p>選択した組織の管理画面です。</p>
          <p className="border border-neutral-900 px-3 py-2">
            組織ID: {organizationId ?? "未選択"}
          </p>
        </div>

        <div className="mt-8 flex justify-between gap-4">
          <Link
            href="/manager/select-organization"
            className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
          >
            組織選択へ戻る
          </Link>
          <Link
            href="/login/manager"
            className="border border-neutral-900 px-3 py-1 text-sm transition-colors hover:bg-neutral-100"
          >
            ログインへ
          </Link>
        </div>
      </section>
    </main>
  );
}
