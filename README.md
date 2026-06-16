## 主な機能
管理者
- シフトの追加
- シフトの完了チェック
- シフトの削除
- シフト表の確認
- 従業員労働時間の確認
- 従業員の削除
- 従業員の追加
- 組織の追加

従業員
- シフト希望の送信
- シフトの確認

## 使い方
管理者　
新規登録
1. 管理者ボタンを選択
2. 新規登録を選択
3. メールアドレスとパスワードを登録
4. 確認メールを登録したメールアドレスにて確認
5. メールのリンクをクリック
6. 完全な検証をクリック
7. 管理者ログイン画面にて登録したメールアドレスとパスワードを入力
8. 管理する組織を追加する。
9. 組織の名前を入力して登録
10. 登録した組織を選択
11. 自動的に管理者画面が開く

シフト管理
1. シフト管理を開く
2. シフト枠を追加を選択
3. 日付、開始時刻、終了時刻、募集人数を入力して追加
4. 従業員がシフト希望を送信すると承認待ちに表示されるようになるので、承認を選択
5. 承認済みに表示される
ex1. 鉛筆マーク選択でシフトを編集できる。(承認済みの場合は承認した人数以上に募集人数を変更可能)
ex2. ゴミ箱を選択でシフトを消去できる。（承認済みのシフトがある場合変更可能）

従業員シフト表
1. 従業員シフト表を選択
2. 各従業員のシフトを確認できる

従業員登録を選択
1. 従業員の名前、メールアドレスと雇用形態を入力し、登録
2. ゴミ箱で従業員の削除ができる。

稼働時間
1. 従業員の稼働時間を確認出来る


従業員
1. 組織ＩＤ、メールアドレスを入力（組織ＩＤは管理者画面から確認できる。メールアドレスは管理者が登録したもののみ有効）
2. 従業員画面が開く
3. 従業員画面で直近のシフト、シフト希望一覧が確認できる。

希望シフト入力
1. 希望シフト入力を選択
2. 入りたいシフトの日を選択（黒文字の日付のみ選択可能）
3. シフト枠を選択
4. 希望を追加を選択
5. シフト希望を送信を選択(この状態では削除可能)
6. 送信するを選択




This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
