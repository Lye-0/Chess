import { useEffect, useMemo, useRef } from "react";
import { formatShiftTimeRange, type ShiftSlot } from "@/lib/shiftSlots";
import type { ShiftRequest } from "@/lib/shiftRequests";
import { getDisplayedRequestCount } from "../request-utils";

const laneHeight = 88;
const slotBarHeight = 76;

const positionColorClasses = [
  "border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]",
  "border-[#86efac] bg-[#dcfce7] text-[#166534]",
  "border-[#c4b5fd] bg-[#ede9fe] text-[#6d28d9]",
  "border-[#fcd34d] bg-[#fef3c7] text-[#92400e]",
  "border-[#f9a8d4] bg-[#fce7f3] text-[#be185d]",
  "border-[#67e8f9] bg-[#cffafe] text-[#0e7490]",
];

type TimelineSlot = {
  slot: ShiftSlot;
  startMinutes: number;
  endMinutes: number;
  lane: number;
};

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function toTimelineSlot(slot: ShiftSlot) {
  const startMinutes = parseTimeToMinutes(slot.startTime);
  const rawEndMinutes = parseTimeToMinutes(slot.endTime);
  const endMinutes =
    rawEndMinutes <= startMinutes ? rawEndMinutes + 24 * 60 : rawEndMinutes;

  return { slot, startMinutes, endMinutes };
}

function getPositionColor(positionName: string) {
  const source = positionName || "ポジション未設定";
  const hash = Array.from(source).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return positionColorClasses[hash % positionColorClasses.length];
}

function getTimelineRange(timelineSlots: ReturnType<typeof toTimelineSlot>[]) {
  const firstStart = Math.min(...timelineSlots.map((item) => item.startMinutes));
  const lastEnd = Math.max(...timelineSlots.map((item) => item.endMinutes));
  const startHour = Math.max(0, Math.min(9, Math.floor(firstStart / 60) - 1));
  const endHour = Math.min(30, Math.max(18, Math.ceil(lastEnd / 60) + 1));

  return {
    startMinutes: startHour * 60,
    endMinutes: endHour * 60,
    hours: Array.from({ length: endHour - startHour + 1 }, (_, index) =>
      startHour + index,
    ),
  };
}

function assignLanes(slots: ShiftSlot[]): TimelineSlot[] {
  const laneEndMinutes: number[] = [];

  return slots
    .map(toTimelineSlot)
    .sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return a.endMinutes - b.endMinutes;
    })
    .map((item) => {
      const lane = laneEndMinutes.findIndex(
        (endMinutes) => endMinutes <= item.startMinutes,
      );
      const nextLane = lane >= 0 ? lane : laneEndMinutes.length;
      laneEndMinutes[nextLane] = item.endMinutes;

      return { ...item, lane: nextLane };
    });
}

function formatHourLabel(hour: number) {
  const normalizedHour = hour % 24;
  const label = `${normalizedHour}:00`;

  return hour >= 24 ? `翌${label}` : label;
}

export function SelectedDayTimeline({
  slots,
  requestsBySlot,
  requestCountBySlot,
}: {
  slots: ShiftSlot[];
  requestsBySlot: Record<string, ShiftRequest[]>;
  requestCountBySlot: Record<string, number>;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineSlots = useMemo(() => assignLanes(slots), [slots]);
  const hasSlots = timelineSlots.length > 0;
  const laneCount = hasSlots
    ? Math.max(...timelineSlots.map((item) => item.lane)) + 1
    : 1;
  const { startMinutes, endMinutes, hours } = hasSlots
    ? getTimelineRange(timelineSlots)
    : { startMinutes: 0, endMinutes: 60, hours: [] };
  const totalMinutes = endMinutes - startMinutes;
  const timelineWidth = Math.max(720, Math.max(1, hours.length - 1) * 72);
  const bodyHeight = Math.max(104, laneCount * laneHeight + 20);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasSlots) return;

    const firstStart = Math.min(...timelineSlots.map((item) => item.startMinutes));
    const scrollRatio = Math.max(0, (firstStart - startMinutes) / totalMinutes);
    container.scrollLeft = scrollRatio * (container.scrollWidth - container.clientWidth);
  }, [hasSlots, startMinutes, timelineSlots, totalMinutes]);

  if (!hasSlots) return null;

  return (
    <section className="mt-4 rounded-lg border border-black/10 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-sm font-semibold">時間帯ビュー</h3>
        <p className="text-xs text-[#717182]">横にスクロールできます</p>
      </div>

      <div ref={scrollContainerRef} className="mt-3 overflow-x-auto pb-2">
        <div style={{ width: timelineWidth }}>
          <div className="relative h-7 border-b border-black/10 text-[11px] font-semibold text-[#717182]">
            {hours.map((hour) => {
              const left = ((hour * 60 - startMinutes) / totalMinutes) * 100;

              return (
                <span
                  key={hour}
                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${left}%` }}
                >
                  {formatHourLabel(hour)}
                </span>
              );
            })}
          </div>

          <div
            className="relative rounded-b-md bg-[#f8fafc]"
            style={{ height: bodyHeight }}
          >
            {hours.map((hour) => {
              const left = ((hour * 60 - startMinutes) / totalMinutes) * 100;

              return (
                <span
                  key={hour}
                  aria-hidden="true"
                  className="absolute top-0 h-full border-l border-black/10"
                  style={{ left: `${left}%` }}
                />
              );
            })}

            {timelineSlots.map(({ slot, startMinutes: start, endMinutes: end, lane }) => {
              const left = ((start - startMinutes) / totalMinutes) * 100;
              const width = Math.max(((end - start) / totalMinutes) * 100, 3);
              const slotRequests = requestsBySlot[slot.id] ?? [];
              const approvedCount = slotRequests.filter(
                (request) => request.status === "承認済",
              ).length;
              const displayedRequestCount = getDisplayedRequestCount(
                slot,
                requestCountBySlot,
              );
              const positionName = slot.positionName || "ポジション未設定";
              const isEmployeeGeneratedSlot = slot.employeeGenerated || slot.id.startsWith("employee-generated:");

              return (
                <div
                  key={slot.id}
                  className={[
                    "absolute min-w-24 overflow-hidden rounded-md border px-2 py-1.5 shadow-sm",
                    getPositionColor(positionName),
                  ].join(" ")}
                  style={{
                    left: `${left}%`,
                    top: 12 + lane * laneHeight,
                    width: `${width}%`,
                    height: slotBarHeight,
                  }}
                  title={`${formatShiftTimeRange(slot.startTime, slot.endTime)} / ${positionName}`}
                >
                  <p className="truncate text-xs font-semibold leading-tight">
                    {formatShiftTimeRange(slot.startTime, slot.endTime)}
                  </p>
                  {isEmployeeGeneratedSlot && (
                    <p className="truncate text-[10px] font-semibold leading-tight text-[#c2410c]">
                      従業員追加枠
                    </p>
                  )}
                  <p className="truncate text-[11px] font-semibold leading-tight">{positionName}</p>
                  <p className="truncate text-[10px] leading-tight opacity-80">
                    希望 {displayedRequestCount} / 承認 {approvedCount}/{slot.capacity}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        {Array.from(new Set(slots.map((slot) => slot.positionName || "ポジション未設定"))).map(
          (positionName) => (
            <span
              key={positionName}
              className={[
                "rounded-md border px-2 py-1",
                getPositionColor(positionName),
              ].join(" ")}
            >
              {positionName}
            </span>
          ),
        )}
      </div>
    </section>
  );
}
