"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { deleteManagerOrganization } from "@/lib/managerOrganizations";
import {
  defaultRecommendationSettings,
  subscribeRecommendationSettings,
  updateRecommendationSettings,
  type RecommendationSettings,
} from "@/lib/recommendationSettings";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import { BackHeader, Card } from "../../_components/shift-ui";
import { WeightSelector } from "../shift-management/components/weight-selector";

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="#ff003d"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 4.2 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-8 w-14 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-[#1763ff]" : "bg-[#cbd5e1]",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition",
          checked ? "left-7" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}

function AdminSettingsContent() {
  const router = useRouter();
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [settings, setSettings] = useState<RecommendationSettings>(
    defaultRecommendationSettings,
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsErrorMessage, setSettingsErrorMessage] = useState("");
  const [isDeletingOrganization, setIsDeletingOrganization] = useState(false);
  const [isDeleteOrganizationModalOpen, setIsDeleteOrganizationModalOpen] =
    useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  useEffect(() => {
    if (!currentOrganization) return;

    const unsubscribe = subscribeRecommendationSettings(
      (nextSettings) => {
        setSettings(nextSettings);
        setIsLoadingSettings(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingSettings(false);
        setSettingsErrorMessage("おすすめ設定の読み込みに失敗しました。");
      },
      organizationId,
    );

    return () => unsubscribe();
  }, [currentOrganization, organizationId]);

  async function saveSettings(nextSettings: RecommendationSettings) {
    const previousSettings = settings;

    setSettings(nextSettings);
    setIsSavingSettings(true);
    setSettingsMessage("");
    setSettingsErrorMessage("");

    try {
      await updateRecommendationSettings(nextSettings, organizationId);
      setSettingsMessage("おすすめ設定を保存しました。");
    } catch (error) {
      console.error(error);
      setSettings(previousSettings);
      setSettingsErrorMessage("おすすめ設定の保存に失敗しました。");
    } finally {
      setIsSavingSettings(false);
    }
  }

  function openDeleteOrganizationModal() {
    if (!currentOrganization) return;
    setIsDeleteOrganizationModalOpen(true);
    setDeleteErrorMessage("");
  }

  function closeDeleteOrganizationModal() {
    if (isDeletingOrganization) return;
    setIsDeleteOrganizationModalOpen(false);
  }

  async function confirmDeleteOrganization() {
    if (!currentOrganization) return;

    const user = auth.currentUser;
    if (!user) {
      setDeleteErrorMessage("管理者ログインが必要です。");
      return;
    }

    try {
      setIsDeletingOrganization(true);
      setDeleteErrorMessage("");
      await deleteManagerOrganization(user.uid, organizationId);
      setIsDeleteOrganizationModalOpen(false);
      router.push("/manager/select-organization");
    } catch (error) {
      console.error(error);
      setDeleteErrorMessage(
        error instanceof Error
          ? error.message
          : "組織の削除に失敗しました。",
      );
    } finally {
      setIsDeletingOrganization(false);
    }
  }

  if (isCheckingOrganization || !currentOrganization) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] text-[#717182]">
        <p>管理できる組織を確認しています</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader backHref={`/admin${organizationQuery}`} />

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <header>
          <h1 className="text-2xl font-semibold">設定</h1>
          <p className="mt-2 text-sm text-[#717182]">
            {currentOrganization.name}
            {currentOrganization.department
              ? ` - ${currentOrganization.department}`
              : ""}
          </p>
        </header>

        <div className="mt-7 grid gap-5">
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">おすすめ計算設定</h2>
                <p className="mt-1 text-sm text-[#717182]">
                  シフト承認候補を選ぶ計算ルール
                </p>
              </div>
              {isSavingSettings && (
                <span className="text-sm font-semibold text-[#1763ff]">
                  保存中...
                </span>
              )}
            </div>

            {settingsMessage && (
              <p className="mt-4 rounded-md bg-[#ecfdf3] px-4 py-3 text-sm font-semibold text-[#15803d]">
                {settingsMessage}
              </p>
            )}
            {settingsErrorMessage && (
              <p className="mt-4 rounded-md bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">
                {settingsErrorMessage}
              </p>
            )}

            <div className="mt-5 rounded-lg border border-black/10 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">公平性スコアを使う</p>
                  <p className="mt-1 text-sm text-[#717182]">
                    {settings.fairnessEnabled
                      ? "公平性を最優先にします"
                      : "相性スコアと業務スキルで計算します"}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings.fairnessEnabled}
                  disabled={isLoadingSettings || isSavingSettings}
                  onChange={(checked) =>
                    saveSettings({ ...settings, fairnessEnabled: checked })
                  }
                />
              </div>
            </div>

            <WeightSelector
              selectedWeightId={settings.weightId}
              onSelect={(weightId) => saveSettings({ ...settings, weightId })}
            />
          </Card>

          <Card className="border-[#fecdd3] p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#be123c]">
                  危険な操作
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[#717182]">
                  組織と関連データを削除します
                </p>
              </div>
              <button
                type="button"
                disabled={isDeletingOrganization}
                onClick={openDeleteOrganizationModal}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#ffccd6] bg-white px-4 text-sm font-semibold text-[#ff003d] transition hover:bg-[#ffe8ee] disabled:cursor-not-allowed disabled:border-[#f3c7d0] disabled:text-[#c56c7f]"
              >
                <TrashIcon />
                {isDeletingOrganization ? "組織を削除中..." : "組織を削除"}
              </button>
            </div>
          </Card>
        </div>
      </div>

      {isDeleteOrganizationModalOpen && currentOrganization && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
          <section className="w-full max-w-[640px] rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <WarningIcon />
                <h2 className="text-xl font-semibold">組織の削除</h2>
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={closeDeleteOrganizationModal}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
              >
                <XIcon />
              </button>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-[#717182]">
              この組織を削除します。この操作は元に戻せません。従業員・シフト枠・シフト希望・相性スコアも同時に削除されます。
            </p>

            {deleteErrorMessage && (
              <p className="mt-4 rounded-md bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">
                {deleteErrorMessage}
              </p>
            )}

            <div className="mt-6 rounded-lg bg-[#f7f8fb] px-5 py-5">
              <p className="font-semibold">{currentOrganization.name}</p>
              {currentOrganization.department && (
                <p className="mt-2 text-sm text-[#475569]">
                  {currentOrganization.department}
                </p>
              )}
              <p className="mt-2 font-mono text-sm font-semibold text-[#1d4ed8]">
                {organizationId}
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeDeleteOrganizationModal}
                disabled={isDeletingOrganization}
                className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDeleteOrganization}
                disabled={isDeletingOrganization}
                className="inline-flex h-10 items-center justify-center gap-3 rounded-md bg-[#db1741] text-sm font-semibold text-white transition hover:bg-[#c51239] disabled:cursor-not-allowed disabled:bg-[#c56c7f]"
              >
                <TrashIcon />
                {isDeletingOrganization ? "削除中..." : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense>
      <AdminSettingsContent />
    </Suspense>
  );
}
