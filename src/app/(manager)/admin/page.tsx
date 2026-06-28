"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import { subscribeShiftSlots, type ShiftSlot } from "@/lib/shiftSlots";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import {
  ArrowLeftIcon,
  BuildingIcon,
  CalendarIcon,
  Card,
  ClockIcon,
  FileTextIcon,
  IconBadge,
  KeyIcon,
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

function getWeekRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return { start, end };
}

function isRequestInWeek(request: ShiftRequest, weekStart: Date, weekEnd: Date) {
  const requestDate = new Date(`${request.date}T00:00:00`);

  return (
    !Number.isNaN(requestDate.getTime()) &&
    requestDate >= weekStart &&
    requestDate < weekEnd
  );
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
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);

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
      (nextSlots) => {
        setSlots(nextSlots);
        setIsLoadingSlots(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingSlots(false);
      },
      organizationId,
    );

    return () => {
      unsubscribeRequests();
      unsubscribeSlots();
    };
  }, [currentOrganization, organizationId]);

  const approvedCountBySlot = useMemo(() => {
    return requests.reduce<Record<string, number>>((counts, request) => {
      if (request.status !== "承認済" || !request.slotId) return counts;

      counts[request.slotId] = (counts[request.slotId] ?? 0) + 1;
      return counts;
    }, {});
  }, [requests]);

  const understaffedSlotIds = useMemo(() => {
    return new Set(
      slots
        .filter((slot) => (approvedCountBySlot[slot.id] ?? 0) < slot.capacity)
        .map((slot) => slot.id),
    );
  }, [approvedCountBySlot, slots]);

  const pendingRequestCount = useMemo(() => {
    return requests.filter(
      (request) =>
        request.status !== "承認済" &&
        Boolean(request.slotId) &&
        understaffedSlotIds.has(request.slotId),
    ).length;
  }, [requests, understaffedSlotIds]);

  const understaffedSlotCount = understaffedSlotIds.size;

  const totalWorkMinutes = useMemo(() => {
    const { start, end } = getWeekRange(new Date());

    return requests
      .filter((request) => request.status === "承認済")
      .filter((request) => isRequestInWeek(request, start, end))
      .reduce((total, request) => total + calculateWorkMinutes(request), 0);
  }, [requests]);

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

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href={`/admin/settings${organizationQuery}`}
              aria-label="設定"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-sm font-semibold transition hover:bg-[#e9ebef] sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
            >
              <KeyIcon className="h-4 w-4" />
              <span className="hidden sm:inline">設定</span>
            </Link>
            <Link
              href="/login"
              aria-label="ログアウト"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-sm font-semibold transition hover:bg-[#e9ebef] sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">ログアウト</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <header>
          <h2 className="break-words text-2xl font-semibold">管理者用画面</h2>
          <p className="mt-3 max-w-full break-words text-sm leading-relaxed text-[#475569] sm:text-base">
            シフト管理や従業員情報の管理を行うことができます
          </p>
        </header>

        <section className="mt-9 grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 sm:gap-5 lg:gap-6">
          {features.map((feature) => (
            <Card key={feature.path} className="p-4 sm:p-5 lg:p-6">
              <IconBadge className={feature.color}>{feature.icon}</IconBadge>
              <h3 className="mt-3 break-words text-lg font-semibold sm:text-xl">
                {feature.title}
              </h3>
              <p className="mt-1 break-words text-sm leading-relaxed text-[#717182]">
                {feature.description}
              </p>
              <Link
                href={`${feature.path}${organizationQuery}`}
                className="mt-5 flex h-10 w-full items-center justify-center rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] lg:mt-7"
              >
                開く
              </Link>
            </Card>
          ))}
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          <Card className="p-4 sm:p-5 lg:p-6">
            <p className="text-sm text-[#717182]">対応待ちの希望</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoadingRequests || isLoadingSlots ? "..." : `${pendingRequestCount}件`}
            </p>
            <p className="mt-4 text-sm text-[#475569]">未承認かつ定員未達の希望</p>
          </Card>
          <Card className="p-4 sm:p-5 lg:p-6">
            <p className="text-sm text-[#717182]">人員不足の枠</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoadingRequests || isLoadingSlots ? "..." : `${understaffedSlotCount}件`}
            </p>
            <p className="mt-4 text-sm text-[#475569]">承認済み人数が募集人数未満の枠</p>
          </Card>
          <Card className="p-4 sm:p-5 lg:p-6">
            <p className="text-sm text-[#717182]">今週の確定時間</p>
            <p className="mt-4 text-3xl font-semibold">
              {isLoadingRequests ? "..." : formatHoursOnly(totalWorkMinutes)}
            </p>
            <p className="mt-4 text-sm text-[#475569]">今週の承認済みシフト合計</p>
          </Card>
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
