"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { deleteManagerOrganization } from "@/lib/managerOrganizations";
import {
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import { subscribeShiftSlots } from "@/lib/shiftSlots";
import { subscribeEmployees } from "@/lib/people";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import {
  ArrowLeftIcon,
  BuildingIcon,
  CalendarIcon,
  Card,
  ClockIcon,
  FileTextIcon,
  IconBadge,
  LogoutIcon,
  UsersIcon,
} from "../_components/shift-ui";

const features = [
  {
    path: "/admin/shift-management",
    title: "シフト管理",
    description: "シフトの作成・編集・削除を行います",
    icon: <CalendarIcon />,
    color: "bg-[#2f7df6] text-white",
  },
  {
    path: "/admin/employee-list",
    title: "従業員シフト表",
    description: "従業員ごとのシフト希望を確認します",
    icon: <UsersIcon />,
    color: "bg-[#08c853] text-white",
  },
  {
    path: "/admin/timesheet",
    title: "勤務時間",
    description: "従業員の勤務時間を確認します",
    icon: <ClockIcon />,
    color: "bg-[#b347ff] text-white",
  },
  {
    path: "/admin/employee-registration",
    title: "従業員登録",
    description: "新しい従業員を登録します",
    icon: <FileTextIcon />,
    color: "bg-[#ff650b] text-white",
  },
];

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function calculateWorkMinutes(request: ShiftRequest) {
  const start = parseTimeToMinutes(request.startTime);
  const end = parseTimeToMinutes(request.endTime);
  const diff = end - start;

  return diff >= 0 ? diff : diff + 24 * 60;
}

function formatHoursOnly(minutes: number) {
  const roundedHours = Math.round((minutes / 60) * 10) / 10;

  if (Number.isInteger(roundedHours)) {
    return `${roundedHours.toLocaleString()}h`;
  }

  return `${roundedHours.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}h`;
}

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

function AdminContent() {
  const router = useRouter();
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [slotCount, setSlotCount] = useState(0);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isDeletingOrganization, setIsDeletingOrganization] = useState(false);
  const [isDeleteOrganizationModalOpen, setIsDeleteOrganizationModalOpen] =
    useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  useEffect(() => {
    if (!currentOrganization) return;

    const unsubscribeRequests = subscribeShiftRequests(
      (nextRequests) => {
        setRequests(nextRequests);
        setIsLoadingRequests(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingRequests(false);
      },
      organizationId,
    );
    const unsubscribeSlots = subscribeShiftSlots(
      (slots) => {
        setSlotCount(slots.length);
        setIsLoadingSlots(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingSlots(false);
      },
      organizationId,
    );
    const unsubscribeEmployees = subscribeEmployees(
      (employees) => {
        setEmployeeCount(employees.length);
        setIsLoadingEmployees(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingEmployees(false);
      },
      organizationId,
    );

    return () => {
      unsubscribeRequests();
      unsubscribeSlots();
      unsubscribeEmployees();
    };
  }, [currentOrganization, organizationId]);

  const totalWorkMinutes = useMemo(() => {
    return requests.reduce(
      (total, request) => total + calculateWorkMinutes(request),
      0,
    );
  }, [requests]);

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
          : "会社の削除に失敗しました。",
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
      <header className="border-b border-black/10 bg-white shadow-sm">
        <div className="mx-auto grid max-w-[1248px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-4 sm:gap-4 sm:px-6 lg:px-0">
          <Link
            href="/manager/select-organization"
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition hover:bg-[#e9ebef] sm:px-3"
          >
            <ArrowLeftIcon />
            <span className="whitespace-nowrap">組織選択へ</span>
          </Link>

          <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ececf0] sm:h-11 sm:w-11">
              <BuildingIcon />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold leading-tight sm:text-2xl">
                管理者ホーム
              </h1>
              <p className="truncate text-xs text-[#717182] sm:text-sm">
                {currentOrganization.name}
                {currentOrganization.department
                  ? ` - ${currentOrganization.department}`
                  : ""}
              </p>
              <p className="truncate font-mono text-xs text-[#717182]">
                ID: {organizationId}
              </p>
            </div>
          </div>

          <Link
            href="/login"
            aria-label="ログアウト"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold transition hover:bg-[#e9ebef] sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
          >
            <LogoutIcon />
            <span className="hidden sm:inline">ログアウト</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <header>
          <h2 className="text-2xl font-semibold">管理者用画面</h2>
          <p className="mt-3 text-[#475569]">
            シフト管理や従業員情報の管理を行うことができます
          </p>
        </header>

        <section className="mt-9 grid gap-6 lg:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.path} className="p-6">
              <IconBadge className={feature.color}>{feature.icon}</IconBadge>
              <h3 className="mt-3 text-xl font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm text-[#717182]">{feature.description}</p>
              <Link
                href={`${feature.path}${organizationQuery}`}
                className="mt-7 flex h-10 w-full items-center justify-center rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
              >
                開く
              </Link>
            </Card>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <p className="text-sm text-[#717182]">登録シフト枠数</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoadingSlots ? "..." : `${slotCount}件`}
            </p>
            <p className="mt-4 text-sm text-[#475569]">この組織のシフト枠</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">登録従業員数</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoadingEmployees ? "..." : `${employeeCount}人`}
            </p>
            <p className="mt-4 text-sm text-[#475569]">この組織の従業員</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-[#717182]">今週の勤務時間</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoadingRequests ? "..." : formatHoursOnly(totalWorkMinutes)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">全従業員の希望時間合計</p>
          </Card>
        </section>

        <section className="mt-8 flex flex-col items-end border-t border-black/10 pt-6">
          {deleteErrorMessage && (
            <p className="mb-3 w-full rounded-md bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">
              {deleteErrorMessage}
            </p>
          )}
          <button
            type="button"
            disabled={isDeletingOrganization}
            onClick={openDeleteOrganizationModal}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#ffccd6] bg-white px-4 text-sm font-semibold text-[#ff003d] transition hover:bg-[#ffe8ee] disabled:cursor-not-allowed disabled:border-[#f3c7d0] disabled:text-[#c56c7f]"
          >
            <TrashIcon />
            {isDeletingOrganization ? "会社を削除中..." : "会社を削除"}
          </button>
        </section>
      </div>

      {isDeleteOrganizationModalOpen && currentOrganization && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
          <section className="w-full max-w-[640px] rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <WarningIcon />
                <h2 className="text-xl font-semibold">会社の削除</h2>
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
              この会社を削除します。この操作は元に戻せません。従業員・シフト枠・シフト希望・相性スコアも同時に削除されます。
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

export default function AdminPage() {
  return (
    <Suspense>
      <AdminContent />
    </Suspense>
  );
}
