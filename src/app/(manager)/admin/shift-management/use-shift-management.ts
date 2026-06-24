import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createShiftSlot,
  isFourDigitShiftDate,
  isValidShiftTimeRange,
  removeShiftSlot,
  subscribeShiftSlots,
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
  subscribeShiftRequests,
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
import { subscribeEmployees } from "@/lib/people";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import { emptyForm, recommendationWeightOptions } from "./constants";
import { getDisplayedRequestCount } from "./request-utils";
import type { RecommendedCombination, RecommendationWeightOption, ShiftForm } from "./types";

export function useShiftManagement() {
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [employeeWorkScores, setEmployeeWorkScores] = useState<Record<string, number>>({});
  const [compatibilityScores, setCompatibilityScores] =
    useState<CompatibilityScoreMap>({});
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    defaultPayrollSettings,
  );
  const [selectedWeightId, setSelectedWeightId] =
    useState<RecommendationWeightOption["id"]>("balanced");
  const [isModalOpen, setIsModalOpen] = useState(false);
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
  const selectedWeights =
    recommendationWeightOptions.find((option) => option.id === selectedWeightId) ??
    recommendationWeightOptions[1];

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!currentOrganization) return;

    const unsubscribeSlots = subscribeShiftSlots(
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
    const unsubscribeRequests = subscribeShiftRequests(
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
        setEmployeeWorkScores(
          employees.reduce<Record<string, number>>((scores, employee) => {
            scores[employee.employeeId] = employee.workScore;
            return scores;
          }, {}),
        );
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
    const unsubscribeCompatibilityScores = subscribeOrganizationCompatibilityScores(
      (scores) => {
        setCompatibilityScores(scores);
      },
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
      unsubscribeCompatibilityScores();
    };
  }, [currentOrganization, organizationId]);

  const groupedSlots = useMemo(() => {
    const sortedSlots = [...slots].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });

    return sortedSlots.reduce<Record<string, ShiftSlot[]>>((groups, slot) => {
      groups[slot.date] = [...(groups[slot.date] ?? []), slot];
      return groups;
    }, {});
  }, [slots]);

  const requestCountBySlot = useMemo(() => {
    return requests.reduce<Record<string, number>>((counts, request) => {
      counts[request.slotId] = (counts[request.slotId] ?? 0) + 1;
      return counts;
    }, {});
  }, [requests]);
  const approvedCountBySlot = useMemo(() => {
    return requests.reduce<Record<string, number>>((counts, request) => {
      if (request.status !== "承認済") return counts;

      counts[request.slotId] = (counts[request.slotId] ?? 0) + 1;
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
  const minimumCapacity = Math.max(1, editingApprovedCount);
  const capacityValue = Number(form.capacity);
  const canSave = Boolean(
    (isEditingRequestedSlot && editingSlot
        ? editedSlotStartsInFuture
        : isFourDigitShiftDate(form.date) &&
        isValidShiftTimeRange(form.startTime, form.endTime) &&
        formStartsInFuture) &&
      capacityValue >= minimumCapacity &&
      capacityValue <= 100,
  );
  const requestsBySlot = useMemo(() => {
    return requests.reduce<Record<string, ShiftRequest[]>>((groups, request) => {
      groups[request.slotId] = [...(groups[request.slotId] ?? []), request];
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

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((slot: ShiftSlot) => {
    setEditingId(slot.id);
    setForm({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: String(slot.capacity),
    });
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
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
        capacity: Number(form.capacity),
      };

      if (!isShiftStartInFuture(nextSlot)) {
        setErrorMessage("過去または開始済みの日時ではシフト枠を登録できません。");
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
      minimumCapacity,
      organizationId,
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
      if (!slot) return;

      const approvedCount = (requestsBySlotRef.current[slotId] ?? []).filter(
        (slotRequest) => slotRequest.status === "承認済",
      ).length;

      if (approvedCount >= slot.capacity) {
        setErrorMessage("募集人数に達しているため、これ以上承認できません。");
        return;
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
      if (!slot) return;

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
    payrollSettings,
    selectedWeightId,
    selectedWeights,
    setSelectedWeightId,
    isModalOpen,
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
