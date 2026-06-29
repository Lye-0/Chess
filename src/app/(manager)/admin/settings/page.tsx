"use client";

import type { FormEvent, ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { deleteManagerOrganization } from "@/lib/managerOrganizations";
import {
  defaultPayrollSettings,
  employmentTypes,
  subscribePayrollSettings,
  updatePayrollSettings,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  defaultRecommendationSettings,
  subscribeRecommendationSettings,
  updateRecommendationSettings,
  type AutoApprovalMode,
  type AutoApprovalPeriodTarget,
  type AutoApprovalRequestScope,
  type AutoApprovalTiming,
  type AutoApprovalWindow,
  type RecommendationSettings,
} from "@/lib/recommendationSettings";
import {
  defaultShiftRequestSettings,
  subscribeShiftRequestSettings,
  updateShiftRequestSettings,
  type ShiftRequestSettings,
} from "@/lib/shiftRequestSettings";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import { BackHeader, Card } from "../../_components/shift-ui";
import { WeightSelector } from "../shift-management/components/weight-selector";

const autoApprovalModeOptions: Array<{ id: AutoApprovalMode; label: string }> = [
  { id: "manual", label: "手動" },
  { id: "rollingWindow", label: "期限到達で自動承認" },
  { id: "periodic", label: "期間ごとに自動承認" },
];

const autoApprovalWindowOptions: Array<{ id: AutoApprovalWindow; label: string }> = [
  { id: "oneDay", label: "1日先まで" },
  { id: "threeDays", label: "3日先まで" },
  { id: "oneWeek", label: "1週間先まで" },
  { id: "twoWeeks", label: "2週間先まで" },
  { id: "oneMonth", label: "1か月先まで" },
  { id: "twoMonths", label: "2か月先まで" },
  { id: "threeMonths", label: "3か月先まで" },
];

const autoApprovalPeriodTargetOptions: Array<{
  id: AutoApprovalPeriodTarget;
  label: string;
}> = [
  { id: "nextWeek", label: "翌週分" },
  { id: "secondNextWeek", label: "翌々週分" },
  { id: "nextMonth", label: "翌月分" },
  { id: "secondNextMonth", label: "翌々月分" },
];

const autoApprovalTimingOptions: Array<{ id: AutoApprovalTiming; label: string }> = [
  { id: "oneDay", label: "1日前" },
  { id: "threeDays", label: "3日前" },
  { id: "oneWeek", label: "1週間前" },
  { id: "twoWeeks", label: "2週間前" },
  { id: "fifteenDays", label: "15日前" },
  { id: "oneMonth", label: "1か月前" },
  { id: "twoMonths", label: "2か月前" },
  { id: "threeMonths", label: "3か月前" },
];

const autoApprovalRequestScopeOptions: Array<{
  id: AutoApprovalRequestScope;
  label: string;
}> = [
  { id: "managerSlotsOnly", label: "管理者が作成したシフトのみ" },
  { id: "includeEmployeeGenerated", label: "自主希望も含める" },
];
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

function SettingsAccordion({
  title,
  description,
  status,
  children,
  defaultOpen = false,
  danger = false,
}: {
  title: string;
  description: string;
  status?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  danger?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={danger ? "border-[#fecdd3]" : ""}>
      <details
        className="group"
        open={isOpen}
        onToggle={(event) => setIsOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 marker:hidden sm:px-6 sm:py-5">
          <div>
            <h2
              className={[
                "text-lg font-semibold",
                danger ? "text-[#be123c]" : "",
              ].join(" ")}
            >
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#717182]">
              {description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {status}
            <span className="mt-1 grid h-8 w-8 place-items-center rounded-md border border-black/10 bg-white text-[#596074] transition group-open:rotate-180">
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </div>
        </summary>
        <div className="border-t border-black/10 px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
          {children}
        </div>
      </details>
    </Card>
  );
}
function toPayrollForm(settings: PayrollSettings) {
  return {
    hourlyRates: employmentTypes.reduce<Record<string, string>>((rates, type) => {
      rates[type] = String(settings.hourlyRates[type] ?? 0);
      return rates;
    }, {}),
    nightStartTime: settings.nightStartTime,
    nightEndTime: settings.nightEndTime,
    nightMultiplier: String(settings.nightMultiplier),
  };
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
  const [payrollForm, setPayrollForm] = useState(() =>
    toPayrollForm(defaultPayrollSettings),
  );
  const [shiftRequestSettings, setShiftRequestSettings] = useState<ShiftRequestSettings>(
    defaultShiftRequestSettings,
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isLoadingPayroll, setIsLoadingPayroll] = useState(true);
  const [isLoadingShiftRequestSettings, setIsLoadingShiftRequestSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingPayroll, setIsSavingPayroll] = useState(false);
  const [isSavingShiftRequestSettings, setIsSavingShiftRequestSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsErrorMessage, setSettingsErrorMessage] = useState("");
  const [payrollMessage, setPayrollMessage] = useState("");
  const [payrollErrorMessage, setPayrollErrorMessage] = useState("");
  const [shiftRequestSettingsMessage, setShiftRequestSettingsMessage] = useState("");
  const [shiftRequestSettingsErrorMessage, setShiftRequestSettingsErrorMessage] = useState("");
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

  useEffect(() => {
    if (!currentOrganization) return;

    const unsubscribe = subscribePayrollSettings(
      (nextPayrollSettings) => {
        setPayrollForm(toPayrollForm(nextPayrollSettings));
        setIsLoadingPayroll(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingPayroll(false);
        setPayrollErrorMessage("給与設定の読み込みに失敗しました。");
      },
      organizationId,
    );

    return () => unsubscribe();
  }, [currentOrganization, organizationId]);
  useEffect(() => {
    if (!currentOrganization) return;

    const unsubscribe = subscribeShiftRequestSettings(
      (nextSettings) => {
        setShiftRequestSettings(nextSettings);
        setIsLoadingShiftRequestSettings(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingShiftRequestSettings(false);
        setShiftRequestSettingsErrorMessage("シフト希望設定の読み込みに失敗しました。");
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

  async function saveShiftRequestSettings(nextSettings: ShiftRequestSettings) {
    const previousSettings = shiftRequestSettings;

    setShiftRequestSettings(nextSettings);
    setIsSavingShiftRequestSettings(true);
    setShiftRequestSettingsMessage("");
    setShiftRequestSettingsErrorMessage("");

    try {
      await updateShiftRequestSettings(nextSettings, organizationId);
      setShiftRequestSettingsMessage("シフト希望設定を保存しました。");
    } catch (error) {
      console.error(error);
      setShiftRequestSettings(previousSettings);
      setShiftRequestSettingsErrorMessage("シフト希望設定の保存に失敗しました。");
    } finally {
      setIsSavingShiftRequestSettings(false);
    }
  }
  async function handlePayrollSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSavingPayroll(true);
      setPayrollMessage("");
      setPayrollErrorMessage("");
      await updatePayrollSettings(
        {
          hourlyRates: employmentTypes.reduce<Record<string, number>>(
            (rates, type) => {
              const rate = Number(payrollForm.hourlyRates[type] ?? 0);
              rates[type] = Number.isFinite(rate) && rate >= 0 ? rate : 0;
              return rates;
            },
            {},
          ),
          nightStartTime: payrollForm.nightStartTime,
          nightEndTime: payrollForm.nightEndTime,
          nightMultiplier: Number(payrollForm.nightMultiplier),
        },
        organizationId,
      );
      setPayrollMessage("給与設定を保存しました。");
    } catch (error) {
      console.error(error);
      setPayrollErrorMessage("給与設定の保存に失敗しました。");
    } finally {
      setIsSavingPayroll(false);
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
          <SettingsAccordion
            title="おすすめ計算設定"
            description="シフト承認候補を選ぶ計算ルール"
            status={
              isSavingSettings ? (
                <span className="text-sm font-semibold text-[#1763ff]">
                  保存中...
                </span>
              ) : null
            }
          >
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
            <div className="mt-6 rounded-lg border border-black/10 px-4 py-4">
              <p className="font-semibold">自動承認設定</p>
              <p className="mt-1 text-sm text-[#717182]">
                条件を満たしたシフトを、おすすめ承認から自動で確定する設定です
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold">承認方法</span>
                  <select
                    value={settings.autoApprovalMode}
                    disabled={isLoadingSettings || isSavingSettings}
                    onChange={(event) =>
                      saveSettings({
                        ...settings,
                        autoApprovalMode: event.target.value as AutoApprovalMode,
                      })
                    }
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#eef0f4]"
                  >
                    {autoApprovalModeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {settings.autoApprovalMode !== "manual" && (
                  <label className="block">
                    <span className="text-sm font-semibold">自動承認の対象</span>
                    <select
                      value={settings.autoApprovalRequestScope}
                      disabled={isLoadingSettings || isSavingSettings}
                      onChange={(event) =>
                        saveSettings({
                          ...settings,
                          autoApprovalRequestScope: event.target
                            .value as AutoApprovalRequestScope,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#eef0f4]"
                    >
                      {autoApprovalRequestScopeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {settings.autoApprovalMode === "rollingWindow" && (
                  <label className="block">
                    <span className="text-sm font-semibold">自動承認する範囲</span>
                    <select
                      value={settings.autoApprovalWindow}
                      disabled={isLoadingSettings || isSavingSettings}
                      onChange={(event) =>
                        saveSettings({
                          ...settings,
                          autoApprovalWindow: event.target
                            .value as AutoApprovalWindow,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#eef0f4]"
                    >
                      {autoApprovalWindowOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {settings.autoApprovalMode === "periodic" && (
                  <>
                    <label className="block">
                      <span className="text-sm font-semibold">自動承認する対象</span>
                      <select
                        value={settings.autoApprovalPeriodTarget}
                        disabled={isLoadingSettings || isSavingSettings}
                        onChange={(event) =>
                          saveSettings({
                            ...settings,
                            autoApprovalPeriodTarget: event.target
                              .value as AutoApprovalPeriodTarget,
                          })
                        }
                        className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#eef0f4]"
                      >
                        {autoApprovalPeriodTargetOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold">確定タイミング</span>
                      <select
                        value={settings.autoApprovalTiming}
                        disabled={isLoadingSettings || isSavingSettings}
                        onChange={(event) =>
                          saveSettings({
                            ...settings,
                            autoApprovalTiming: event.target
                              .value as AutoApprovalTiming,
                          })
                        }
                        className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#eef0f4]"
                      >
                        {autoApprovalTimingOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>

              <p className="mt-4 text-xs leading-relaxed text-[#717182]">
                ※ 自動承認は未確定の希望だけを対象にします。すでに手動で確定したシフトは変更されません。
              </p>
            </div>
          </SettingsAccordion>

          <SettingsAccordion
            title="シフト希望設定"
            description="従業員が募集枠なしの希望を送信できるかを設定します"
            status={
              isSavingShiftRequestSettings ? (
                <span className="text-sm font-semibold text-[#1763ff]">
                  保存中...
                </span>
              ) : null
            }
          >
            {shiftRequestSettingsMessage && (
              <p className="mt-4 rounded-md bg-[#ecfdf3] px-4 py-3 text-sm font-semibold text-[#15803d]">
                {shiftRequestSettingsMessage}
              </p>
            )}
            {shiftRequestSettingsErrorMessage && (
              <p className="mt-4 rounded-md bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">
                {shiftRequestSettingsErrorMessage}
              </p>
            )}

            <div className="mt-5 rounded-lg border border-black/10 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">従業員の自主希望を許可する</p>
                  <p className="mt-1 text-sm text-[#717182]">
                    {shiftRequestSettings.employeeGeneratedRequestsEnabled
                      ? "募集枠なしの希望を送信できます"
                      : "管理者が作成した募集枠だけ希望できます"}
                  </p>
                </div>
                <ToggleSwitch
                  checked={shiftRequestSettings.employeeGeneratedRequestsEnabled}
                  disabled={
                    isLoadingShiftRequestSettings || isSavingShiftRequestSettings
                  }
                  onChange={(checked) =>
                    saveShiftRequestSettings({
                      ...shiftRequestSettings,
                      employeeGeneratedRequestsEnabled: checked,
                    })
                  }
                />
              </div>
            </div>
          </SettingsAccordion>

          <SettingsAccordion
            title="給与設定"
            description="雇用形態ごとの時給と深夜割増"
            status={
              isSavingPayroll ? (
                <span className="text-sm font-semibold text-[#1763ff]">
                  保存中...
                </span>
              ) : null
            }
          >
            {payrollMessage && (
              <p className="mt-4 rounded-md bg-[#ecfdf3] px-4 py-3 text-sm font-semibold text-[#15803d]">
                {payrollMessage}
              </p>
            )}
            {payrollErrorMessage && (
              <p className="mt-4 rounded-md bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">
                {payrollErrorMessage}
              </p>
            )}

            <form className="mt-6 space-y-5" onSubmit={handlePayrollSubmit}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {employmentTypes.map((employmentType) => (
                  <label key={employmentType} className="block">
                    <span className="text-sm font-semibold">{employmentType}</span>
                    <input
                      type="number"
                      min="0"
                      value={payrollForm.hourlyRates[employmentType] ?? "0"}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          hourlyRates: {
                            ...current.hourlyRates,
                            [employmentType]: event.target.value,
                          },
                        }))
                      }
                      className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                    />
                  </label>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-semibold">深夜開始</span>
                  <input
                    type="time"
                    value={payrollForm.nightStartTime}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        nightStartTime: event.target.value,
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">深夜終了</span>
                  <input
                    type="time"
                    value={payrollForm.nightEndTime}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        nightEndTime: event.target.value,
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">深夜倍率</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={payrollForm.nightMultiplier}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        nightMultiplier: event.target.value,
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoadingPayroll || isSavingPayroll}
                className="h-10 rounded-md bg-[#030213] px-5 text-sm font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
              >
                {isSavingPayroll ? "保存中..." : "給与設定を保存"}
              </button>
            </form>
          </SettingsAccordion>

          <SettingsAccordion
            title="危険な操作"
            description="組織と関連データを削除します"
            danger
          >
            <button
              type="button"
              disabled={isDeletingOrganization}
              onClick={openDeleteOrganizationModal}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#ffccd6] bg-white px-4 text-sm font-semibold text-[#ff003d] transition hover:bg-[#ffe8ee] disabled:cursor-not-allowed disabled:border-[#f3c7d0] disabled:text-[#c56c7f]"
            >
              <TrashIcon />
              {isDeletingOrganization ? "組織を削除中..." : "組織を削除"}
            </button>
          </SettingsAccordion>
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
