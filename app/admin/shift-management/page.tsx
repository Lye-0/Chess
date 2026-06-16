"use client";

import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  createShiftSlot,
  isFourDigitShiftDate,
  removeShiftSlot,
  subscribeShiftSlots,
  updateShiftSlot,
  type ShiftSlot,
  type ShiftSlotInput,
} from "@/lib/shiftSlots";
import {
  approveShiftRequest,
  subscribeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import { defaultOrganizationId } from "@/lib/people";
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

const emptyForm: ShiftForm = {
  date: "",
  startTime: "",
  endTime: "",
  capacity: "1",
};

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

function ShiftRequestGroup({
  title,
  requests,
  emptyText,
  approvingRequestId,
  onApprove,
}: {
  title: string;
  requests: ShiftRequest[];
  emptyText: string;
  approvingRequestId: string | null;
  onApprove: (request: ShiftRequest) => void;
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
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <RequestStatusBadge status={request.status} />
                  {!approved && (
                    <button
                      type="button"
                      disabled={approving}
                      onClick={() => onApprove(request)}
                      className="h-8 rounded-md bg-[#030213] px-3 text-xs font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
                    >
                      {approving ? "承認中..." : "承認"}
                    </button>
                  )}
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
  const searchParams = useSearchParams();
  const selectedOrganizationId = searchParams.get("organizationId")?.trim();
  const organizationId = selectedOrganizationId || defaultOrganizationId;
  const organizationQuery = `?organizationId=${encodeURIComponent(organizationId)}`;
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShiftSlot | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
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

    return () => {
      unsubscribeSlots();
      unsubscribeRequests();
    };
  }, [organizationId]);

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

  const canSave = Boolean(
    isFourDigitShiftDate(form.date) &&
    form.startTime &&
    form.endTime &&
    form.startTime < form.endTime &&
    Number(form.capacity) >= 1 &&
    Number(form.capacity) <= 100,
  );
  const requestCountBySlot = useMemo(() => {
    return requests.reduce<Record<string, number>>((counts, request) => {
      counts[request.slotId] = (counts[request.slotId] ?? 0) + 1;
      return counts;
    }, {});
  }, [requests]);
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
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      capacity: Number(form.capacity),
    };

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
      setErrorMessage("シフト枠の保存に失敗しました。Firestore への書き込み権限を確認してください。");
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

  async function handleApproveRequest(request: ShiftRequest) {
    if (request.status === "承認済") return;

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
                      const approvedRequests = slotRequests.filter(
                        (request) => request.status === "承認済",
                      );
                      const pendingRequests = slotRequests.filter(
                        (request) => request.status !== "承認済",
                      );

                      return (
                        <div
                          key={slot.id}
                          className="rounded-lg bg-[#f7f8fb] px-4 py-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <p className="font-semibold">
                                  {slot.startTime} - {slot.endTime}
                                </p>
                                <p className="text-sm text-[#475569]">募集: {slot.capacity}人</p>
                              </div>
                              <SlotRequestStatus requestCount={requestCountBySlot[slot.id] ?? 0} />
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

                          {slotRequests.length > 0 && (
                            <div className="mt-4 grid gap-3 border-t border-black/10 pt-3 lg:grid-cols-2">
                              <ShiftRequestGroup
                                title="承認待ち"
                                requests={pendingRequests}
                                emptyText="承認待ちの希望はありません"
                                approvingRequestId={approvingRequestId}
                                onApprove={handleApproveRequest}
                              />
                              <ShiftRequestGroup
                                title="承認済み"
                                requests={approvedRequests}
                                emptyText="承認済みの希望はありません"
                                approvingRequestId={approvingRequestId}
                                onApprove={handleApproveRequest}
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
                  onChange={(event) => {
                    const nextDate = normalizeDateInput(event.target.value);
                    if (nextDate === null) return;

                    setForm({ ...form, date: nextDate });
                  }}
                  className="mt-2 h-10 w-full rounded-md border border-black/20 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
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
                    onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
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
                    onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="shift-capacity" className="block text-sm font-semibold">
                  募集人数（1〜100人）
                </label>
                <input
                  id="shift-capacity"
                  type="number"
                  min="1"
                  max="100"
                  value={form.capacity}
                  onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
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
                {deleteTarget.startTime} - {deleteTarget.endTime}
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
