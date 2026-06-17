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

  async function handleDeleteOrganization() {
    if (!currentOrganization) return;

    const confirmed = window.confirm(
      `${currentOrganization.name}を削除します。従業員・シフト枠・シフト希望も削除されます。よろしいですか？`,
    );
    if (!confirmed) return;

    const user = auth.currentUser;
    if (!user) {
      setDeleteErrorMessage("管理者ログインが必要です。");
      return;
    }

    try {
      setIsDeletingOrganization(true);
      setDeleteErrorMessage("");
      await deleteManagerOrganization(user.uid, organizationId);
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
        <div className="mx-auto flex max-w-[1248px] items-center justify-between px-4 py-4 sm:px-6 lg:px-0">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/manager/select-organization"
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
            >
              <ArrowLeftIcon />
              組織選択へ
            </Link>

            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ececf0]">
                <BuildingIcon />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold leading-tight">
                  管理者ホーム
                </h1>
                <p className="truncate text-sm text-[#717182]">組織管理</p>
                <p className="truncate text-xs text-[#717182]">
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
          </div>

          <Link
            href="/login"
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
          >
            <LogoutIcon />
            ログアウト
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

        <section className="mt-8 border-t border-black/10 pt-6">
          {deleteErrorMessage && (
            <p className="mb-3 rounded-md bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">
              {deleteErrorMessage}
            </p>
          )}
          <button
            type="button"
            disabled={isDeletingOrganization}
            onClick={handleDeleteOrganization}
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#ffccd6] bg-white px-4 text-sm font-semibold text-[#ff003d] transition hover:bg-[#ffe8ee] disabled:cursor-not-allowed disabled:border-[#f3c7d0] disabled:text-[#c56c7f]"
          >
            {isDeletingOrganization ? "会社を削除中..." : "会社を削除"}
          </button>
        </section>
      </div>
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
