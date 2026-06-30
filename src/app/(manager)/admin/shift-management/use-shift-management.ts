import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createShiftSlot,
  isFourDigitShiftDate,
  isValidShiftTimeRange,
  removeShiftSlot,
  subscribeShiftSlotsByMonth,
  updateShiftSlot,
  type ShiftSlot,
  type ShiftSlotInput,
} from "@/lib/shiftSlots";
import {
  approveShiftRequest,
  approveShiftRequests,
  isShiftStartInFuture,
  removeShiftRequest,
  resetShiftRequestApproval,
  subscribeShiftRequestsByMonth,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import {
  defaultPayrollSettings,
  subscribePayrollSettings,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  subscribeOrganizationCompatibilityScores,
  type CompatibilityScoreMap,
} from "@/lib/compatibilities";
import { subscribeEmployees, type EmployeeProfile } from "@/lib/people";
import {
  subscribePositions,
  type OrganizationPosition,
} from "@/lib/managerOrganizations";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import {
  buildDailyShiftExportData,
  buildMonthlyShiftExportData,
  downloadCsv,
  downloadDailyCsv,
  downloadDailyRosterPdf,
  downloadMonthDailyRosterPdf,
  downloadRosterPdf,
  getShiftExportDates,
  getShiftExportMonths,
  type ShiftExportFormat,
  type ShiftExportScope,
} from "@/lib/shiftExports";
import { emptyForm, recommendationWeightOptions } from "./constants";
import {
  defaultRecommendationSettings,
  subscribeRecommendationSettings,
} from "@/lib/recommendationSettings";
import { stabilizeRecord } from "./group-utils";
import { getRecommendedCombination } from "./recommendation";
import { getDisplayedRequestCount } from "./request-utils";
import type { RecommendedCombination, ShiftForm } from "./types";

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function getMonthValue(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0")].join("-");
}
function toShiftDateString(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function getMonthlyWeekdayDates(anchorDate: string) {
  if (!isFourDigitShiftDate(anchorDate)) return [];

  const anchor = new Date(`${anchorDate}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return [];

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const weekday = anchor.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates: string[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const candidate = new Date(year, month, day);

    if (candidate.getDay() === weekday) {
      dates.push(toShiftDateString(candidate));
    }
  }

  return dates;
}
function getShiftEndAt(shift: Pick<ShiftSlot, "date" | "startTime" | "endTime">) {
  const endAt = new Date(`${shift.date}T${shift.endTime}:00`);

  if (parseTimeToMinutes(shift.endTime) <= parseTimeToMinutes(shift.startTime)) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return endAt;
}

function getShiftStartAt(shift: Pick<ShiftSlot, "date" | "startTime">) {
  return new Date(`${shift.date}T${shift.startTime}:00`);
}

function calculateRequestMinutes(request: ShiftRequest) {
  const start = parseTimeToMinutes(request.startTime);
  const end = parseTimeToMinutes(request.endTime);
  const diff = end - start;

  return diff >= 0 ? diff : diff + 24 * 60;
}

function getRequestMonth(request: Pick<ShiftRequest, "date">) {
  return /^\d{4}-\d{2}-\d{2}$/.test(request.date)
    ? request.date.slice(0, 7)
    : "";
}
function getRequestGroupKey(request: ShiftRequest) {
  return request.slotId || `employee-generated:${request.id}`;
}

function toEmployeeGeneratedSlot(request: ShiftRequest): ShiftSlot {
  return {
    id: getRequestGroupKey(request),
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    positionId: request.positionId,
    positionName: request.positionName,
    employeeGenerated: true,
    capacity: 1,
    requestCount: 1,
  };
}

function isShiftEnded(shift: Pick<ShiftSlot, "date" | "startTime" | "endTime">) {
  const endAt = getShiftEndAt(shift);

  return !Number.isNaN(endAt.getTime()) && endAt <= new Date();
}
function addAutoApprovalDuration(date: Date, duration: string) {
  const nextDate = new Date(date);

  if (duration === "oneDay") nextDate.setDate(nextDate.getDate() + 1);
  if (duration === "threeDays") nextDate.setDate(nextDate.getDate() + 3);
  if (duration === "oneWeek") nextDate.setDate(nextDate.getDate() + 7);
  if (duration === "twoWeeks") nextDate.setDate(nextDate.getDate() + 14);
  if (duration === "fifteenDays") nextDate.setDate(nextDate.getDate() + 15);
  if (duration === "oneMonth") nextDate.setMonth(nextDate.getMonth() + 1);
  if (duration === "twoMonths") nextDate.setMonth(nextDate.getMonth() + 2);
  if (duration === "threeMonths") nextDate.setMonth(nextDate.getMonth() + 3);

  return nextDate;
}

function subtractAutoApprovalDuration(date: Date, duration: string) {
  const nextDate = new Date(date);

  if (duration === "oneDay") nextDate.setDate(nextDate.getDate() - 1);
  if (duration === "threeDays") nextDate.setDate(nextDate.getDate() - 3);
  if (duration === "oneWeek") nextDate.setDate(nextDate.getDate() - 7);
  if (duration === "twoWeeks") nextDate.setDate(nextDate.getDate() - 14);
  if (duration === "fifteenDays") nextDate.setDate(nextDate.getDate() - 15);
  if (duration === "oneMonth") nextDate.setMonth(nextDate.getMonth() - 1);
  if (duration === "twoMonths") nextDate.setMonth(nextDate.getMonth() - 2);
  if (duration === "threeMonths") nextDate.setMonth(nextDate.getMonth() - 3);

  return nextDate;
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  return weekStart;
}

function getAutoApprovalPeriodRange(date: Date, target: string) {
  if (target === "nextWeek" || target === "secondNextWeek") {
    const start = getWeekStart(date);
    start.setDate(start.getDate() + (target === "nextWeek" ? 7 : 14));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return { start, end };
  }

  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setMonth(start.getMonth() + (target === "nextMonth" ? 1 : 2));
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return { start, end };
}
export function useShiftManagement(displayMonth: Date) {
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [employeeWorkScores, setEmployeeWorkScores] = useState<Record<string, number>>({});
  const [compatibilityScores, setCompatibilityScores] =
    useState<CompatibilityScoreMap>({});
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [recommendationSettings, setRecommendationSettings] = useState(
    defaultRecommendationSettings,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMonthlyPattern, setIsMonthlyPattern] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShiftSlot | null>(null);
  const [deleteRequestTarget, setDeleteRequestTarget] =
    useState<ShiftRequest | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);
  const [approvingRecommendedSlotId, setApprovingRecommendedSlotId] =
    useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedExportMonth, setSelectedExportMonth] = useState(
    () => getShiftExportMonths([])[0],
  );
  const [selectedExportDate, setSelectedExportDate] = useState(
    () => getShiftExportDates([])[0],
  );
  const [selectedExportScope, setSelectedExportScope] =
    useState<ShiftExportScope>("month");
  const selectedMonth = useMemo(() => getMonthValue(displayMonth), [displayMonth]);
  const selectedWeights =
    recommendationWeightOptions.find(
      (option) => option.id === recommendationSettings.weightId,
    ) ?? recommendationWeightOptions[2];

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!currentOrganization) return;

    const unsubscribeSlots = subscribeShiftSlotsByMonth(
      selectedMonth,
      (nextSlots) => {
        setSlots(nextSlots);
        setIsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsLoading(false);
        setErrorMessage("シフト枠の読み込みに失敗しました。Firebase の接続設定と Firestore Rules を確認してください。");
      },
      organizationId,
    );
    const unsubscribeRequests = subscribeShiftRequestsByMonth(
      selectedMonth,
      (nextRequests) => {
        setRequests(nextRequests);
      },
      (error) => {
        console.error(error);
      },
      organizationId,
    );
    const unsubscribeEmployees = subscribeEmployees(
      (employees) => {
        setEmployees(employees);
        const nextScores = employees.reduce<Record<string, number>>(
          (scores, employee) => {
            scores[employee.employeeId] = employee.workScore;
            return scores;
          },
          {},
        );
        setEmployeeWorkScores((previous) => stabilizeRecord(nextScores, previous));
      },
      (error) => {
        console.error(error);
      },
      organizationId,
    );
    const unsubscribePayroll = subscribePayrollSettings(
      (settings) => {
        setPayrollSettings(settings);
      },
      (error) => {
        console.error(error);
      },
      organizationId,
    );
    const unsubscribePositions = subscribePositions(
      organizationId,
      (nextPositions) => {
        setPositions(nextPositions);
      },
      (error) => {
        console.error(error);
      },
    );
    const unsubscribeCompatibilityScores = subscribeOrganizationCompatibilityScores(
      (scores) => {
        setCompatibilityScores((previous) => stabilizeRecord(scores, previous));
      },
      (error) => {
        console.error(error);
      },
      organizationId,
    );
    const unsubscribeRecommendationSettings = subscribeRecommendationSettings(
      setRecommendationSettings,
      (error) => {
        console.error(error);
      },
      organizationId,
    );

    return () => {
      unsubscribeSlots();
      unsubscribeRequests();
      unsubscribeEmployees();
      unsubscribePayroll();
      unsubscribePositions();
      unsubscribeCompatibilityScores();
      unsubscribeRecommendationSettings();
    };
  }, [currentOrganization, organizationId, selectedMonth]);

  const exportMonths = useMemo(() => getShiftExportMonths(requests), [requests]);
  const activeExportMonth = exportMonths.includes(selectedExportMonth)
    ? selectedExportMonth
    : exportMonths[0];
  const exportDates = useMemo(
    () =>
      getShiftExportDates(
        requests,
        selectedExportScope === "day" ? undefined : activeExportMonth,
      ),
    [activeExportMonth, requests, selectedExportScope],
  );
  const activeExportDate = exportDates.includes(selectedExportDate)
    ? selectedExportDate
    : exportDates[0];
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
  const dailyExportData = useMemo(
    () =>
      buildDailyShiftExportData({
        organizationName: currentOrganization?.name ?? "",
        department: currentOrganization?.department ?? "",
        date: activeExportDate,
        employees,
        requests,
        payrollSettings,
      }),
    [activeExportDate, currentOrganization, employees, payrollSettings, requests],
  );
  const monthlyRequestMinutesByEmployee = useMemo(() => {
    return requests.reduce<Record<string, Record<string, number>>>((groups, request) => {
      const month = getRequestMonth(request);
      if (!month) return groups;

      const monthGroup = groups[month] ?? {};
      monthGroup[request.employeeId] =
        (monthGroup[request.employeeId] ?? 0) + calculateRequestMinutes(request);
      groups[month] = monthGroup;
      return groups;
    }, {});
  }, [requests]);
  const hasExportData =
    selectedExportScope === "day"
      ? dailyExportData.rows.length > 0
      : monthlyExportData.rows.length > 0;

  const handleExport = useCallback(
    (format: ShiftExportFormat) => {
      if (format === "csv") {
        if (selectedExportScope === "day") {
          downloadDailyCsv(dailyExportData);
          return;
        }

        downloadCsv(monthlyExportData);
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
    [dailyExportData, monthlyExportData, selectedExportScope],
  );

  const displaySlots = useMemo(() => {
    const employeeGeneratedSlots = requests
      .filter((request) => !request.slotId)
      .map(toEmployeeGeneratedSlot);

    return [...slots, ...employeeGeneratedSlots];
  }, [requests, slots]);

  const groupedSlots = useMemo(() => {
    const sortedSlots = [...displaySlots].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });

    return sortedSlots.reduce<Record<string, ShiftSlot[]>>((groups, slot) => {
      groups[slot.date] = [...(groups[slot.date] ?? []), slot];
      return groups;
    }, {});
  }, [displaySlots]);

  const requestCountBySlot = useMemo(() => {
    return requests.reduce<Record<string, number>>((counts, request) => {
      const groupKey = getRequestGroupKey(request);
      counts[groupKey] = (counts[groupKey] ?? 0) + 1;
      return counts;
    }, {});
  }, [requests]);

  const approvedCountBySlot = useMemo(() => {
    return requests.reduce<Record<string, number>>((counts, request) => {
      if (request.status !== "承認済") return counts;

      const groupKey = getRequestGroupKey(request);
      counts[groupKey] = (counts[groupKey] ?? 0) + 1;
      return counts;
    }, {});
  }, [requests]);
  const editingSlot = useMemo(
    () => slots.find((slot) => slot.id === editingId) ?? null,
    [editingId, slots],
  );
  const isEditingRequestedSlot = Boolean(
    editingSlot && getDisplayedRequestCount(editingSlot, requestCountBySlot) > 0,
  );
  const editedSlotStartsInFuture = Boolean(
    editingSlot && isShiftStartInFuture(editingSlot, now),
  );
  const formStartsInFuture = Boolean(
    isFourDigitShiftDate(form.date) &&
      form.startTime &&
      isShiftStartInFuture(
        {
          date: form.date,
          startTime: form.startTime,
        },
        now,
      ),
  );
  const editingApprovedCount = editingSlot
    ? approvedCountBySlot[editingSlot.id] ?? 0
    : 0;
  const selectedPosition =
    positions.find((position) => position.id === form.positionId) ?? null;
  const minimumCapacity = Math.max(1, editingApprovedCount);
  const capacityValue = Number(form.capacity);
  const monthlyPatternSlots = useMemo(() => {
    if (
      editingId ||
      isEditingRequestedSlot ||
      !isMonthlyPattern ||
      !selectedPosition ||
      !isFourDigitShiftDate(form.date) ||
      !isValidShiftTimeRange(form.startTime, form.endTime)
    ) {
      return [];
    }

    const existingSlotKeys = new Set(
      slots.map((slot) =>
        [slot.date, slot.startTime, slot.endTime, slot.positionId].join("|"),
      ),
    );

    return getMonthlyWeekdayDates(form.date)
      .map<ShiftSlotInput>((date) => ({
        date,
        startTime: form.startTime,
        endTime: form.endTime,
        positionId: selectedPosition.id,
        positionName: selectedPosition.name,
        capacity: Number(form.capacity),
      }))
      .filter((slot) => isShiftStartInFuture(slot, now))
      .filter(
        (slot) =>
          !existingSlotKeys.has(
            [slot.date, slot.startTime, slot.endTime, slot.positionId].join("|"),
          ),
      );
  }, [
    editingId,
    form,
    isEditingRequestedSlot,
    isMonthlyPattern,
    now,
    selectedPosition,
    slots,
  ]);
  const hasValidBaseForm = Boolean(
    isFourDigitShiftDate(form.date) &&
      isValidShiftTimeRange(form.startTime, form.endTime) &&
      selectedPosition,
  );
  const canSave = Boolean(
    (isEditingRequestedSlot && editingSlot
        ? editedSlotStartsInFuture
        : hasValidBaseForm &&
          (isMonthlyPattern ? monthlyPatternSlots.length > 0 : formStartsInFuture)) &&
      capacityValue >= minimumCapacity &&
      capacityValue <= 100,
  );
  const requestsBySlot = useMemo(() => {
    return requests.reduce<Record<string, ShiftRequest[]>>((groups, request) => {
      const groupKey = getRequestGroupKey(request);
      groups[groupKey] = [...(groups[groupKey] ?? []), request];
      return groups;
    }, {});
  }, [requests]);
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  const requestsBySlotRef = useRef(requestsBySlot);
  useEffect(() => {
    requestsBySlotRef.current = requestsBySlot;
  }, [requestsBySlot]);

  const autoApprovalSignatureRef = useRef("");
  const autoApprovalInFlightRef = useRef(false);

  useEffect(() => {
    if (
      !currentOrganization ||
      isLoading ||
      recommendationSettings.autoApprovalMode === "manual" ||
      autoApprovalInFlightRef.current
    ) {
      return;
    }

    const isWithinAutoApprovalTarget = (
      shift: Pick<ShiftSlot, "date" | "startTime" | "endTime">,
    ) => {
      const startAt = getShiftStartAt(shift);

      if (Number.isNaN(startAt.getTime()) || startAt <= now) return false;

      if (recommendationSettings.autoApprovalMode === "rollingWindow") {
        return startAt <= addAutoApprovalDuration(
          now,
          recommendationSettings.autoApprovalWindow,
        );
      }

      const range = getAutoApprovalPeriodRange(
        now,
        recommendationSettings.autoApprovalPeriodTarget,
      );
      const triggerAt = subtractAutoApprovalDuration(
        range.start,
        recommendationSettings.autoApprovalTiming,
      );

      return now >= triggerAt && startAt >= range.start && startAt < range.end;
    };

    const selectedRequestIds: string[] = [];

    slots.forEach((slot) => {
      if (!isWithinAutoApprovalTarget(slot)) return;
      if (
        recommendationSettings.autoApprovalRequestScope === "managerSlotsOnly" &&
        slot.employeeGenerated
      ) {
        return;
      }

      const slotRequests = requestsBySlot[slot.id] ?? [];
      const approvedRequests = slotRequests.filter(
        (request) => request.status === "承認済",
      );
      const pendingRequests = slotRequests.filter(
        (request) => request.status !== "承認済",
      );
      const remainingApprovalCount = Math.max(
        0,
        slot.capacity - approvedRequests.length,
      );

      if (remainingApprovalCount === 0 || pendingRequests.length === 0) return;

      const recommendation = getRecommendedCombination({
        requests: pendingRequests,
        fixedRequests: approvedRequests,
        capacity: remainingApprovalCount,
        scores: compatibilityScores,
        employeeWorkScores,
        employeeMonthlyMinutes:
          monthlyRequestMinutesByEmployee[getRequestMonth(slot)] ?? {},
        weights: selectedWeights,
        fairnessEnabled: recommendationSettings.fairnessEnabled,
      });

      recommendation?.requests.forEach((request) => {
        selectedRequestIds.push(request.id);
      });
    });

    const employeeGeneratedRequestIds =
      recommendationSettings.autoApprovalRequestScope === "includeEmployeeGenerated"
        ? requests
            .filter((request) => !request.slotId)
            .filter((request) => request.employeeGenerated)
            .filter((request) => request.status !== "承認済")
            .filter(isWithinAutoApprovalTarget)
            .map((request) => request.id)
        : [];

    const slotRequestIds = [...new Set(selectedRequestIds)].sort();
    const noSlotRequestIds = [...new Set(employeeGeneratedRequestIds)].sort();
    const signature = JSON.stringify({
      mode: recommendationSettings.autoApprovalMode,
      scope: recommendationSettings.autoApprovalRequestScope,
      slotRequestIds,
      noSlotRequestIds,
    });

    if (slotRequestIds.length === 0 && noSlotRequestIds.length === 0) return;
    if (autoApprovalSignatureRef.current === signature) return;

    autoApprovalSignatureRef.current = signature;
    autoApprovalInFlightRef.current = true;

    async function approveAutoApprovalTargets() {
      try {
        setErrorMessage(null);

        if (slotRequestIds.length > 0) {
          await approveShiftRequests(slotRequestIds, organizationId);
        }

        await Promise.all(
          noSlotRequestIds.map((requestId) =>
            approveShiftRequest(requestId, organizationId),
          ),
        );
      } catch (error) {
        console.error(error);
        setErrorMessage("自動承認に失敗しました。Firestore への書き込み権限を確認してください。");
      } finally {
        autoApprovalInFlightRef.current = false;
      }
    }

    void approveAutoApprovalTargets();
  }, [
    compatibilityScores,
    currentOrganization,
    employeeWorkScores,
    isLoading,
    monthlyRequestMinutesByEmployee,
    now,
    organizationId,
    recommendationSettings,
    requests,
    requestsBySlot,
    selectedWeights,
    slots,
  ]);
  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setIsMonthlyPattern(false);
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((slot: ShiftSlot) => {
    setEditingId(slot.id);
    setIsMonthlyPattern(false);
    setForm({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      positionId: slot.positionId,
      positionName: slot.positionName,
      capacity: String(slot.capacity),
    });
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setIsMonthlyPattern(false);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSave) return;

      const nextSlot: ShiftSlotInput = {
        date: isEditingRequestedSlot && editingSlot ? editingSlot.date : form.date,
        startTime:
          isEditingRequestedSlot && editingSlot ? editingSlot.startTime : form.startTime,
        endTime:
          isEditingRequestedSlot && editingSlot ? editingSlot.endTime : form.endTime,
        positionId:
          isEditingRequestedSlot && editingSlot
            ? editingSlot.positionId
            : selectedPosition?.id ?? "",
        positionName:
          isEditingRequestedSlot && editingSlot
            ? editingSlot.positionName
            : selectedPosition?.name ?? "",
        capacity: Number(form.capacity),
      };

      if (!isMonthlyPattern && !isShiftStartInFuture(nextSlot)) {
        setErrorMessage("過去または開始済みの日時ではシフト枠を登録できません。");
        return;
      }

      if (!isEditingRequestedSlot && !selectedPosition) {
        setErrorMessage("ポジションを選択してください。");
        return;
      }

      if (nextSlot.capacity < minimumCapacity) {
        setErrorMessage(
          `承認済み人数（${minimumCapacity}人）未満には募集人数を変更できません。`,
        );
        return;
      }

      try {
        setIsSaving(true);
        setErrorMessage(null);
        if (editingId) {
          await updateShiftSlot(editingId, nextSlot, organizationId);
        } else if (isMonthlyPattern) {
          if (monthlyPatternSlots.length === 0) {
            setErrorMessage("一括作成できる未来のシフト枠がありません。");
            return;
          }

          await Promise.all(
            monthlyPatternSlots.map((slot) => createShiftSlot(slot, organizationId)),
          );
        } else {
          await createShiftSlot(nextSlot, organizationId);
        }
        closeModal();
      } catch (error) {
        console.error(error);
        setErrorMessage(
          error instanceof Error &&
            error.message ===
              "Shift slot capacity cannot be less than approved requests."
            ? "募集人数は承認済みの人数より少なくできません。"
            : "シフト枠の保存に失敗しました。Firestore への書き込み権限を確認してください。",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [
      canSave,
      closeModal,
      editingId,
      editingSlot,
      form,
      isEditingRequestedSlot,
      isMonthlyPattern,
      minimumCapacity,
      monthlyPatternSlots,
      organizationId,
      selectedPosition,
    ],
  );

  const openDeleteModal = useCallback((slot: ShiftSlot) => {
    setDeleteTarget(slot);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget((current) => (isDeleting ? current : null));
  }, [isDeleting]);

  const confirmDeleteSlot = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      setErrorMessage(null);
      await removeShiftSlot(deleteTarget.id, organizationId);
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      setErrorMessage("シフト枠の削除に失敗しました。Firestore への書き込み権限を確認してください。");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, organizationId]);

  const handleApproveRequest = useCallback(
    async (slotId: string, request: ShiftRequest) => {
      if (request.status === "承認済") return;

      const slot = slotsRef.current.find((candidate) => candidate.id === slotId);
      if (!slot && request.slotId) return;
      if (isShiftEnded(slot ?? request)) {
        setErrorMessage("過去のシフト希望は承認できません。");
        return;
      }

      if (slot) {
        const approvedCount = (requestsBySlotRef.current[slotId] ?? []).filter(
          (slotRequest) => slotRequest.status === "承認済",
        ).length;

        if (approvedCount >= slot.capacity) {
          setErrorMessage("募集人数に達しているため、これ以上承認できません。");
          return;
        }
      }

      try {
        setApprovingRequestId(request.id);
        setErrorMessage(null);
        await approveShiftRequest(request.id, organizationId);
      } catch (error) {
        console.error(error);
        setErrorMessage("シフト希望の承認に失敗しました。Firestore への書き込み権限を確認してください。");
      } finally {
        setApprovingRequestId(null);
      }
    },
    [organizationId],
  );

  const handleApproveRecommendedRequests = useCallback(
    async (
      slotId: string,
      recommendedCombination: RecommendedCombination | null,
    ) => {
      if (!recommendedCombination) return;

      const slot = slotsRef.current.find((candidate) => candidate.id === slotId);
      if (!slot) {
        const employeeGeneratedRequests = recommendedCombination.requests.filter(
          (request) =>
            request.status !== "承認済" &&
            !request.slotId &&
            request.employeeGenerated,
        );

        if (employeeGeneratedRequests.length === 0) return;
        if (employeeGeneratedRequests.some(isShiftEnded)) {
          setErrorMessage("過去のシフト希望は承認できません。");
          return;
        }

        try {
          setApprovingRecommendedSlotId(slotId);
          setErrorMessage(null);
          await Promise.all(
            employeeGeneratedRequests.map((request) =>
              approveShiftRequest(request.id, organizationId),
            ),
          );
        } catch (error) {
          console.error(error);
          setErrorMessage("おすすめ組み合わせの一括承認に失敗しました。Firestore への書き込み権限を確認してください。");
        } finally {
          setApprovingRecommendedSlotId(null);
        }
        return;
      }
      if (isShiftEnded(slot)) {
        setErrorMessage("過去のシフト希望は承認できません。");
        return;
      }

      const approvedCount = (requestsBySlotRef.current[slotId] ?? []).filter(
        (slotRequest) => slotRequest.status === "承認済",
      ).length;
      const remainingApprovalCount = Math.max(0, slot.capacity - approvedCount);
      const pendingRequestIds = recommendedCombination.requests
        .filter((request) => request.status !== "承認済")
        .map((request) => request.id);

      if (pendingRequestIds.length === 0) return;
      if (pendingRequestIds.length > remainingApprovalCount) {
        setErrorMessage("おすすめ組み合わせを承認すると募集人数を超えるため、承認できません。");
        return;
      }

      try {
        setApprovingRecommendedSlotId(slotId);
        setErrorMessage(null);
        await approveShiftRequests(pendingRequestIds, organizationId);
      } catch (error) {
        console.error(error);
        setErrorMessage("おすすめ組み合わせの一括承認に失敗しました。Firestore への書き込み権限を確認してください。");
      } finally {
        setApprovingRecommendedSlotId(null);
      }
    },
    [organizationId],
  );

  const openDeleteRequestModal = useCallback((request: ShiftRequest) => {
    if (isShiftEnded(request)) {
      setErrorMessage(
        request.status === "承認済"
          ? "過去の承認済みシフトは承認待ちに戻せません。"
          : "過去のシフト希望は削除できません。",
      );
      return;
    }

    setDeleteRequestTarget(request);
  }, []);

  const closeDeleteRequestModal = useCallback(() => {
    setDeleteRequestTarget((current) =>
      current && deletingRequestId === current.id ? current : null,
    );
  }, [deletingRequestId]);

  const confirmDeleteRequest = useCallback(async () => {
    if (!deleteRequestTarget) return;

    const isApproved = deleteRequestTarget.status === "承認済";
    if (isShiftEnded(deleteRequestTarget)) {
      setErrorMessage(
        isApproved
          ? "過去の承認済みシフトは承認待ちに戻せません。"
          : "過去のシフト希望は削除できません。",
      );
      setDeleteRequestTarget(null);
      return;
    }

    try {
      setDeletingRequestId(deleteRequestTarget.id);
      setErrorMessage(null);
      if (isApproved) {
        await resetShiftRequestApproval(deleteRequestTarget.id, organizationId);
      } else {
        await removeShiftRequest(deleteRequestTarget.id, organizationId);
      }
      setDeleteRequestTarget(null);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        isApproved
          ? "承認の取り消しに失敗しました。Firestore への書き込み権限を確認してください。"
          : "シフト希望の削除に失敗しました。Firestore への書き込み権限を確認してください。",
      );
    } finally {
      setDeletingRequestId(null);
    }
  }, [deleteRequestTarget, organizationId]);

  return {
    organizationId,
    organizationQuery,
    currentOrganization,
    isCheckingOrganization,
    isLoading,
    errorMessage,
    groupedSlots,
    requestCountBySlot,
    requestsBySlot,
    compatibilityScores,
    employeeWorkScores,
    monthlyRequestMinutesByEmployee,
    payrollSettings,
    positions,
    exportMonths,
    activeExportMonth,
    setSelectedExportMonth,
    exportDates,
    activeExportDate,
    setSelectedExportDate,
    selectedExportScope,
    setSelectedExportScope,
    hasExportData,
    handleExport,
    recommendationSettings,
    selectedWeights,
    isModalOpen,
    isMonthlyPattern,
    setIsMonthlyPattern,
    monthlyPatternCount: monthlyPatternSlots.length,
    deleteTarget,
    deleteRequestTarget,
    editingId,
    form,
    setForm,
    isSaving,
    isDeleting,
    approvingRequestId,
    approvingRecommendedSlotId,
    deletingRequestId,
    editingSlot,
    isEditingRequestedSlot,
    editedSlotStartsInFuture,
    formStartsInFuture,
    editingApprovedCount,
    minimumCapacity,
    capacityValue,
    canSave,
    openCreateModal,
    openEditModal,
    closeModal,
    handleSubmit,
    openDeleteModal,
    closeDeleteModal,
    confirmDeleteSlot,
    handleApproveRequest,
    handleApproveRecommendedRequests,
    openDeleteRequestModal,
    closeDeleteRequestModal,
    confirmDeleteRequest,
  };
}