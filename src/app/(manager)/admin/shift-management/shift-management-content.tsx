"use client";

import { Suspense, useMemo, useState } from "react";
import { BackHeader, Card, PlusIcon } from "../../_components/shift-ui";
import {
  getDateLabel,
  getMonthCalendarDays,
  getMonthStart,
  toDateString,
} from "./date-utils";
import { getDisplayedRequestCount } from "./request-utils";
import { useShiftManagement } from "./use-shift-management";
import { AdminShiftCalendar } from "./components/admin-shift-calendar";
import { EmployeeShiftTable } from "./components/employee-shift-table";
import { MemoizedShiftSlotCard } from "./components/shift-slot-card";
import { ShiftFormModal } from "./components/shift-form-modal";
import { DeleteRequestModal } from "./components/delete-request-modal";
import { DeleteSlotModal } from "./components/delete-slot-modal";

function getDateFromString(date: string) {
  return new Date(`${date}T00:00:00`);
}

function isSameMonth(date: string, month: Date) {
  const parsedDate = getDateFromString(date);

  return (
    parsedDate.getFullYear() === month.getFullYear() &&
    parsedDate.getMonth() === month.getMonth()
  );
}

function AdminShiftManagementContent() {
  const [calendarState, setCalendarState] = useState(() => ({
    displayMonth: getMonthStart(new Date()),
    selectedDate: null as string | null,
    hasUserMovedCalendar: false,
  }));
  const {
    organizationId,
    organizationQuery,
    currentOrganization,
    isCheckingOrganization,
    isLoading,
    errorMessage,
    employees,
    requests,
    groupedSlots,
    requestCountBySlot,
    requestsBySlot,
    compatibilityScores,
    employeeWorkScores,
    monthlyRequestMinutesByEmployee,
    payrollSettings,
    positions,
    recommendationSettings,
    selectedWeights,
    isModalOpen,
    isMonthlyPattern,
    setIsMonthlyPattern,
    monthlyPatternCount,
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
  } = useShiftManagement(calendarState.displayMonth);
  const todayDate = useMemo(() => toDateString(new Date()), []);
  const displayMonth = calendarState.displayMonth;
  const selectedDate = useMemo(() => {
    if (
      calendarState.selectedDate &&
      isSameMonth(calendarState.selectedDate, displayMonth)
    ) {
      return calendarState.selectedDate;
    }

    return isSameMonth(todayDate, displayMonth)
      ? todayDate
      : toDateString(displayMonth);
  }, [calendarState.selectedDate, displayMonth, todayDate]);
  const calendarDays = useMemo(
    () => getMonthCalendarDays(displayMonth),
    [displayMonth],
  );
  const calendarSummaryByDate = useMemo(() => {
    return Object.entries(groupedSlots).reduce<
      Record<
        string,
        {
          slotCount: number;
          requestCount: number;
          approvedCount: number;
          capacity: number;
        }
      >
    >((summaries, [date, dateSlots]) => {
      summaries[date] = dateSlots.reduce(
        (summary, slot) => {
          const slotRequests = requestsBySlot[slot.id] ?? [];

          return {
            slotCount: summary.slotCount + 1,
            requestCount:
              summary.requestCount +
              getDisplayedRequestCount(slot, requestCountBySlot),
            approvedCount:
              summary.approvedCount +
              slotRequests.filter((request) => request.status === "承認済").length,
            capacity: summary.capacity + slot.capacity,
          };
        },
        { slotCount: 0, requestCount: 0, approvedCount: 0, capacity: 0 },
      );

      return summaries;
    }, {});
  }, [groupedSlots, requestCountBySlot, requestsBySlot]);
  const selectedDateSlots = selectedDate ? groupedSlots[selectedDate] ?? [] : [];
  const selectedDateSummary = selectedDate
    ? calendarSummaryByDate[selectedDate] ?? null
    : null;
  const selectedDateRequests = useMemo(
    () => requests.filter((request) => request.date === selectedDate),
    [requests, selectedDate],
  );
  const deleteRequestSlotPositionName = useMemo(() => {
    if (!deleteRequestTarget) return "";

    for (const slots of Object.values(groupedSlots)) {
      const slot = slots.find(
        (candidate) => candidate.id === deleteRequestTarget.slotId,
      );
      if (slot) return slot.positionName;
    }

    return "";
  }, [deleteRequestTarget, groupedSlots]);

  function changeDisplayMonth(offset: number) {
    setCalendarState((current) => {
      const nextMonth = new Date(
        current.displayMonth.getFullYear(),
        current.displayMonth.getMonth() + offset,
        1,
      );

      return {
        displayMonth: nextMonth,
        selectedDate: isSameMonth(todayDate, nextMonth)
          ? todayDate
          : toDateString(nextMonth),
        hasUserMovedCalendar: true,
      };
    });
  }

  function selectDate(date: string) {
    setCalendarState({
      displayMonth,
      selectedDate: date,
      hasUserMovedCalendar: true,
    });
  }

  function moveSelectedDate(offset: number) {
    const nextDate = getDateFromString(selectedDate);
    nextDate.setDate(nextDate.getDate() + offset);
    const date = toDateString(nextDate);
    setCalendarState({
      displayMonth: getMonthStart(nextDate),
      selectedDate: date,
      hasUserMovedCalendar: true,
    });
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
            管理者が設定したシフト枠と、従業員から届いた募集枠なしの希望を確認・承認できます。鉛筆アイコンで募集人数を変更できます。
          </p>


          {!isLoading && (
            <AdminShiftCalendar
              displayMonth={displayMonth}
              days={calendarDays}
              selectedDate={selectedDate}
              todayDate={todayDate}
              summaryByDate={calendarSummaryByDate}
              onMonthChange={changeDisplayMonth}
              onSelectDate={selectDate}
            />
          )}

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[170px] flex-col items-center justify-center text-center text-[#717182]">
              <p>シフトを読み込んでいます</p>
            </div>
          ) : selectedDate ? (
            <section className="mt-6 rounded-lg border border-black/10 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {getDateLabel(selectedDate)}のシフト
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-md bg-[#eef2ff] px-2 py-1 text-[#1d4ed8]">
                      {selectedDateSummary?.slotCount ?? 0}枠
                    </span>
                    <span className="rounded-md bg-[#f1f5f9] px-2 py-1 text-[#475569]">
                      希望 {selectedDateSummary?.requestCount ?? 0}人
                    </span>
                    <span className="rounded-md bg-[#f0fdf4] px-2 py-1 text-[#166534]">
                      承認 {selectedDateSummary?.approvedCount ?? 0}/{selectedDateSummary?.capacity ?? 0}人
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                  <button
                    type="button"
                    onClick={() => moveSelectedDate(-1)}
                    className="h-9 rounded-md border border-black/10 px-3 text-sm font-semibold text-[#475569] shadow-sm transition hover:bg-[#eef2f7] disabled:cursor-not-allowed disabled:text-[#b4b7c0] disabled:shadow-none"
                  >
                    前の日
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedDate(1)}
                    className="h-9 rounded-md border border-black/10 px-3 text-sm font-semibold text-[#475569] shadow-sm transition hover:bg-[#eef2f7] disabled:cursor-not-allowed disabled:text-[#b4b7c0] disabled:shadow-none"
                  >
                    次の日
                  </button>
                </div>
              </div>
              <EmployeeShiftTable
                date={selectedDate}
                employees={employees}
                requests={selectedDateRequests}
                positions={positions}
                payrollSettings={payrollSettings}
                organizationId={organizationId}
              />
              {selectedDateSlots.length > 0 ? (
                <>
                  <h3 className="mt-6 text-sm font-semibold">募集枠と希望の詳細</h3>
                  <div className="mt-4 space-y-3">
                  {selectedDateSlots.map((slot) => {
                    const slotRequests = requestsBySlot[slot.id] ?? [];
                    const displayedRequestCount = getDisplayedRequestCount(
                      slot,
                      requestCountBySlot,
                    );
                    const approvingRequestIdForSlot =
                      approvingRequestId !== null &&
                      slotRequests.some(
                        (request) => request.id === approvingRequestId,
                      )
                        ? approvingRequestId
                        : null;
                    const deletingRequestIdForSlot =
                      deletingRequestId !== null &&
                      slotRequests.some(
                        (request) => request.id === deletingRequestId,
                      )
                        ? deletingRequestId
                        : null;

                    return (
                      <MemoizedShiftSlotCard
                        key={slot.id}
                        slot={slot}
                        requests={slotRequests}
                        displayedRequestCount={displayedRequestCount}
                        compatibilityScores={compatibilityScores}
                        employeeWorkScores={employeeWorkScores}
                        monthlyRequestMinutesByEmployee={monthlyRequestMinutesByEmployee}
                        weights={selectedWeights}
                        fairnessEnabled={recommendationSettings.fairnessEnabled}
                        payrollSettings={payrollSettings}
                        approvingRequestId={approvingRequestIdForSlot}
                        deletingRequestId={deletingRequestIdForSlot}
                        isApprovingRecommended={
                          approvingRecommendedSlotId === slot.id
                        }
                        onEdit={openEditModal}
                        onDelete={openDeleteModal}
                        onApproveRequest={handleApproveRequest}
                        onRemoveRequest={openDeleteRequestModal}
                        onApproveRecommended={handleApproveRecommendedRequests}
                      />
                    );
                  })}
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-black/10 px-4 py-5 text-center text-sm text-[#717182]">
                  <p>この日の募集枠や提出済み希望はありません。</p>
                  <p className="mt-1 text-xs">上の表は希望がなくても、30分マスのクリックまたは横ドラッグで確定シフトを直接追加できます。</p>
                </div>
              )}
            </section>
          ) : (
            <div className="mt-6 flex min-h-[170px] flex-col items-center justify-center rounded-lg border border-black/10 text-center text-[#717182]">
              <p>この月に表示できるシフトはありません</p>
              <p className="mt-2 text-sm">別の月を選択してください</p>
            </div>
          )}
        </Card>
      </div>

      {isModalOpen && (
        <ShiftFormModal
          editingId={editingId}
          form={form}
          positions={positions}
          onFormChange={setForm}
          isMonthlyPattern={isMonthlyPattern}
          onMonthlyPatternChange={setIsMonthlyPattern}
          monthlyPatternCount={monthlyPatternCount}
          isEditingRequestedSlot={isEditingRequestedSlot}
          editedSlotStartsInFuture={editedSlotStartsInFuture}
          formStartsInFuture={formStartsInFuture}
          minimumCapacity={minimumCapacity}
          editingApprovedCount={editingApprovedCount}
          capacityValue={capacityValue}
          canSave={canSave}
          isSaving={isSaving}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {deleteRequestTarget && (
        <DeleteRequestModal
          target={deleteRequestTarget}
          slotPositionName={deleteRequestSlotPositionName}
          isProcessing={deletingRequestId === deleteRequestTarget.id}
          onClose={closeDeleteRequestModal}
          onConfirm={confirmDeleteRequest}
        />
      )}

      {deleteTarget && (
        <DeleteSlotModal
          target={deleteTarget}
          isDeleting={isDeleting}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteSlot}
        />
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
