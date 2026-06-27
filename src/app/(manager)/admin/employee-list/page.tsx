"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  subscribeEmployees,
  type EmployeeProfile,
} from "@/lib/people";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import {
  getShiftRequestPositionLabel,
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import {
  formatShiftTimeRange,
  subscribeShiftSlots,
  type ShiftSlot,
} from "@/lib/shiftSlots";
import {
  calculateShiftPayroll,
  defaultPayrollSettings,
  formatCurrency,
  sumShiftPay,
  subscribePayrollSettings,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  BackHeader,
  Card,
  SearchIcon,
} from "../../_components/shift-ui";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const weekday = weekdays[parsedDate.getDay()];

  return `${month}月${day}日（${weekday}）`;
}

function formatSubmittedDate(date: string) {
  if (!date) return "-";
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getFullYear()}/${parsedDate.getMonth() + 1}/${parsedDate.getDate()}`;
}

function sortRequestsDescending(requests: ShiftRequest[]) {
  return [...requests].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.startTime.localeCompare(a.startTime);
  });
}

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

function getRequestEndAt(request: ShiftRequest) {
  const endAt = new Date(`${request.date}T${request.endTime}:00`);

  if (parseTimeToMinutes(request.endTime) <= parseTimeToMinutes(request.startTime)) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return endAt;
}

function isRequestCompleted(request: ShiftRequest) {
  const endAt = getRequestEndAt(request);

  return !Number.isNaN(endAt.getTime()) && endAt <= new Date();
}

function getStatusBadgeClass(status: ShiftRequest["status"]) {
  return status === "承認済"
    ? "bg-[#dcfce7] text-[#15803d]"
    : "bg-[#dbeafe] text-[#1d4ed8]";
}

function formatWorkHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}時間${remainingMinutes}分`;
}

function AdminEmployeeListContent() {
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [registeredEmployees, setRegisteredEmployees] = useState<EmployeeProfile[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [shiftSlots, setShiftSlots] = useState<ShiftSlot[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [requestView, setRequestView] = useState<"upcoming" | "completed">("upcoming");
  const [searchQuery, setSearchQuery] = useState("");
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [isShiftSlotsLoading, setIsShiftSlotsLoading] = useState(true);
  const [isPayrollLoading, setIsPayrollLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading =
    isEmployeesLoading || isRequestsLoading || isShiftSlotsLoading || isPayrollLoading;

  useEffect(() => {
    if (!currentOrganization) return;

    const unsubscribeEmployees = subscribeEmployees(
      (employees) => {
        setRegisteredEmployees(employees);
        setSelectedEmployeeId((currentId) => {
          if (employees.some((employee) => employee.employeeId === currentId)) {
            return currentId;
          }

          return employees[0]?.employeeId ?? "";
        });
        setIsEmployeesLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsEmployeesLoading(false);
        setErrorMessage("従業員一覧の読み込みに失敗しました。");
      },
      organizationId,
    );
    const unsubscribeRequests = subscribeShiftRequests(
      (nextRequests) => {
        setRequests(nextRequests);
        setIsRequestsLoading(false);
      },
      (error) => {
        console.error(error);
        setIsRequestsLoading(false);
        setErrorMessage("シフト希望の読み込みに失敗しました。");
      },
      organizationId,
    );
    const unsubscribePayroll = subscribePayrollSettings(
      (settings) => {
        setPayrollSettings(settings);
        setIsPayrollLoading(false);
      },
      (error) => {
        console.error(error);
        setIsPayrollLoading(false);
        setErrorMessage("給与設定の読み込みに失敗しました。");
      },
      organizationId,
    );
    const unsubscribeShiftSlots = subscribeShiftSlots(
      (nextShiftSlots) => {
        setShiftSlots(nextShiftSlots);
        setIsShiftSlotsLoading(false);
      },
      (error) => {
        console.error(error);
        setIsShiftSlotsLoading(false);
        setErrorMessage("シフト枠の読み込みに失敗しました。");
      },
      organizationId,
    );

    return () => {
      unsubscribeEmployees();
      unsubscribeRequests();
      unsubscribePayroll();
      unsubscribeShiftSlots();
    };
  }, [currentOrganization, organizationId]);

  const slotPositionNameById = useMemo(() => {
    return shiftSlots.reduce<Record<string, string>>((namesById, slot) => {
      namesById[slot.id] = slot.positionName;
      return namesById;
    }, {});
  }, [shiftSlots]);

  const requestsByEmployee = useMemo(() => {
    return requests.reduce<Record<string, ShiftRequest[]>>((groups, request) => {
      groups[request.employeeId] = [...(groups[request.employeeId] ?? []), request];
      return groups;
    }, {});
  }, [requests]);
  const filteredEmployees = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return registeredEmployees;

    return registeredEmployees.filter((employee) => {
      return (
        employee.name.toLowerCase().includes(normalizedQuery) ||
        employee.email.toLowerCase().includes(normalizedQuery) ||
        employee.employeeId.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [registeredEmployees, searchQuery]);
  const selectedEmployee =
    registeredEmployees.find((employee) => employee.employeeId === selectedEmployeeId) ??
    null;
  const allSelectedRequests = useMemo(
    () =>
      selectedEmployee
        ? sortRequestsDescending(requestsByEmployee[selectedEmployee.employeeId] ?? [])
        : [],
    [requestsByEmployee, selectedEmployee],
  );
  const selectedRequests = useMemo(
    () =>
      allSelectedRequests.filter((request) =>
        requestView === "completed"
          ? isRequestCompleted(request)
          : !isRequestCompleted(request),
      ),
    [allSelectedRequests, requestView],
  );
  const totalWorkMinutes = selectedRequests.reduce(
    (total, request) => total + calculateWorkMinutes(request),
    0,
  );
  const totalPay = useMemo(
    () => sumShiftPay(selectedRequests, payrollSettings),
    [payrollSettings, selectedRequests],
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
      <BackHeader backHref={`/admin${organizationQuery}`} />

      <div className="mx-auto grid max-w-[1248px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-0">
        <Card className="min-h-[252px] p-6">
          <h1 className="text-xl font-semibold">従業員シフト表</h1>
          <p className="mt-1 text-sm text-[#717182]">
            {currentOrganization.name}
            {currentOrganization.department
              ? ` ${currentOrganization.department}`
              : ""}（{registeredEmployees.length}名）
          </p>

          <div className="relative mt-5">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="従業員名・IDで検索..."
              className="h-10 w-full rounded-md border border-black/10 bg-white pl-10 pr-3 text-sm shadow-sm outline-none placeholder:text-[#717182]"
            />
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {isEmployeesLoading ? (
              <div className="flex min-h-32 items-center justify-center text-center text-[#717182]">
                <p>従業員を読み込んでいます</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center text-center text-[#717182]">
                <p>従業員が見つかりません</p>
              </div>
            ) : (
              filteredEmployees.map((employee) => {
                const employeeRequests = requestsByEmployee[employee.employeeId] ?? [];
                const selected = employee.employeeId === selectedEmployee?.employeeId;

                return (
                  <button
                    key={employee.employeeId}
                    type="button"
                    onClick={() => setSelectedEmployeeId(employee.employeeId)}
                    className={[
                      "w-full rounded-lg border p-4 text-left transition",
                      selected
                        ? "border-[#030213] bg-[#030213] text-white"
                        : "border-black/10 bg-white hover:bg-[#f7f8fb]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold">{employee.name}</p>
                        <p
                          className={[
                            "mt-2 text-sm",
                            selected ? "text-white" : "text-[#475569]",
                          ].join(" ")}
                        >
                          {employee.email}
                          <span className="ml-5">{employee.employmentType}</span>
                        </p>
                        <p
                          className={[
                            "mt-2 text-sm",
                            selected ? "text-white" : "text-[#475569]",
                          ].join(" ")}
                        >
                          シフト希望: {employeeRequests.length}件
                        </p>
                      </div>
                      <span
                        className={[
                          "rounded-md px-2 py-1 font-mono text-xs font-semibold",
                          selected ? "bg-white/15 text-white" : "bg-[#eef2ff] text-[#1d4ed8]",
                        ].join(" ")}
                      >
                        {employee.employeeId}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className="min-h-[252px] p-6">
          {selectedEmployee ? (
            <>
              <h2 className="text-xl font-semibold">
                {selectedEmployee.name}のシフト希望
              </h2>
              <p className="mt-1 text-sm text-[#717182]">
                従業員が希望したシフト一覧
              </p>

              <div className="mt-8">
                <p className="text-sm text-[#717182]">従業員情報</p>
                <p className="mt-2 font-semibold">{selectedEmployee.name}</p>
                <p className="mt-1 text-sm text-[#475569]">
                  {selectedEmployee.email}
                  <span className="ml-5">{selectedEmployee.employmentType}</span>
                  <span className="ml-5 font-mono">{selectedEmployee.employeeId}</span>
                </p>
              </div>

              <div className="my-6 h-px bg-black/10" />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[#717182]">シフト希望一覧</p>
                <div className="inline-flex rounded-md border border-black/10 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setRequestView("upcoming")}
                    className={[
                      "h-8 rounded px-3 text-xs font-semibold transition",
                      requestView === "upcoming"
                        ? "bg-[#030213] text-white"
                        : "text-[#475569] hover:bg-[#f7f8fb]",
                    ].join(" ")}
                  >
                    勤務予定
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestView("completed")}
                    className={[
                      "h-8 rounded px-3 text-xs font-semibold transition",
                      requestView === "completed"
                        ? "bg-[#030213] text-white"
                        : "text-[#475569] hover:bg-[#f7f8fb]",
                    ].join(" ")}
                  >
                    勤務済み
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="flex min-h-28 items-center justify-center text-center text-[#717182]">
                  <p>読み込んでいます</p>
                </div>
              ) : selectedRequests.length === 0 ? (
                <div className="flex min-h-28 items-center justify-center text-center text-[#717182]">
                  <p>{requestView === "upcoming" ? "勤務予定のシフト希望はありません" : "勤務済みのシフト希望はありません"}</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {selectedRequests.map((request) => {
                    const payroll = calculateShiftPayroll(request, payrollSettings);
                    const positionLabel = getShiftRequestPositionLabel({
                      positionName:
                        request.positionName || slotPositionNameById[request.slotId] || "",
                    });

                    return (
                      <div key={request.id} className="rounded-lg bg-[#f7f8fb] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {formatDateLabel(request.date)}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#1d4ed8]">
                              {positionLabel}
                            </p>
                            <p className="mt-1 text-sm text-[#475569]">
                              {formatShiftTimeRange(
                                request.startTime,
                                request.endTime,
                              )}
                            </p>
                            <p className="mt-2 text-xs text-[#717182]">
                              提出: {formatSubmittedDate(request.submittedDate)}
                            </p>
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <p className="text-sm font-semibold text-[#00a63e]">
                              {formatCurrency(payroll.totalPay)}
                            </p>
                            <span
                              className={[
                                "mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold",
                                getStatusBadgeClass(request.status),
                              ].join(" ")}
                            >
                              {request.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="my-6 h-px bg-black/10" />

              <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-[#eaf3ff] p-5 text-center">
                  <p className="text-2xl font-semibold text-[#1763ff]">
                    {selectedRequests.length}
                  </p>
                  <p className="mt-1 text-sm text-[#1763ff]">希望件数</p>
                </div>
                <div className="rounded-lg bg-[#eafbf0] p-5 text-center">
                  <p className="text-2xl font-semibold text-[#00a63e]">
                    {formatWorkHours(totalWorkMinutes)}
                  </p>
                  <p className="mt-1 text-sm text-[#00a63e]">希望合計時間</p>
                </div>
                <div className="rounded-lg bg-[#fff7ed] p-5 text-center">
                  <p className="text-2xl font-semibold text-[#c2410c]">
                    {formatCurrency(totalPay)}
                  </p>
                  <p className="mt-1 text-sm text-[#c2410c]">給与合計</p>
                </div>
              </section>
            </>
          ) : (
            <div className="flex min-h-[204px] items-center justify-center text-center text-[#717182]">
              <p>従業員を登録すると、ここにシフト希望が表示されます</p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

export default function AdminEmployeeListPage() {
  return (
    <Suspense>
      <AdminEmployeeListContent />
    </Suspense>
  );
}
