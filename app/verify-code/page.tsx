import Link from "next/link";
import { ArrowLeftIcon } from "../_components/shift-ui";

export default function VerifyCodePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] p-4 text-[#030213]">
      <section className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-sm">
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold transition hover:bg-[#e9ebef]"
        >
          <ArrowLeftIcon />
          戻る
        </Link>

        <header className="mt-5">
          <h1 className="text-xl font-semibold">確認コードを入力</h1>
          <p className="mt-1 text-sm leading-relaxed text-[#717182]">
            入力されたメールアドレスに確認コードを送信しました。届いたコードを入力してください。
          </p>
        </header>

        <form className="mt-8 space-y-4">
          <div>
            <label htmlFor="verify-code" className="block text-sm font-semibold">
              確認コード（6桁）
            </label>
            <input
              id="verify-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-center text-lg tracking-[0.25em] shadow-sm outline-none placeholder:text-[#717182]"
            />
          </div>

          <button
            type="button"
            className="h-10 w-full rounded-md bg-[#8e8d95] text-sm font-semibold text-white"
          >
            認証して開始
          </button>

          <button
            type="button"
            className="h-10 w-full rounded-md text-sm font-semibold text-[#3d4150] transition hover:bg-[#e9ebef]"
          >
            コードを再送信
          </button>
        </form>
      </section>
    </main>
  );
}
