import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { EmployeeProfile } from "@/lib/people";
import type { PayrollSettings } from "@/lib/payroll";
import type { OrganizationPosition } from "@/lib/managerOrganizations";
import {
  createManagerShiftAssignment,
  updateManagerShiftAssignment,
  type ShiftRequest,
} from "@/lib/shiftRequests";

const snapMinutes = 15;
const minimumShiftMinutes = 30;
const defaultStartMinutes = 6 * 60;
const defaultEndMinutes = 24 * 60;
const maximumEndMinutes = 30 * 60;

type TimeRange = {
  start: number;
  end: number;
};

type ActiveDrag = TimeRange & {
  key: string;
  kind: "existing" | "create";
  mode: "move" | "resize-start" | "resize-end" | "create";
  pointerStartX: number;
  originalStart: number;
  originalEnd: number;
  rowLeft: number;
  rowWidth: number;
  hasMoved: boolean;
  request?: ShiftRequest;
  employee?: EmployeeProfile;
};

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function getRequestRange(request: ShiftRequest): TimeRange {
  const start = parseTimeToMinutes(request.startTime);
  const rawEnd = parseTimeToMinutes(request.endTime);
  return {
    start,
    end: rawEnd <= start ? rawEnd + 24 * 60 : rawEnd,
  };
}

function toTimeString(minutes: number) {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

function formatTimelineTime(minutes: number) {
  const label = toTimeString(minutes);
  return minutes >= 24 * 60 ? `翌${label}` : label;
}

function snap(value: number) {
  return Math.round(value / snapMinutes) * snapMinutes;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getTimelineRange(requests: ShiftRequest[]) {
  if (requests.length === 0) {
    return { start: defaultStartMinutes, end: defaultEndMinutes };
  }

  const ranges = requests.map(getRequestRange);
  const earliest = Math.min(...ranges.map((range) => range.start));
  const latest = Math.max(...ranges.map((range) => range.end));

  return {
    start: Math.max(0, Math.min(defaultStartMinutes, Math.floor(earliest / 60) * 60 - 60)),
    end: Math.min(
      maximumEndMinutes,
      Math.max(defaultEndMinutes, Math.ceil(latest / 60) * 60 + 60),
    ),
  };
}

function getDurationLabel(range: TimeRange) {
  const hours = (range.end - range.start) / 60;
  return Number.isInteger(hours) ? `${hours}時間` : `${hours.toFixed(2).replace(/0$/, "")}時間`;
}

function isFutureDate(date: string) {
  const endOfDay = new Date(`${date}T23:59:59`);
  return !Number.isNaN(endOfDay.getTime()) && endOfDay > new Date();
}

export function EmployeeShiftTable({
  date,
  employees,
  requests,
  positions,
  payrollSettings,
  organizationId,
}: {
  date: string;
  employees: EmployeeProfile[];
  requests: ShiftRequest[];
  positions: OrganizationPosition[];
  payrollSettings: PayrollSettings;
  organizationId: string;
}) {
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const effectivePositionId = positions.some(
    (position) => position.id === selectedPositionId,
  )
    ? selectedPositionId
    : positions[0]?.id ?? "";

  const selectedPosition =
    positions.find((position) => position.id === effectivePositionId) ?? null;
  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.employeeId.localeCompare(b.employeeId)),
    [employees],
  );
  const dateRequests = useMemo(
    () => requests.filter((request) => request.date === date),
    [date, requests],
  );
  const requestsByEmployee = useMemo(() => {
    return dateRequests.reduce<Record<string, ShiftRequest[]>>((groups, request) => {
      groups[request.employeeId] = [...(groups[request.employeeId] ?? []), request].sort(
        (a, b) => a.startTime.localeCompare(b.startTime),
      );
      return groups;
    }, {});
  }, [dateRequests]);
  const timelineRange = useMemo(() => getTimelineRange(dateRequests), [dateRequests]);
  const totalMinutes = timelineRange.end - timelineRange.start;
  const timelineWidth = Math.max(960, (totalMinutes / 60) * 72);
  const minuteWidth = timelineWidth / totalMinutes;
  const hourMarkers = Array.from(
    { length: Math.floor(totalMinutes / 60) + 1 },
    (_, index) => timelineRange.start + index * 60,
  );
  const editable = isFutureDate(date);
  const activeDragKey = activeDrag?.key;

  function updateActiveDrag(next: ActiveDrag | null) {
    activeDragRef.current = next;
    setActiveDrag(next);
  }

  useEffect(() => {
    if (!activeDragRef.current) return;

    function handlePointerMove(event: PointerEvent) {
      const current = activeDragRef.current;
      if (!current) return;

      if (current.kind === "create") {
        const pointerMinutes = snap(
          timelineRange.start +
            ((event.clientX - current.rowLeft) / current.rowWidth) * totalMinutes,
        );
        const first = clamp(
          Math.min(current.originalStart, pointerMinutes),
          timelineRange.start,
          timelineRange.end - minimumShiftMinutes,
        );
        const last = clamp(
          Math.max(current.originalStart, pointerMinutes),
          first + minimumShiftMinutes,
          timelineRange.end,
        );

        const next = {
          ...current,
          start: first,
          end: last,
          hasMoved:
            current.hasMoved || Math.abs(event.clientX - current.pointerStartX) >= 4,
        };
        activeDragRef.current = next;
        setActiveDrag(next);
        return;
      }

      const delta = snap((event.clientX - current.pointerStartX) / minuteWidth);
      const duration = current.originalEnd - current.originalStart;
      let start = current.originalStart;
      let end = current.originalEnd;

      if (current.mode === "move") {
        start = clamp(
          current.originalStart + delta,
          timelineRange.start,
          timelineRange.end - duration,
        );
        end = start + duration;
      } else if (current.mode === "resize-start") {
        start = clamp(
          current.originalStart + delta,
          timelineRange.start,
          current.originalEnd - minimumShiftMinutes,
        );
      } else {
        end = clamp(
          current.originalEnd + delta,
          current.originalStart + minimumShiftMinutes,
          timelineRange.end,
        );
      }

      const next = {
        ...current,
        start,
        end,
        hasMoved: current.hasMoved || delta !== 0,
      };
      activeDragRef.current = next;
      setActiveDrag(next);
    }

    async function handlePointerUp() {
      const current = activeDragRef.current;
      if (!current) return;
      activeDragRef.current = null;
      setActiveDrag(null);

      if (!current.hasMoved) return;
      if (!selectedPosition && current.kind === "create") {
        setMessage("先にポジションを登録・選択してください。");
        return;
      }

      const key = current.key;
      setSavingKeys((keys) => new Set(keys).add(key));
      setMessage(null);

      try {
        if (current.kind === "create" && current.employee && selectedPosition) {
          await createManagerShiftAssignment(
            current.employee,
            {
              date,
              startTime: toTimeString(current.start),
              endTime: toTimeString(current.end),
              positionId: selectedPosition.id,
              positionName: selectedPosition.name,
            },
            payrollSettings,
            organizationId,
          );
          setMessage(`${current.employee.name}のシフトを追加しました。`);
        } else if (current.request) {
          const fallbackPosition = selectedPosition;
          await updateManagerShiftAssignment(
            current.request.id,
            {
              date: current.request.date,
              startTime: toTimeString(current.start),
              endTime: toTimeString(current.end),
              positionId:
                current.request.positionId || fallbackPosition?.id || "unassigned",
              positionName:
                current.request.positionName ||
                fallbackPosition?.name ||
                "ポジション未設定",
            },
            organizationId,
          );
          setMessage(`${current.request.employeeName}のシフト時間を確定しました。`);
        }
      } catch (error) {
        console.error(error);
        setMessage(
          "シフトを保存できませんでした。未来の時間を指定し、Firebaseの接続を確認してください。",
        );
      } finally {
        setSavingKeys((keys) => {
          const next = new Set(keys);
          next.delete(key);
          return next;
        });
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    activeDragKey,
    date,
    minuteWidth,
    organizationId,
    payrollSettings,
    selectedPosition,
    timelineRange.end,
    timelineRange.start,
    totalMinutes,
  ]);

  function startExistingDrag(
    event: ReactPointerEvent,
    request: ShiftRequest,
    mode: ActiveDrag["mode"],
  ) {
    if (!editable || savingKeys.has(request.id)) return;
    event.preventDefault();
    event.stopPropagation();
    const range = getRequestRange(request);

    updateActiveDrag({
      key: request.id,
      kind: "existing",
      mode,
      pointerStartX: event.clientX,
      originalStart: range.start,
      originalEnd: range.end,
      start: range.start,
      end: range.end,
      rowLeft: 0,
      rowWidth: timelineWidth,
      hasMoved: false,
      request,
    });
  }

  function startCreating(
    event: ReactPointerEvent<HTMLDivElement>,
    employee: EmployeeProfile,
  ) {
    if (!editable || !selectedPosition || event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerMinutes = snap(
      timelineRange.start +
        ((event.clientX - rect.left) / rect.width) * totalMinutes,
    );
    const start = clamp(
      pointerMinutes,
      timelineRange.start,
      timelineRange.end - minimumShiftMinutes,
    );

    updateActiveDrag({
      key: `new:${employee.employeeId}`,
      kind: "create",
      mode: "create",
      pointerStartX: event.clientX,
      originalStart: start,
      originalEnd: start + minimumShiftMinutes,
      start,
      end: start + minimumShiftMinutes,
      rowLeft: rect.left,
      rowWidth: rect.width,
      hasMoved: false,
      employee,
    });
  }

  const approvedMinutes = dateRequests.reduce((total, request) => {
    if (request.status !== "承認済") return total;
    const range = getRequestRange(request);
    return total + range.end - range.start;
  }, 0);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-black/10 bg-[#f8fafc] p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold">従業員シフト表</h3>
          <p className="mt-1 text-xs leading-5 text-[#64748b]">
            希望は点線、確定シフトは実線で表示します。バーを動かすと確定し、左右の端で時間を調整できます。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-[#475569]">
            空き行に追加するポジション
            <select
              value={effectivePositionId}
              onChange={(event) => setSelectedPositionId(event.target.value)}
              className="h-9 min-w-44 rounded-md border border-black/15 bg-white px-3 text-sm text-[#030213]"
            >
              {positions.length === 0 && <option value="">ポジション未登録</option>}
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs">
            <span className="text-[#64748b]">確定合計 </span>
            <strong>{getDurationLabel({ start: 0, end: approvedMinutes })}</strong>
          </div>
        </div>
      </div>

      {message && (
        <p
          className="border-b border-black/10 bg-[#eff6ff] px-4 py-2 text-xs font-semibold text-[#1d4ed8]"
          role="status"
        >
          {message}
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="flex border-b border-black/10 bg-white">
            <div className="sticky left-0 z-30 flex w-44 shrink-0 items-end border-r border-black/10 bg-white px-3 pb-2 text-xs font-semibold text-[#475569]">
              従業員
            </div>
            <div className="relative h-11" style={{ width: timelineWidth }}>
              {hourMarkers.map((minute) => (
                <span
                  key={minute}
                  className="absolute bottom-2 -translate-x-1/2 text-[11px] font-semibold text-[#64748b]"
                  style={{ left: (minute - timelineRange.start) * minuteWidth }}
                >
                  {formatTimelineTime(minute)}
                </span>
              ))}
            </div>
            <div className="sticky right-0 z-30 flex w-20 shrink-0 items-end justify-center border-l border-black/10 bg-white pb-2 text-xs font-semibold text-[#475569]">
              合計
            </div>
          </div>

          {sortedEmployees.map((employee, employeeIndex) => {
            const employeeRequests = requestsByEmployee[employee.employeeId] ?? [];
            const rowHeight = Math.max(58, 14 + employeeRequests.length * 44);
            const totalEmployeeMinutes = employeeRequests.reduce((total, request) => {
              if (request.status !== "承認済") return total;
              const range = getRequestRange(request);
              return total + range.end - range.start;
            }, 0);
            const creationPreview =
              activeDrag?.kind === "create" &&
              activeDrag.employee?.employeeId === employee.employeeId
                ? activeDrag
                : null;

            return (
              <div
                key={employee.employeeId}
                className="flex border-b border-black/10 last:border-b-0"
                style={{ height: rowHeight }}
              >
                <div
                  className={[
                    "sticky left-0 z-20 flex w-44 shrink-0 items-center gap-2 border-r border-black/10 px-3",
                    employeeIndex % 2 === 0 ? "bg-white" : "bg-[#f8fafc]",
                  ].join(" ")}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e2e8f0] text-[11px] font-bold text-[#475569]">
                    {employee.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">
                      {employee.name}
                    </span>
                    <span className="block truncate text-[10px] text-[#94a3b8]">
                      {employee.employmentType}
                    </span>
                  </span>
                </div>

                <div
                  className={[
                    "relative cursor-crosshair select-none",
                    employeeIndex % 2 === 0 ? "bg-white" : "bg-[#f8fafc]",
                    !editable ? "cursor-not-allowed opacity-70" : "",
                  ].join(" ")}
                  style={{
                    width: timelineWidth,
                    backgroundImage:
                      "repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), rgba(148,163,184,.18) calc(25% - 1px), rgba(148,163,184,.18) 25%)",
                    backgroundSize: `${minuteWidth * 60}px 100%`,
                  }}
                  onPointerDown={(event) => startCreating(event, employee)}
                  title={
                    editable
                      ? "空いている場所を横にドラッグして確定シフトを追加"
                      : "過去日のシフトは編集できません"
                  }
                >
                  {hourMarkers.map((minute) => (
                    <span
                      key={minute}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 border-l border-black/10"
                      style={{ left: (minute - timelineRange.start) * minuteWidth }}
                    />
                  ))}

                  {employeeRequests.map((request, requestIndex) => {
                    const storedRange = getRequestRange(request);
                    const range =
                      activeDrag?.kind === "existing" &&
                      activeDrag.request?.id === request.id
                        ? activeDrag
                        : storedRange;
                    const left = (range.start - timelineRange.start) * minuteWidth;
                    const width = Math.max(
                      minimumShiftMinutes * minuteWidth,
                      (range.end - range.start) * minuteWidth,
                    );
                    const approved = request.status === "承認済";
                    const saving = savingKeys.has(request.id);
                    const originalTime =
                      request.requestedStartTime && request.requestedEndTime
                        ? ` / 元の希望 ${request.requestedStartTime}-${request.requestedEndTime}`
                        : "";

                    return (
                      <div
                        key={request.id}
                        className={[
                          "absolute flex h-9 touch-none items-center overflow-hidden rounded-md border px-3 text-[11px] font-semibold shadow-sm",
                          approved
                            ? request.managerCreated
                              ? "border-[#8b5cf6] bg-[#ede9fe] text-[#5b21b6]"
                              : "border-[#2563eb] bg-[#dbeafe] text-[#1e40af]"
                            : "border-dashed border-[#d97706] bg-[#fffbeb] text-[#92400e]",
                          saving ? "animate-pulse" : "cursor-grab active:cursor-grabbing",
                        ].join(" ")}
                        style={{
                          left,
                          top: 7 + requestIndex * 44,
                          width,
                        }}
                        title={`${request.employeeName} / ${formatTimelineTime(range.start)}-${formatTimelineTime(range.end)} / ${request.positionName || "ポジション未設定"}${originalTime}`}
                        onPointerDown={(event) =>
                          startExistingDrag(event, request, "move")
                        }
                      >
                        <button
                          type="button"
                          aria-label={`${request.employeeName}の開始時刻を変更`}
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-current/15"
                          onPointerDown={(event) =>
                            startExistingDrag(event, request, "resize-start")
                          }
                        />
                        <span className="pointer-events-none truncate">
                          {saving ? "保存中…" : `${formatTimelineTime(range.start)}–${formatTimelineTime(range.end)}`}
                          <span className="ml-2 opacity-70">
                            {approved ? "確定" : "希望"}・{request.positionName || "未設定"}
                          </span>
                        </span>
                        <button
                          type="button"
                          aria-label={`${request.employeeName}の終了時刻を変更`}
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-current/15"
                          onPointerDown={(event) =>
                            startExistingDrag(event, request, "resize-end")
                          }
                        />
                      </div>
                    );
                  })}

                  {creationPreview && (
                    <div
                      className="pointer-events-none absolute top-2 flex h-9 items-center rounded-md border border-dashed border-[#7c3aed] bg-[#ede9fe] px-3 text-[11px] font-semibold text-[#5b21b6] shadow-sm"
                      style={{
                        left:
                          (creationPreview.start - timelineRange.start) * minuteWidth,
                        width: Math.max(
                          minimumShiftMinutes * minuteWidth,
                          (creationPreview.end - creationPreview.start) * minuteWidth,
                        ),
                      }}
                    >
                      {formatTimelineTime(creationPreview.start)}–
                      {formatTimelineTime(creationPreview.end)}・
                      {selectedPosition?.name}
                    </div>
                  )}
                </div>

                <div
                  className={[
                    "sticky right-0 z-20 flex w-20 shrink-0 items-center justify-center border-l border-black/10 text-xs font-bold",
                    employeeIndex % 2 === 0 ? "bg-white" : "bg-[#f8fafc]",
                  ].join(" ")}
                >
                  {totalEmployeeMinutes > 0
                    ? getDurationLabel({ start: 0, end: totalEmployeeMinutes })
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {sortedEmployees.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-[#64748b]">
          従業員を登録すると、ここで日別シフトを組めます。
        </div>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-black/10 bg-[#f8fafc] px-4 py-3 text-[11px] font-semibold text-[#64748b]">
        <span><i className="mr-1 inline-block h-2.5 w-5 rounded-sm border border-dashed border-[#d97706] bg-[#fffbeb]" />提出された希望</span>
        <span><i className="mr-1 inline-block h-2.5 w-5 rounded-sm border border-[#2563eb] bg-[#dbeafe]" />承認済み</span>
        <span><i className="mr-1 inline-block h-2.5 w-5 rounded-sm border border-[#8b5cf6] bg-[#ede9fe]" />管理者が編集・追加</span>
        <span className="font-normal">空き行は横にドラッグして追加（15分単位）</span>
      </div>
    </section>
  );
}
