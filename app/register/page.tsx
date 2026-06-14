import Link from "next/link";
import { ArrowLeftIcon, TextInput } from "../_components/shift-ui";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] p-4 text-[#030213]">
      <section className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-sm">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold transition hover:bg-[#e9ebef]"
        >
          <ArrowLeftIcon />
          戻る
        </Link>

        <header className="mt-5">
          <h1 className="text-xl font-semibold">管理者アカウント新規登録</h1>
          <p className="mt-1 text-sm text-[#717182]">メールアドレスとパスワードを入力してください</p>
        </header>

        <form className="mt-8 space-y-5">
          <TextInput
            id="register-email"
            label="メールアドレス"
            placeholder="example@company.com"
            type="email"
          />
          <TextInput id="register-password" label="パスワード" placeholder="パスワードを入力" type="password" />
          <TextInput
            id="register-password-confirm"
            label="パスワード（確認）"
            placeholder="パスワードを再入力"
            type="password"
          />

          <Link
            href="/verify-code"
            className="flex h-10 w-full items-center justify-center rounded-md bg-[#030213] text-sm font-semibold text-white transition hover:bg-[#171624]"
          >
            確認コードを送信
          </Link>
        </form>
      </section>
    </main>
  );
}
