"use client";

import type { FormEvent } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  createShiftSlot,
  formatShiftTimeRange,
  isFourDigitShiftDate,
  isOvernightShiftTime,
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
  calculateShiftPayroll,
  defaultPayrollSettings,
  formatCurrency,
  subscribePayrollSettings,
  type PayrollSettings,
} from "@/lib/payroll";
import {
  subscribeOrganizationCompatibilityScores,
  type CompatibilityScoreMap,
} from "@/lib/compatibilities";
import {
  defaultWorkScore,
  subscribeEmployees,
} from "@/lib/people";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import {
  BackHeader,
  Card,
  PlusIcon,
} from "../../_components/shift-ui";

type ShiftForm = {
  date: string;
  startTime: string;
  endTime: string;
  capacity: string;
};


type RecommendedCombination = {
  requests: ShiftRequest[];
  finalScore: number;
  compatibilityAverage: number;
  workScoreAverage: number;
};

type RecommendationWeightOption = {
  id: "compatibility" | "balanced" | "workScore";
  label: string;
  compatibilityWeight: number;
  workScoreWeight: number;
};

const emptyForm: ShiftForm = {
  date: "",
  startTime: "",
  endTime: "",
  capacity: "1",
};

const recommendationWeightOptions: RecommendationWeightOption[] = [
  {
    id: "compatibility",
    label: "相性重視",
    compatibilityWeight: 0.7,
    workScoreWeight: 0.3,
  },
  {
    id: "balanced",
    label: "バランス",
    compatibilityWeight: 0.5,
    workScoreWeight: 0.5,
  },
  {
    id: "workScore",
    label: "シゴデキ重視",
    compatibilityWeight: 0.3,
    workScoreWeight: 0.7,
  },
];

function normalizeDateInput(value: string) {
  if (value === "") return value;
  const [year] = value.split("-");

  if (year.length > 4 || value.length > 10) return null;

  return value;
}

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function getDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const weekday = weekdays[parsedDate.getDay()];

  return `${month}月${day}日（${weekday}）`;
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.9 3.7 3.4 3.4L8.7 18.7 4 20l1.3-4.7L16.9 3.7Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="#ff003d"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 4.7 2.9 18a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function SlotRequestStatus({ requestCount }: { requestCount: number }) {
  return (
    <p
      className={[
        "mt-1 text-sm",
        requestCount > 0 ? "text-[#1763ff]" : "text-[#ff3b00]",
      ].join(" ")}
    >
      {requestCount > 0 ? `希望者: ${requestCount}人` : "希望者なし"}
    </p>
  );
}

function getDisplayedRequestCount(
  slot: ShiftSlot,
  requestCountBySlot: Record<string, number>,
) {
  return Math.max(slot.requestCount, requestCountBySlot[slot.id] ?? 0);
}

function RequestStatusBadge({ status }: { status: ShiftRequest["status"] }) {
  const approved = status === "承認済";

  return (
    <span
      className={[
        "rounded-md px-3 py-1 text-xs font-semibold",
        approved
          ? "bg-[#dcfce7] text-[#15803d]"
          : "bg-[#dbeafe] text-[#1d4ed8]",
      ].join(" ")}
    >
      {status}
    </span>
  );
}

function getCompatibilityScore(
  scores: CompatibilityScoreMap,
  fromEmployeeId: string,
  toEmployeeId: string,
) {
  return scores[fromEmployeeId]?.[toEmployeeId] ?? 0;
}

function getEmployeeWorkScore(
  employeeWorkScores: Record<string, number>,
  employeeId: string,
) {
  return employeeWorkScores[employeeId] ?? defaultWorkScore;
}

function getCompatibilityAverage(
  requests: ShiftRequest[],
  scores: CompatibilityScoreMap,
) {
  const pairCount = (requests.length * (requests.length - 1)) / 2;
  if (pairCount === 0) return 0;

  let scoreTotal = 0;

  for (let firstIndex = 0; firstIndex < requests.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < requests.length;
      secondIndex += 1
    ) {
      const firstRequest = requests[firstIndex];
      const secondRequest = requests[secondIndex];
      const mutualCompatibility =
        (getCompatibilityScore(
          scores,
          firstRequest.employeeId,
          secondRequest.employeeId,
        ) +
          getCompatibilityScore(
            scores,
            secondRequest.employeeId,
            firstRequest.employeeId,
          )) /
        2;

      scoreTotal += mutualCompatibility;
    }
  }

  return scoreTotal / pairCount;
}

function getWorkScoreAverage(
  requests: ShiftRequest[],
  employeeWorkScores: Record<string, number>,
) {
  if (requests.length === 0) return 0;

  const scoreTotal = requests.reduce(
    (total, request) =>
      total + getEmployeeWorkScore(employeeWorkScores, request.employeeId),
    0,
  );

  return scoreTotal / requests.length;
}

function getCombinationScore({
  requests,
  scores,
  employeeWorkScores,
  weights,
}: {
  requests: ShiftRequest[];
  scores: CompatibilityScoreMap;
  employeeWorkScores: Record<string, number>;
  weights: RecommendationWeightOption;
}) {
  const compatibilityAverage = getCompatibilityAverage(requests, scores);
  const workScoreAverage = getWorkScoreAverage(requests, employeeWorkScores);
  const finalScore =
    compatibilityAverage * weights.compatibilityWeight +
    workScoreAverage * weights.workScoreWeight;

  return {
    finalScore,
    compatibilityAverage,
    workScoreAverage,
  };
}

function getRecommendedCombination({
  requests,
  capacity,
  scores,
  employeeWorkScores,
  weights,
}: {
  requests: ShiftRequest[];
  capacity: number;
  scores: CompatibilityScoreMap;
  employeeWorkScores: Record<string, number>;
  weights: RecommendationWeightOption;
}): RecommendedCombination | null {
  const targetCount = Math.min(Math.max(1, capacity), requests.length);
  if (requests.length === 0 || targetCount === 0) return null;

  let bestCombination: ShiftRequest[] = [];
  let bestScore: Omit<RecommendedCombination, "requests"> = {
    finalScore: Number.NEGATIVE_INFINITY,
    compatibilityAverage: 0,
    workScoreAverage: 0,
  };

  function walk(startIndex: number, combination: ShiftRequest[]) {
    if (combination.length === targetCount) {
      const score = getCombinationScore({
        requests: combination,
        scores,
        employeeWorkScores,
        weights,
      });
      if (score.finalScore > bestScore.finalScore) {
        bestScore = score;
        bestCombination = combination;
      }
      return;
    }

    const remainingSlots = targetCount - combination.length;
    const lastStartIndex = requests.length - remainingSlots;

    for (let index = startIndex; index <= lastStartIndex; index += 1) {
      walk(index + 1, [...combination, requests[index]]);
    }
  }

  walk(0, []);

  return {
    requests: bestCombination,
    finalScore: bestScore.finalScore,
    compatibilityAverage: bestScore.compatibilityAverage,
    workScoreAverage: bestScore.workScoreAverage,
  };
}

function RecommendedCombinationPanel({
  recommendedCombination,
  capacity,
  weights,
  remainingApprovalCount,
  isApproving,
  onApprove,
}: {
  recommendedCombination: RecommendedCombination | null;
  capacity: number;
  weights: RecommendationWeightOption;
  remainingApprovalCount: number;
  isApproving: boolean;
  onApprove: () => void;
}) {
  if (!recommendedCombination) return null;

  const pendingRecommendedRequests = recommendedCombination.requests.filter(
    (request) => request.status !== "承認済",
  );
  const canApproveRecommended =
    pendingRecommendedRequests.length > 0 &&
    pendingRecommendedRequests.length <= remainingApprovalCount;

  return (
    <section className="mt-4 rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-3 py-3 text-[#1d4ed8]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold">おすすめ承認組み合わせ</p>
          <p className="mt-1 text-xs">
            募集{capacity}人に対して、おすすめの承認候補です
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-md bg-white/80 px-2.5 py-1">
              最終 {recommendedCombination.finalScore.toFixed(1)}
            </span>
            <span className="rounded-md bg-white/80 px-2.5 py-1">
              相性平均 {recommendedCombination.compatibilityAverage.toFixed(1)}
            </span>
            <span className="rounded-md bg-white/80 px-2.5 py-1">
              シゴデキ平均 {recommendedCombination.workScoreAverage.toFixed(1)}
            </span>
            <span className="rounded-md bg-white/80 px-2.5 py-1">
              {Math.round(weights.compatibilityWeight * 100)}% /{" "}
              {Math.round(weights.workScoreWeight * 100)}%
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendedCombination.requests.map((request) => (
              <span
                key={request.id}
                className="rounded-md bg-white/80 px-2.5 py-1 text-xs font-semibold"
              >
                {request.employeeName}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            disabled={isApproving || !canApproveRecommended}
            onClick={onApprove}
            className="h-9 rounded-md bg-[#1763ff] px-4 text-xs font-semibold text-white transition hover:bg-[#0f4ed8] disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:text-white"
          >
            {pendingRecommendedRequests.length === 0
              ? "承認済み"
              : isApproving
                ? "承認中..."
                : remainingApprovalCount <= 0
                  ? "募集人数に達しました"
                  : pendingRecommendedRequests.length > remainingApprovalCount
                    ? "承認枠不足"
                : "おすすめを一括承認"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ShiftRequestGroup({
  title,
  requests,
  emptyText,
  approvingRequestId,
  deletingRequestId,
  payrollSettings,
  isApprovalLimitReached = false,
  onApprove,
  onRemove,
}: {
  title: string;
  requests: ShiftRequest[];
  emptyText: string;
  approvingRequestId: string | null;
  deletingRequestId: string | null;
  payrollSettings: PayrollSettings;
  isApprovalLimitReached?: boolean;
  onApprove: (request: ShiftRequest) => void;
  onRemove: (request: ShiftRequest) => void;
}) {
  return (
    <section className="rounded-md border border-black/10 bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-[#eef2f7] px-2.5 py-0.5 text-xs font-semibold text-[#475569]">
          {requests.length}人
        </span>
      </div>

      {requests.length === 0 ? (
        <p className="mt-3 text-xs text-[#717182]">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {requests.map((request) => {
            const approved = request.status === "承認済";
            const approving = approvingRequestId === request.id;
            const deleting = deletingRequestId === request.id;
            const approvalDisabled =
              approving || deleting || isApprovalLimitReached;
            const payroll = calculateShiftPayroll(request, payrollSettings);

            return (
              <div
                key={request.id}
                className="flex flex-col gap-3 rounded-md bg-[#f7f8fb] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {request.employeeName}
                  </p>
                  <p className="mt-1 truncate text-xs text-[#717182]">
                    {request.employeeEmail} / {request.employmentType}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#00a63e]">
                    {formatCurrency(payroll.totalPay)}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <RequestStatusBadge status={request.status} />
                  {!approved && (
                    <button
                      type="button"
                      disabled={approvalDisabled}
                      onClick={() => onApprove(request)}
                      title={
                        isApprovalLimitReached
                          ? "募集人数に達しているため承認できません"
                          : undefined
                      }
                      className="h-8 rounded-md bg-[#030213] px-3 text-xs font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#d1d5db] disabled:text-white"
                    >
                      {approving ? "承認中..." : "承認"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={
                      approved
                        ? `${request.employeeName}の承認を取り消す`
                        : `${request.employeeName}のシフト希望を削除`
                    }
                    disabled={deleting}
                    onClick={() => onRemove(request)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[#ff003d] transition hover:bg-[#ffe8ee] hover:text-[#cc0031] disabled:cursor-not-allowed disabled:text-[#c56c7f]"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AdminShiftManagementContent() {
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
  const formStartsInFuture =
    isFourDigitShiftDate(form.date) &&
    form.startTime &&
    isShiftStartInFuture(
      {
        date: form.date,
        startTime: form.startTime,
      },
      now,
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

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  }

  function openEditModal(slot: ShiftSlot) {
    setEditingId(slot.id);
    setForm({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: String(slot.capacity),
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
  }

  function openDeleteModal(slot: ShiftSlot) {
    setDeleteTarget(slot);
  }

  function closeDeleteModal() {
    if (isDeleting) return;
    setDeleteTarget(null);
  }

  async function confirmDeleteSlot() {
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
  }

  async function handleApproveRequest(slot: ShiftSlot, request: ShiftRequest) {
    if (request.status === "承認済") return;

    const approvedCount = (requestsBySlot[slot.id] ?? []).filter(
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
  }

  async function handleApproveRecommendedRequests(
    slot: ShiftSlot,
    recommendedCombination: RecommendedCombination | null,
  ) {
    if (!recommendedCombination) return;

    const approvedCount = (requestsBySlot[slot.id] ?? []).filter(
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
      setApprovingRecommendedSlotId(slot.id);
      setErrorMessage(null);
      await approveShiftRequests(pendingRequestIds, organizationId);
    } catch (error) {
      console.error(error);
      setErrorMessage("おすすめ組み合わせの一括承認に失敗しました。Firestore への書き込み権限を確認してください。");
    } finally {
      setApprovingRecommendedSlotId(null);
    }
  }

  function openDeleteRequestModal(request: ShiftRequest) {
    setDeleteRequestTarget(request);
  }

  function closeDeleteRequestModal() {
    if (deleteRequestTarget && deletingRequestId === deleteRequestTarget.id) return;
    setDeleteRequestTarget(null);
  }

  async function confirmDeleteRequest() {
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
  }

  if (isCheckingOrganization || !currentOrganization) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] text-[#717182]">
        <p>管理できる組織を確認しています</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <BackHeader
        backHref={`/admin${organizationQuery}`}
        right={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#030213] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#171624]"
          >
            <PlusIcon />
            シフト枠を追加
          </button>
        }
      />

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <Card className="min-h-[260px] p-6">
          <h1 className="text-xl font-semibold">シフト管理</h1>
          <p className="mt-2 text-sm text-[#717182]">
            ここで設定したシフト枠のみ従業員が希望を出せます。鉛筆アイコンで募集人数を変更できます。
          </p>

          <section className="mt-5 rounded-lg border border-black/10 bg-[#f7f8fb] px-4 py-4">
            <p className="text-sm font-semibold">おすすめ計算の比重</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {recommendationWeightOptions.map((option) => {
                const selected = option.id === selectedWeightId;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedWeightId(option.id)}
                    className={[
                      "rounded-md border px-3 py-2 text-left text-sm transition",
                      selected
                        ? "border-[#1763ff] bg-[#eff6ff] text-[#1d4ed8]"
                        : "border-black/10 bg-white text-[#475569] hover:bg-[#eef2f7]",
                    ].join(" ")}
                  >
                    <span className="block font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs">
                      相性 {Math.round(option.compatibilityWeight * 100)}% / シゴデキ{" "}
                      {Math.round(option.workScoreWeight * 100)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[170px] flex-col items-center justify-center text-center text-[#717182]">
              <p>シフトを読み込んでいます</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="flex min-h-[170px] flex-col items-center justify-center text-center text-[#717182]">
              <p>シフトがまだ登録されていません</p>
              <p className="mt-2">右上のボタンから追加してください</p>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {Object.entries(groupedSlots).map(([date, dateSlots]) => (
                <section key={date} className="rounded-lg border border-black/10 p-4">
                  <h2 className="text-lg font-semibold">{getDateLabel(date)}</h2>
                  <div className="mt-4 space-y-3">
                    {dateSlots.map((slot) => {
                      const slotRequests = requestsBySlot[slot.id] ?? [];
                      const displayedRequestCount = getDisplayedRequestCount(
                        slot,
                        requestCountBySlot,
                      );
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
                      const isApprovalLimitReached = remainingApprovalCount === 0;
                      const recommendedCombination = getRecommendedCombination({
                        requests: slotRequests,
                        capacity: slot.capacity,
                        scores: compatibilityScores,
                        employeeWorkScores,
                        weights: selectedWeights,
                      });

                      return (
                        <div
                          key={slot.id}
                          className="rounded-lg bg-[#f7f8fb] px-4 py-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <p className="font-semibold">
                                  {formatShiftTimeRange(
                                    slot.startTime,
                                    slot.endTime,
                                  )}
                                </p>
                                <p className="text-sm text-[#475569]">募集: {slot.capacity}人</p>
                              </div>
                              <SlotRequestStatus requestCount={displayedRequestCount} />
                            </div>

                            <div className="flex items-center gap-5 self-end sm:self-auto">
                              <button
                                type="button"
                                aria-label="シフト枠を編集"
                                onClick={() => openEditModal(slot)}
                                className="text-[#596074] transition hover:text-[#030213]"
                              >
                                <PencilIcon />
                              </button>
                              <button
                                type="button"
                                aria-label="シフト枠を削除"
                                onClick={() => openDeleteModal(slot)}
                                className="text-[#ff003d] transition hover:text-[#cc0031]"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>

                          <RecommendedCombinationPanel
                            recommendedCombination={recommendedCombination}
                            capacity={slot.capacity}
                            weights={selectedWeights}
                            remainingApprovalCount={remainingApprovalCount}
                            isApproving={approvingRecommendedSlotId === slot.id}
                            onApprove={() =>
                              handleApproveRecommendedRequests(
                                slot,
                                recommendedCombination,
                              )
                            }
                          />

                          {slotRequests.length > 0 && (
                            <div className="mt-4 grid gap-3 border-t border-black/10 pt-3 lg:grid-cols-2">
                              <ShiftRequestGroup
                                title="承認待ち"
                                requests={pendingRequests}
                                emptyText="承認待ちの希望はありません"
                                approvingRequestId={approvingRequestId}
                                deletingRequestId={deletingRequestId}
                                payrollSettings={payrollSettings}
                                isApprovalLimitReached={isApprovalLimitReached}
                                onApprove={(request) =>
                                  handleApproveRequest(slot, request)
                                }
                                onRemove={openDeleteRequestModal}
                              />
                              <ShiftRequestGroup
                                title="承認済み"
                                requests={approvedRequests}
                                emptyText="承認済みの希望はありません"
                                approvingRequestId={approvingRequestId}
                                deletingRequestId={deletingRequestId}
                                payrollSettings={payrollSettings}
                                onApprove={(request) =>
                                  handleApproveRequest(slot, request)
                                }
                                onRemove={openDeleteRequestModal}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[512px] rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {editingId ? "シフト枠を編集" : "シフト枠を追加"}
                </h2>
                <p className="mt-1 text-sm text-[#717182]">
                  従業員が希望できるシフト枠を設定します
                </p>
                {isEditingRequestedSlot && (
                  <p className="mt-3 rounded-md bg-[#fff7ed] px-3 py-2 text-sm text-[#c2410c]">
                    希望者がいるため、日付・開始時刻・終了時刻は変更できません。募集人数のみ変更できます。
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={closeModal}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
              >
                <XIcon />
              </button>
            </div>

            <div className="mt-8 space-y-5">
              <div>
                <label htmlFor="shift-date" className="block text-sm font-semibold">
                  日付
                </label>
                <input
                  id="shift-date"
                  type="date"
                  min="0001-01-01"
                  max="9999-12-31"
                  value={form.date}
                  disabled={isEditingRequestedSlot}
                  onChange={(event) => {
                    const nextDate = normalizeDateInput(event.target.value);
                    if (nextDate === null) return;

                    setForm({ ...form, date: nextDate });
                  }}
                  className="mt-2 h-10 w-full rounded-md border border-black/20 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#f0f1f4] disabled:text-[#717182]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="shift-start" className="block text-sm font-semibold">
                    開始時刻
                  </label>
                  <input
                    id="shift-start"
                    type="time"
                    value={form.startTime}
                    disabled={isEditingRequestedSlot}
                    onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#f0f1f4] disabled:text-[#717182]"
                  />
                </div>

                <div>
                  <label htmlFor="shift-end" className="block text-sm font-semibold">
                    終了時刻
                  </label>
                  <input
                    id="shift-end"
                    type="time"
                    value={form.endTime}
                    disabled={isEditingRequestedSlot}
                    onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#f0f1f4] disabled:text-[#717182]"
                  />
                </div>
              </div>

              {!isEditingRequestedSlot && form.startTime && form.endTime && (
                <p
                  className={[
                    "rounded-md px-3 py-2 text-sm",
                    form.startTime === form.endTime
                      ? "bg-[#fff1f1] text-[#b00020]"
                      : isFourDigitShiftDate(form.date) &&
                          isValidShiftTimeRange(form.startTime, form.endTime) &&
                          !formStartsInFuture
                        ? "bg-[#fff1f1] text-[#b00020]"
                      : isOvernightShiftTime(form.startTime, form.endTime)
                        ? "bg-[#eff6ff] text-[#1d4ed8]"
                        : "bg-[#f7f8fb] text-[#475569]",
                  ].join(" ")}
                >
                  {form.startTime === form.endTime
                    ? "開始時刻と終了時刻は別の時刻にしてください。"
                    : isFourDigitShiftDate(form.date) &&
                        isValidShiftTimeRange(form.startTime, form.endTime) &&
                        !formStartsInFuture
                      ? "過去または開始済みの日時ではシフト枠を登録できません。"
                    : isOvernightShiftTime(form.startTime, form.endTime)
                      ? "終了時刻は翌日の時刻として保存されます。"
                      : "同じ日のシフトとして保存されます。"}
                </p>
              )}

              {isEditingRequestedSlot && editingSlot && !editedSlotStartsInFuture && (
                <p className="rounded-md bg-[#fff1f1] px-3 py-2 text-sm text-[#b00020]">
                  このシフトは過去または開始済みのため更新できません。
                </p>
              )}

              <div>
                <label htmlFor="shift-capacity" className="block text-sm font-semibold">
                  募集人数（{minimumCapacity}〜100人）
                </label>
                <input
                  id="shift-capacity"
                  type="number"
                  min={minimumCapacity}
                  max="100"
                  value={form.capacity}
                  onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
                {editingApprovedCount > 0 && (
                  <p className="mt-2 text-sm text-[#717182]">
                    承認済みが{editingApprovedCount}人いるため、募集人数は
                    {editingApprovedCount}人未満にできません。
                  </p>
                )}
                {form.capacity && capacityValue < minimumCapacity && (
                  <p className="mt-2 rounded-md bg-[#fff1f1] px-3 py-2 text-sm text-[#b00020]">
                    承認済み人数（{minimumCapacity}人）未満には変更できません。
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSave || isSaving}
                className={[
                  "h-10 w-full rounded-md text-sm font-semibold text-white transition",
                  canSave && !isSaving
                    ? "bg-[#030213] hover:bg-[#171624]"
                    : "cursor-not-allowed bg-[#8e8d95]",
                ].join(" ")}
              >
                {isSaving ? "保存中..." : editingId ? "更新" : "追加"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteRequestTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
          <section className="w-full max-w-[640px] rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <WarningIcon />
                <h2 className="text-xl font-semibold">
                  {deleteRequestTarget.status === "承認済"
                    ? "承認の取り消し"
                    : "シフト希望の削除"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={closeDeleteRequestModal}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
              >
                <XIcon />
              </button>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-[#717182]">
              {deleteRequestTarget.status === "承認済"
                ? "この承認を取り消し、承認待ちに戻します。申請自体は削除されません。"
                : "このシフト希望を削除します。この操作は元に戻せません。"}
            </p>

            <div className="mt-6 rounded-lg bg-[#f7f8fb] px-5 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{deleteRequestTarget.employeeName}</p>
                  <p className="mt-2 text-sm text-[#475569]">
                    {deleteRequestTarget.employeeEmail}
                    <span className="ml-4">{deleteRequestTarget.employmentType}</span>
                  </p>
                  <p className="mt-2 font-mono text-sm font-semibold text-[#1d4ed8]">
                    {deleteRequestTarget.employeeId}
                  </p>
                </div>
                <RequestStatusBadge status={deleteRequestTarget.status} />
              </div>
              <p className="mt-4 text-sm font-semibold text-[#475569]">
                {getDateLabel(deleteRequestTarget.date)}
                <span className="ml-4">
                  {deleteRequestTarget.startTime} - {deleteRequestTarget.endTime}
                </span>
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeDeleteRequestModal}
                disabled={deletingRequestId === deleteRequestTarget.id}
                className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDeleteRequest}
                disabled={deletingRequestId === deleteRequestTarget.id}
                className="inline-flex h-10 items-center justify-center gap-3 rounded-md bg-[#db1741] text-sm font-semibold text-white transition hover:bg-[#c51239] disabled:cursor-not-allowed disabled:bg-[#c56c7f]"
              >
                <TrashIcon />
                {deletingRequestId === deleteRequestTarget.id
                  ? "処理中..."
                  : deleteRequestTarget.status === "承認済"
                    ? "承認を取り消す"
                    : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
          <section className="w-full max-w-[512px] rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <WarningIcon />
                <h2 className="text-xl font-semibold">シフト枠の削除</h2>
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={closeDeleteModal}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
              >
                <XIcon />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#717182]">
              以下のシフト枠を削除します。この操作は元に戻せません。従業員からの希望も同時に削除されます。
            </p>

            <div className="mt-6 rounded-lg bg-[#f7f8fb] px-4 py-4">
              <p className="font-semibold">{getDateLabel(deleteTarget.date)}</p>
              <p className="mt-2 text-sm text-[#475569]">
                {formatShiftTimeRange(
                  deleteTarget.startTime,
                  deleteTarget.endTime,
                )}
                <span className="ml-4">募集 {deleteTarget.capacity}人</span>
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDeleteSlot}
                disabled={isDeleting}
                className="inline-flex h-10 items-center justify-center gap-3 rounded-md bg-[#db1741] text-sm font-semibold text-white transition hover:bg-[#c51239] disabled:cursor-not-allowed disabled:bg-[#c56c7f]"
              >
                <TrashIcon />
                {isDeleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function AdminShiftManagementPage() {
  return (
    <Suspense>
      <AdminShiftManagementContent />
    </Suspense>
  );
}
