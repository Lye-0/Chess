"use client";

import { useEffect, useMemo, useState } from "react";
import { employees } from "@/lib/people";
import {
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
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

function sortRequests(requests: ShiftRequest[]) {
  return [...requests].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
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

function formatWorkHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}時間${remainingMinutes}分`;
}

export default function AdminEmployeeListPage() {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeShiftRequests(
      (nextRequests) => {
        setRequests(nextRequests);
        setIsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsLoading(false);
        setErrorMessage("シフト希望の読み込みに失敗しました。");
      },
    );
  }, []);

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return employees;

    return employees.filter((employee) => {
      return (
        employee.name.toLowerCase().includes(normalizedQuery) ||
        employee.email.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [searchQuery]);
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[0];
  const requestsByEmployee = useMemo(() => {
    return requests.reduce<Record<string, ShiftRequest[]>>((groups, request) => {
      groups[request.employeeId] = [...(groups[request.employeeId] ?? []), request];
      return groups;
    }, {});
  }, [requests]);
  const selectedRequests = useMemo(
    () => sortRequests(requestsByEmployee[selectedEmployee.id] ?? []),
    [requestsByEmployee, selectedEmployee.id],
  );
  const totalWorkMinutes = selectedRequests.reduce(
    (total, request) => total + calculateWorkMinutes(request),
    0,
  );

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader />

      <div className="mx-auto grid max-w-[1248px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-0">
        <Card className="min-h-[252px] p-6">
          <h1 className="text-xl font-semibold">従業員シフト表</h1>
          <p className="mt-1 text-sm text-[#717182]">
            名古屋エンジニアリング 開発部（{employees.length}名）
          </p>

          <div className="relative mt-5">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="従業員名で検索..."
              className="h-10 w-full rounded-md border border-black/10 bg-white pl-10 pr-3 text-sm shadow-sm outline-none placeholder:text-[#717182]"
            />
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {filteredEmployees.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center text-center text-[#717182]">
                <p>従業員が見つかりません</p>
              </div>
            ) : (
              filteredEmployees.map((employee) => {
                const employeeRequests = requestsByEmployee[employee.id] ?? [];
                const selected = employee.id === selectedEmployee.id;

                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(employee.id)}
                    className={[
                      "w-full rounded-lg border p-4 text-left transition",
                      selected
                        ? "border-[#030213] bg-[#030213] text-white"
                        : "border-black/10 bg-white hover:bg-[#f7f8fb]",
                    ].join(" ")}
                  >
                    <p className="font-semibold">{employee.name}</p>
                    <p className={["mt-2 text-sm", selected ? "text-white" : "text-[#475569]"].join(" ")}>
                      {employee.email}
                      <span className="ml-5">{employee.employmentType}</span>
                    </p>
                    <p className={["mt-2 text-sm", selected ? "text-white" : "text-[#475569]"].join(" ")}>
                      シフト希望: {employeeRequests.length}件
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className="min-h-[252px] p-6">
          <h2 className="text-xl font-semibold">
            {selectedEmployee.name}のシフト希望
          </h2>
          <p className="mt-1 text-sm text-[#717182]">従業員が希望したシフト一覧</p>

          <div className="mt-8">
            <p className="text-sm text-[#717182]">従業員情報</p>
            <p className="mt-2 font-semibold">{selectedEmployee.name}</p>
            <p className="mt-1 text-sm text-[#475569]">
              {selectedEmployee.email}
              <span className="ml-5">{selectedEmployee.employmentType}</span>
            </p>
          </div>

          <div className="my-6 h-px bg-black/10" />

          <p className="text-sm text-[#717182]">シフト希望一覧</p>

          {isLoading ? (
            <div className="flex min-h-28 items-center justify-center text-center text-[#717182]">
              <p>読み込んでいます</p>
            </div>
          ) : selectedRequests.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center text-center text-[#717182]">
              <p>この従業員のシフト希望はありません</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {selectedRequests.map((request) => (
                <div key={request.id} className="rounded-lg bg-[#f7f8fb] p-4">
                  <p className="font-semibold">{formatDateLabel(request.date)}</p>
                  <p className="mt-1 text-sm text-[#475569]">
                    {request.startTime} - {request.endTime}
                  </p>
                  <p className="mt-2 text-xs text-[#717182]">
                    提出: {formatSubmittedDate(request.submittedDate)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="my-6 h-px bg-black/10" />

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-[#eaf3ff] p-5 text-center">
              <p className="text-2xl font-semibold text-[#1763ff]">{selectedRequests.length}</p>
              <p className="mt-1 text-sm text-[#1763ff]">希望件数</p>
            </div>
            <div className="rounded-lg bg-[#eafbf0] p-5 text-center">
              <p className="text-2xl font-semibold text-[#00a63e]">
                {formatWorkHours(totalWorkMinutes)}
              </p>
              <p className="mt-1 text-sm text-[#00a63e]">希望合計時間</p>
            </div>
          </section>
        </Card>
      </div>
    </main>
  );
}
