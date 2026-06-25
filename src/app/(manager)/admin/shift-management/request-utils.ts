import type { ShiftSlot } from "@/lib/shiftSlots";

export function getDisplayedRequestCount(
  slot: ShiftSlot,
  requestCountBySlot: Record<string, number>,
) {
  return Math.max(slot.requestCount, requestCountBySlot[slot.id] ?? 0);
}
