"use client";

import { Suspense } from "react";
import { BackHeader, Card, PlusIcon } from "../../_components/shift-ui";
import { getDateLabel } from "./date-utils";
import { getDisplayedRequestCount } from "./request-utils";
import { useShiftManagement } from "./use-shift-management";
import { WeightSelector } from "./components/weight-selector";
import { MemoizedShiftSlotCard } from "./components/shift-slot-card";
import { ShiftFormModal } from "./components/shift-form-modal";
import { DeleteRequestModal } from "./components/delete-request-modal";
import { DeleteSlotModal } from "./components/delete-slot-modal";
import { ShiftExportMenu } from "@/components/ui/shift-export-menu";

function AdminShiftManagementContent() {
  const {
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
  } = useShiftManagement();

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
          <div className="flex items-center gap-2">
            <ShiftExportMenu
              formats={[
                { format: "pdf", label: "PDFをダウンロード" },
                { format: "csv", label: "CSVをダウンロード" },
              ]}
              months={exportMonths}
              selectedMonth={activeExportMonth}
              onMonthChange={setSelectedExportMonth}
              onExport={handleExport}
              disabled={isLoading}
              hasData={hasExportData}
              scopeOptions={[
                { scope: "month", label: "月単位" },
                { scope: "monthDaily", label: "月単位（一日ずつ）" },
                { scope: "day", label: "日単位" },
              ]}
              selectedScope={selectedExportScope}
              onScopeChange={setSelectedExportScope}
              dates={exportDates}
              selectedDate={activeExportDate}
              onDateChange={setSelectedExportDate}
            />
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#030213] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#171624]"
            >
              <PlusIcon />
              シフト枠を追加
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1248px] px-4 py-8 sm:px-6 lg:px-0">
        <Card className="min-h-[260px] p-6">
          <h1 className="text-xl font-semibold">シフト管理</h1>
          <p className="mt-2 text-sm text-[#717182]">
            ここで設定したシフト枠のみ従業員が希望を出せます。鉛筆アイコンで募集人数を変更できます。
          </p>

          <WeightSelector
            selectedWeightId={selectedWeightId}
            onSelect={setSelectedWeightId}
          />

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[170px] flex-col items-center justify-center text-center text-[#717182]">
              <p>シフトを読み込んでいます</p>
            </div>
          ) : Object.keys(groupedSlots).length === 0 ? (
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
                          weights={selectedWeights}
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
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

      {isModalOpen && (
        <ShiftFormModal
          editingId={editingId}
          form={form}
          onFormChange={setForm}
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
