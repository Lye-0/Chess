"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import { subscribeShiftSlots, type ShiftSlot } from "@/lib/shiftSlots";
import { subscribeEmployees, type EmployeeProfile } from "@/lib/people";
import {
  defaultPayrollSettings,
  subscribePayrollSettings,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  buildDailyShiftExportData,
  buildMonthlyShiftExportData,
  downloadCsv,
  downloadDailyCsv,
  downloadDailyRosterExcel,
  downloadDailyRosterPdf,
  downloadMonthDailyRosterPdf,
  downloadRosterPdf,
  getShiftExportDates,
  getShiftExportMonths,
  type ShiftExportFormat,
  type ShiftExportScope,
} from "@/lib/shiftExports";
import { ShiftExportMenu } from "@/components/ui/shift-export-menu";
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
    title: "勤務時間・給与",
    description: "従業員の勤務時間と給与を確認します",
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

function isShiftStartInFuture(slot: ShiftSlot, now = new Date()) {
  const startAt = new Date(`${slot.date}T${slot.startTime}:00`);

  return !Number.isNaN(startAt.getTime()) && startAt > now;
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

function getDefaultExportDate(dates: string[], selectedDate: string, month: string) {
  if (dates.includes(selectedDate)) return selectedDate;

  const sortedDates = [...dates].sort();
  const firstDateInMonth = sortedDates.find((date) => date.startsWith(month));

  return firstDateInMonth ?? sortedDates[0] ?? selectedDate;
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
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(defaultPayrollSettings);
  const [selectedExportFormat, setSelectedExportFormat] = useState<ShiftExportFormat>("pdf");
  const [selectedExportMonth, setSelectedExportMonth] = useState(
    () => getShiftExportMonths([])[0],
  );
  const [selectedExportDate, setSelectedExportDate] = useState(
    () => getShiftExportDates([])[0],
  );
  const [selectedExportScope, setSelectedExportScope] = useState<ShiftExportScope>("month");
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
    const unsubscribeEmployees = subscribeEmployees(
      setEmployees,
      (error) => {
        console.error(error);
      },
      organizationId,
    );
    const unsubscribePayroll = subscribePayrollSettings(
      setPayrollSettings,
      (error) => {
        console.error(error);
      },
      organizationId,
    );

    return () => {
      unsubscribeRequests();
      unsubscribeSlots();
      unsubscribeEmployees();
      unsubscribePayroll();
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
    const now = new Date();

    return new Set(
      slots
        .filter((slot) => isShiftStartInFuture(slot, now))
        .filter((slot) => (approvedCountBySlot[slot.id] ?? 0) < slot.capacity)
        .map((slot) => slot.id),
    );
  }, [approvedCountBySlot, slots]);

  const pendingRequestCount = useMemo(() => {
    return requests.filter(
      (request) =>
        request.status !== "承認済" &&
        ((Boolean(request.slotId) && understaffedSlotIds.has(request.slotId)) ||
          (request.employeeGenerated === true && !request.slotId)),
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
  const exportMonths = useMemo(() => getShiftExportMonths(requests), [requests]);
  const activeExportMonth = exportMonths.includes(selectedExportMonth)
    ? selectedExportMonth
    : exportMonths[0];
  const exportRequests = useMemo(() => {
    const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

    return requests.map((request) => {
      const currentPositionName = request.positionName.trim();
      if (currentPositionName && currentPositionName !== "ポジション未設定") return request;

      const slot = slotsById.get(request.slotId);
      const slotPositionName = slot?.positionName.trim() ?? "";
      if (!slotPositionName) return request;

      return {
        ...request,
        positionId: request.positionId || slot?.positionId || "",
        positionName: slotPositionName,
      };
    });
  }, [requests, slots]);
  const approvedExportRequests = useMemo(
    () => exportRequests.filter((request) => request.status === "承認済"),
    [exportRequests],
  );
  const exportDateRequests = selectedExportFormat === "excel"
    ? approvedExportRequests
    : requests;
  const exportDates = useMemo(
    () =>
      getShiftExportDates(
        exportDateRequests,
        selectedExportFormat === "excel" || selectedExportScope === "day"
          ? undefined
          : activeExportMonth,
      ),
    [activeExportMonth, exportDateRequests, selectedExportFormat, selectedExportScope],
  );
  const activeExportDate = getDefaultExportDate(
    exportDates,
    selectedExportDate,
    activeExportMonth,
  );
  const monthlyExportData = useMemo(
    () =>
      buildMonthlyShiftExportData({
        organizationName: currentOrganization?.name ?? "",
        department: currentOrganization?.department ?? "",
        month: activeExportMonth,
        employees,
        requests,
        payrollSettings,
      }),
    [activeExportMonth, currentOrganization, employees, payrollSettings, requests],
  );
  const dailyExportRequests = selectedExportFormat === "excel" ? exportRequests : requests;
  const dailyExportData = useMemo(
    () =>
      buildDailyShiftExportData({
        organizationName: currentOrganization?.name ?? "",
        department: currentOrganization?.department ?? "",
        date: activeExportDate,
        employees,
        requests: dailyExportRequests,
        payrollSettings,
      }),
    [activeExportDate, currentOrganization, dailyExportRequests, employees, payrollSettings],
  );
  const hasExportData =
    selectedExportFormat === "excel" || selectedExportScope === "day"
      ? dailyExportData.rows.length > 0
      : monthlyExportData.rows.length > 0;
  const handleExport = useCallback(
    (format: ShiftExportFormat) => {
      if (format === "print") {
        const params = new URLSearchParams();
        params.set("organizationId", organizationId);
        params.set("scope", selectedExportScope);

        if (selectedExportScope === "day") {
          params.set("date", activeExportDate);
        } else {
          params.set("month", activeExportMonth);
        }

        window.open(
          `/admin/shift-management/print?${params.toString()}`,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }

      if (format === "csv") {
        if (selectedExportScope === "day") {
          downloadDailyCsv(dailyExportData);
          return;
        }

        downloadCsv(monthlyExportData);
        return;
      }

      if (format === "excel") {
        downloadDailyRosterExcel(dailyExportData);
        return;
      }

      if (format === "pdf") {
        if (selectedExportScope === "day") {
          downloadDailyRosterPdf(dailyExportData);
          return;
        }

        if (selectedExportScope === "monthDaily") {
          downloadMonthDailyRosterPdf(monthlyExportData);
          return;
        }

        downloadRosterPdf(monthlyExportData);
      }
    },
    [
      activeExportDate,
      activeExportMonth,
      dailyExportData,
      monthlyExportData,
      organizationId,
      selectedExportScope,
    ],
  );

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
        <div className="mx-auto grid max-w-[1248px] grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-6 lg:px-0">
          <Link
            href="/manager/select-organization"
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition hover:bg-[#e9ebef] sm:px-3"
          >
            <ArrowLeftIcon />
            <span className="whitespace-nowrap">組織選択へ</span>
          </Link>

          <div className="flex min-w-0 items-center justify-start gap-2 sm:justify-center sm:gap-3">
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

          <div className="col-span-2 flex shrink-0 items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
            <ShiftExportMenu
              formats={[
                { format: "pdf", label: "PDF" },
                { format: "csv", label: "CSV" },
                { format: "excel", label: "Excel" },
                { format: "print", label: "印刷", actionLabel: "印刷ページを開く" },
              ]}
              months={exportMonths}
              selectedMonth={activeExportMonth}
              onMonthChange={setSelectedExportMonth}
              onExport={handleExport}
              selectedFormat={selectedExportFormat}
              onFormatChange={setSelectedExportFormat}
              disabled={isLoadingRequests || isLoadingSlots}
              hasData={hasExportData}
              scopeOptions={[
                { scope: "month", label: "月単位" },
                { scope: "monthDaily", label: "月単位（一日ずつ）" },
                { scope: "day", label: "日単位" },
              ]}
              selectedScope={selectedExportScope}
              onScopeChange={setSelectedExportScope}
              dates={exportDates}
              selectedDate={activeExportDate}
              onDateChange={setSelectedExportDate}
              showMobileLabel
            />
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/settings${organizationQuery}`}
                aria-label="設定"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
              >
                <KeyIcon className="h-4 w-4" />
                <span>設定</span>
              </Link>
              <Link
                href="/login"
                aria-label="ログアウト"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
              >
                <LogoutIcon />
                <span>ログアウト</span>
              </Link>
            </div>
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
            <p className="mt-4 text-sm text-[#475569]">未承認の対応が必要な希望</p>
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
