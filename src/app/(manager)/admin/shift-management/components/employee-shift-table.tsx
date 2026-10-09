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
  removeShiftRequest,
  updateManagerShiftAssignment,
  type ShiftRequest,
} from "@/lib/shiftRequests";

const cellMinutes = 30;
const snapMinutes = cellMinutes;
const minimumShiftMinutes = 30;
const cellWidth = 32;
const defaultStartMinutes = 6 * 60;
const defaultEndMinutes = 24 * 60;
const maximumEndMinutes = 30 * 60;

type EditMode = "add" | "remove" | "adjust";

type TimeRange = {
  start: number;
  end: number;
};

type ActiveDrag = TimeRange & {
  key: string;
  kind: "existing" | "cells";
  mode: "move" | "resize-start" | "resize-end" | "cells";
  action?: "add" | "remove";
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

function rangesOverlap(first: TimeRange, second: TimeRange) {
  return first.start < second.end && second.start < first.end;
}

function getCellStart(
  clientX: number,
  rowLeft: number,
  rowWidth: number,
  timelineRange: TimeRange,
) {
  const totalMinutes = timelineRange.end - timelineRange.start;
  const rawMinutes =
    timelineRange.start + ((clientX - rowLeft) / rowWidth) * totalMinutes;
  const clampedMinutes = clamp(
    rawMinutes,
    timelineRange.start,
    timelineRange.end - 1,
  );

  return (
    timelineRange.start +
    Math.floor((clampedMinutes - timelineRange.start) / cellMinutes) * cellMinutes
  );
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
  const [editMode, setEditMode] = useState<EditMode>("add");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
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
  const timelineCells = Array.from(
    { length: Math.ceil(totalMinutes / cellMinutes) },
    (_, index) => timelineRange.start + index * cellMinutes,
  );
  const timelineWidth = Math.max(960, timelineCells.length * cellWidth);
  const minuteWidth = timelineWidth / totalMinutes;
  const editable = isFutureDate(date);
  const activeDragKey = activeDrag?.key;
  const selectedDateLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));

  function updateActiveDrag(next: ActiveDrag | null) {
    activeDragRef.current = next;
    setActiveDrag(next);
  }

  useEffect(() => {
    if (!activeDragRef.current) return;

    function handlePointerMove(event: PointerEvent) {
      const current = activeDragRef.current;
      if (!current) return;

      if (current.kind === "cells") {
        const pointerMinutes = getCellStart(
          event.clientX,
          current.rowLeft,
          current.rowWidth,
          timelineRange,
        );
        const first = clamp(
          Math.min(current.originalStart, pointerMinutes),
          timelineRange.start,
          timelineRange.end - minimumShiftMinutes,
        );
        const last = clamp(
          Math.max(
            current.originalStart + minimumShiftMinutes,
            pointerMinutes + minimumShiftMinutes,
          ),
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

    function getAssignmentInput(request: ShiftRequest, range: TimeRange) {
      return {
        date: request.date,
        startTime: toTimeString(range.start),
        endTime: toTimeString(range.end),
        positionId: request.positionId || selectedPosition?.id || "unassigned",
        positionName:
          request.positionName || selectedPosition?.name || "ポジション未設定",
      };
    }

    async function removeSelectedCells(current: ActiveDrag) {
      if (!current.employee) return;

      const selectedRange = { start: current.start, end: current.end };
      const overlappingRequests = dateRequests.filter(
        (request) =>
          request.employeeId === current.employee?.employeeId &&
          rangesOverlap(getRequestRange(request), selectedRange),
      );

      if (overlappingRequests.length === 0) {
        setMessage("選択した範囲に削除できるシフトはありません。");
        return;
      }

      for (const request of overlappingRequests) {
        const storedRange = getRequestRange(request);
        const remainingRanges: TimeRange[] = [];

        if (selectedRange.start > storedRange.start) {
          remainingRanges.push({
            start: storedRange.start,
            end: Math.min(selectedRange.start, storedRange.end),
          });
        }
        if (selectedRange.end < storedRange.end) {
          remainingRanges.push({
            start: Math.max(selectedRange.end, storedRange.start),
            end: storedRange.end,
          });
        }

        const validRanges = remainingRanges.filter(
          (range) => range.end > range.start,
        );

        if (validRanges.length === 0) {
          await removeShiftRequest(request.id, organizationId);
          continue;
        }

        await updateManagerShiftAssignment(
          request.id,
          getAssignmentInput(request, validRanges[0]),
          organizationId,
        );

        if (validRanges[1]) {
          await createManagerShiftAssignment(
            current.employee,
            getAssignmentInput(request, validRanges[1]),
            payrollSettings,
            organizationId,
          );
        }
      }

      setMessage(
        `${current.employee.name}の${formatTimelineTime(current.start)}–${formatTimelineTime(current.end)}を削除しました。`,
      );
    }

    async function addSelectedCells(current: ActiveDrag) {
      if (!current.employee) return;

      const selectedRange = { start: current.start, end: current.end };
      const overlappingRequests = dateRequests.filter(
        (request) =>
          request.employeeId === current.employee?.employeeId &&
          rangesOverlap(getRequestRange(request), selectedRange),
      );
      const approvedOverlaps = overlappingRequests.filter(
        (request) => request.status === "承認済",
      );

      if (approvedOverlaps.length > 0) {
        setMessage(
          "選択範囲には確定済みシフトがあります。削除モードまたはバー調整を使ってください。",
        );
        return;
      }

      const pendingOverlaps = overlappingRequests.filter(
        (request) => request.status !== "承認済",
      );
      if (pendingOverlaps.length > 1) {
        setMessage(
          "複数の希望が重なっています。バー調整で1件ずつ確定してください。",
        );
        return;
      }

      const pendingRequest = pendingOverlaps[0];
      if (pendingRequest) {
        await updateManagerShiftAssignment(
          pendingRequest.id,
          getAssignmentInput(pendingRequest, selectedRange),
          organizationId,
        );
      } else {
        await createManagerShiftAssignment(
          current.employee,
          {
            date,
            startTime: toTimeString(current.start),
            endTime: toTimeString(current.end),
            positionId: selectedPosition?.id || "unassigned",
            positionName: selectedPosition?.name || "ポジション未設定",
          },
          payrollSettings,
          organizationId,
        );
      }

      setMessage(
        `${current.employee.name}の${formatTimelineTime(current.start)}–${formatTimelineTime(current.end)}を追加しました。`,
      );
    }

    async function handlePointerUp() {
      const current = activeDragRef.current;
      if (!current) return;
      activeDragRef.current = null;
      setActiveDrag(null);

      const key = current.key;
      setSavingKeys((keys) => new Set(keys).add(key));
      setMessage(null);

      try {
        if (current.kind === "cells") {
          if (current.action === "remove") {
            await removeSelectedCells(current);
          } else {
            await addSelectedCells(current);
          }
        } else if (current.request) {
          if (!current.hasMoved) return;

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
          setMessage(
            `${current.request.employeeName}のシフト時間を確定しました。`,
          );
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
    dateRequests,
    minuteWidth,
    organizationId,
    payrollSettings,
    selectedPosition,
    timelineRange,
    totalMinutes,
  ]);

  function startExistingDrag(
    event: ReactPointerEvent,
    request: ShiftRequest,
    mode: ActiveDrag["mode"],
  ) {
    if (
      !editable ||
      editMode !== "adjust" ||
      savingKeys.has(request.id)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedRequestId(request.id);
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

  useEffect(() => {
    if (!selectedRequestId || editMode !== "adjust" || !editable) return;

    const selectedRequest = dateRequests.find(
      (request) => request.id === selectedRequestId,
    );
    if (!selectedRequest) return;
    const requestToDelete = selectedRequest;

    async function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedRequestId(null);
        return;
      }
      if (event.key !== "Backspace" && event.key !== "Delete") return;

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.repeat || savingKeys.has(requestToDelete.id)) return;

      event.preventDefault();
      setSelectedRequestId(null);
      setSavingKeys((keys) => new Set(keys).add(requestToDelete.id));
      setMessage(null);

      try {
        await removeShiftRequest(requestToDelete.id, organizationId);
        setMessage(
          `${requestToDelete.employeeName}の${requestToDelete.startTime}–${requestToDelete.endTime}を削除しました。`,
        );
      } catch (error) {
        console.error(error);
        setMessage(
          "シフトを削除できませんでした。Firebaseの接続を確認してください。",
        );
      } finally {
        setSavingKeys((keys) => {
          const next = new Set(keys);
          next.delete(requestToDelete.id);
          return next;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    dateRequests,
    editMode,
    editable,
    organizationId,
    savingKeys,
    selectedRequestId,
  ]);

  function startCellSelection(
    event: ReactPointerEvent<HTMLDivElement>,
    employee: EmployeeProfile,
  ) {
    if (!editable || editMode === "adjust" || event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerMinutes = getCellStart(
      event.clientX,
      rect.left,
      rect.width,
      timelineRange,
    );
    const start = clamp(
      pointerMinutes,
      timelineRange.start,
      timelineRange.end - minimumShiftMinutes,
    );

    updateActiveDrag({
      key: `cells:${employee.employeeId}`,
      kind: "cells",
      mode: "cells",
      action: editMode,
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
      <div className="flex flex-col border-b border-[#b98b20] bg-[#fde7a3] sm:flex-row sm:items-center">
        <h3 className="border-b border-[#b98b20] px-4 py-3 text-base font-bold sm:border-r sm:border-b-0">
          従業員シフト表
        </h3>
        <p className="px-4 py-3 text-sm font-bold text-[#5f4711]">
          {selectedDateLabel}
        </p>
        <span className="mx-4 mb-3 rounded border border-[#b98b20] bg-white/65 px-2 py-1 text-xs font-bold text-[#5f4711] sm:ml-auto sm:mb-0">
          1マス30分
        </span>
      </div>

      <div className="flex flex-col gap-3 border-b border-black/10 bg-[#f8fafc] p-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid gap-2">
          <p className="text-xs leading-5 text-[#64748b]">
            追加・削除はクリックで1マス、横ドラッグで連続したマスを操作します。バー調整では移動・リサイズのほか、選択後にBackspace / Deleteで削除できます。
          </p>
          <div className="inline-flex w-fit rounded-lg border border-black/10 bg-white p-1 shadow-sm" aria-label="シフト表の操作モード">
            {(
              [
                ["add", "追加"],
                ["remove", "削除"],
                ["adjust", "バー調整"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={editMode === mode}
                onClick={() => {
                  setEditMode(mode);
                  if (mode !== "adjust") setSelectedRequestId(null);
                }}
                className={[
                  "h-8 rounded-md px-3 text-xs font-bold transition",
                  editMode === mode
                    ? mode === "remove"
                      ? "bg-[#b91c1c] text-white"
                      : mode === "adjust"
                        ? "bg-[#334155] text-white"
                        : "bg-[#166534] text-white"
                    : "text-[#475569] hover:bg-[#f1f5f9]",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
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
            <div className="sticky left-0 z-40 flex w-10 shrink-0 items-center justify-center border-r border-black/15 bg-[#f1f5f9] text-[10px] font-bold text-[#475569]">
              No.
            </div>
            <div className="sticky left-10 z-40 flex w-36 shrink-0 items-center border-r border-black/15 bg-[#e7f0f8] px-3 text-xs font-bold text-[#334155]">
              氏名
            </div>
            <div
              className="grid h-11 bg-white"
              style={{
                width: timelineWidth,
                gridTemplateColumns: `repeat(${timelineCells.length}, 1fr)`,
              }}
            >
              {timelineCells.map((minute) => (
                <span
                  key={minute}
                  className={[
                    "flex items-end justify-center border-r border-black/10 pb-2 text-[10px] font-bold text-[#64748b]",
                    minute % 60 === 0 ? "border-l border-l-black/30" : "",
                  ].join(" ")}
                >
                  {minute % 60 === 0 ? formatTimelineTime(minute) : ""}
                </span>
              ))}
            </div>
            <div className="sticky right-0 z-40 flex w-20 shrink-0 items-center justify-center border-l border-black/20 bg-[#fde600] text-xs font-bold text-[#3f3f00]">
              合計
            </div>
          </div>

          {sortedEmployees.map((employee, employeeIndex) => {
            const employeeRequests = requestsByEmployee[employee.employeeId] ?? [];
            const rowHeight = 58;
            const totalEmployeeMinutes = employeeRequests.reduce((total, request) => {
              if (request.status !== "承認済") return total;
              const range = getRequestRange(request);
              return total + range.end - range.start;
            }, 0);
            const creationPreview =
              activeDrag?.kind === "cells" &&
              activeDrag.employee?.employeeId === employee.employeeId
                ? activeDrag
                : null;
            const rowSaving = savingKeys.has(`cells:${employee.employeeId}`);

            return (
              <div
                key={employee.employeeId}
                className="flex border-b border-black/10 last:border-b-0"
                style={{ height: rowHeight }}
              >
                <div
                  className={[
                    "sticky left-0 z-30 flex w-10 shrink-0 items-center justify-center border-r border-black/15 text-[10px] font-semibold text-[#475569]",
                    employeeIndex % 2 === 0 ? "bg-white" : "bg-[#f8fafc]",
                  ].join(" ")}
                >
                  {employeeIndex + 1}
                </div>
                <div
                  className={[
                    "sticky left-10 z-30 flex w-36 shrink-0 items-center gap-2 border-r border-black/15 px-3",
                    employeeIndex % 2 === 0 ? "bg-[#f3f8fc]" : "bg-[#e7f0f8]",
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
                    "relative select-none",
                    employeeIndex % 2 === 0 ? "bg-white" : "bg-[#f8fafc]",
                    editMode === "adjust" ? "cursor-default" : "cursor-crosshair",
                    !editable ? "cursor-not-allowed opacity-70" : "",
                    rowSaving ? "animate-pulse" : "",
                  ].join(" ")}
                  style={{ width: timelineWidth }}
                  onPointerDown={(event) => startCellSelection(event, employee)}
                  title={
                    editable
                      ? editMode === "adjust"
                        ? "バーをドラッグして移動、左右の端で時間を調整"
                        : `${editMode === "remove" ? "削除" : "追加"}: クリックで30分、横ドラッグでまとめて操作`
                      : "過去日のシフトは編集できません"
                  }
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${timelineCells.length}, 1fr)`,
                    }}
                  >
                    {timelineCells.map((minute) => (
                      <span
                        key={minute}
                        className={[
                          "border-r border-black/10",
                          minute % 60 === 0 ? "border-l border-l-black/30" : "",
                        ].join(" ")}
                      />
                    ))}
                  </div>

                  {employeeRequests.map((request) => {
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
                          "absolute top-[10px] z-10 flex h-9 touch-none items-center overflow-hidden rounded-md border px-3 text-[11px] font-semibold shadow-sm hover:z-20",
                          approved
                            ? request.managerCreated
                              ? "border-[#8b5cf6] bg-[#ede9fe] text-[#5b21b6]"
                              : "border-[#2563eb] bg-[#dbeafe] text-[#1e40af]"
                            : "border-dashed border-[#d97706] bg-[#fffbeb] text-[#92400e]",
                          editMode !== "adjust" ? "pointer-events-none" : "",
                          saving
                            ? "animate-pulse"
                            : editMode === "adjust"
                              ? "cursor-grab active:cursor-grabbing"
                              : "",
                          selectedRequestId === request.id
                            ? "z-20 ring-2 ring-[#0f172a] ring-offset-1"
                            : "",
                        ].join(" ")}
                        style={{
                          left,
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
                      className={[
                        "pointer-events-none absolute inset-y-1 z-20 flex items-center rounded-sm border px-3 text-[11px] font-bold shadow-sm",
                        creationPreview.action === "remove"
                          ? "border-[#b91c1c] bg-[#fee2e2]/90 text-[#991b1b]"
                          : "border-[#15803d] bg-[#dcfce7]/90 text-[#166534]",
                      ].join(" ")}
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
                      {creationPreview.action === "remove"
                        ? "削除"
                        : selectedPosition?.name || "追加"}
                    </div>
                  )}
                </div>

                <div
                  className="sticky right-0 z-30 flex w-20 shrink-0 items-center justify-center border-l border-black/20 bg-[#fde600] text-xs font-bold text-[#3f3f00]"
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
        <span className="font-normal">追加・削除は30分単位。バー調整で選択後、Backspace / Deleteでも削除</span>
      </div>
    </section>
  );
}
