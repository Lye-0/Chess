"use client";

import type { FormEvent } from "react";
import { Suspense, useEffect, useState } from "react";
import {
  createEmployee,
  deleteEmployee,
  defaultWorkScore,
  subscribeEmployees,
  updateEmployee,
  maxWorkScore,
  minWorkScore,
  type EmployeeProfile,
} from "@/lib/people";
import { employmentTypes } from "@/lib/payroll";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";
import {
  BackHeader,
  Card,
  ChevronDownIcon,
  UserPlusIcon,
} from "../../_components/shift-ui";

type EmployeeForm = {
  lastName: string;
  firstName: string;
  email: string;
  employmentType: string;
  workScore: string;
};

const emptyForm: EmployeeForm = {
  lastName: "",
  firstName: "",
  email: "",
  employmentType: employmentTypes[0],
  workScore: String(defaultWorkScore),
};

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

function formatScore(score: number | string) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) return "0";
  if (numericScore > 0) return `+${numericScore}`;
  return String(numericScore);
}

function WorkScoreField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-semibold">
          シゴデキ度
        </label>
        <span className="inline-flex h-8 min-w-14 items-center justify-center rounded-md bg-[#eef2ff] px-3 font-mono text-sm font-semibold text-[#1d4ed8]">
          {formatScore(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={minWorkScore}
        max={maxWorkScore}
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full accent-[#1d4ed8]"
      />
      <div className="mt-2 flex justify-between text-xs font-semibold text-[#717182]">
        <span>{minWorkScore}</span>
        <span>0</span>
        <span>+{maxWorkScore}</span>
      </div>
    </div>
  );
}

function AdminEmployeeRegistrationContent() {
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editForm, setEditForm] = useState<EmployeeForm>(emptyForm);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeProfile | null>(null);
  const [registeredEmployees, setRegisteredEmployees] = useState<EmployeeProfile[]>([]);
  const [createdEmployee, setCreatedEmployee] = useState<EmployeeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canSubmit =
    Boolean(form.lastName.trim()) &&
    Boolean(form.firstName.trim()) &&
    Boolean(form.email.trim()) &&
    !isSaving;
  const canUpdate =
    Boolean(editForm.lastName.trim()) &&
    Boolean(editForm.firstName.trim()) &&
    Boolean(editForm.email.trim()) &&
    !isUpdating;

  useEffect(() => {
    if (!currentOrganization) return;

    return subscribeEmployees(
      (employees) => {
        setRegisteredEmployees(employees);
        setIsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsLoading(false);
        setErrorMessage("従業員一覧の読み込みに失敗しました。Firestoreの設定を確認してください。");
      },
      organizationId,
    );
  }, [currentOrganization, organizationId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      const employee = await createEmployee(form, organizationId);
      setCreatedEmployee(employee);
      setSuccessMessage(`${employee.name}さんを登録しました。`);
      setForm(emptyForm);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "従業員の登録に失敗しました。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function openEditModal(employee: EmployeeProfile) {
    const editableEmploymentType = employmentTypes.includes(employee.employmentType)
      ? employee.employmentType
      : employmentTypes[0];

    setEditingEmployee(employee);
    setEditForm({
      lastName: employee.lastName,
      firstName: employee.firstName,
      email: employee.email,
      employmentType: editableEmploymentType,
      workScore: String(employee.workScore),
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function closeEditModal() {
    if (isUpdating) return;

    setEditingEmployee(null);
    setEditForm(emptyForm);
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingEmployee || !canUpdate) return;

    try {
      setIsUpdating(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      const employee = await updateEmployee(
        editingEmployee.employeeId,
        editForm,
        organizationId,
      );
      setCreatedEmployee(null);
      setSuccessMessage(`${employee.name}さんの情報を更新しました。`);
      setEditingEmployee(null);
      setEditForm(emptyForm);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "従業員情報の更新に失敗しました。",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  function openDeleteModal(employee: EmployeeProfile) {
    setDeleteTarget(employee);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function closeDeleteModal() {
    if (isDeleting) return;

    setDeleteTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      await deleteEmployee(deleteTarget.employeeId, organizationId);
      setCreatedEmployee(null);
      setSuccessMessage(`${deleteTarget.name}さんのアカウントを削除しました。`);
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "従業員アカウントの削除に失敗しました。",
      );
    } finally {
      setIsDeleting(false);
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
      <BackHeader backHref={`/admin${organizationQuery}`} />

      <div className="mx-auto max-w-[864px] px-4 py-8 sm:px-6 lg:px-0">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">従業員登録</h1>
          <p className="mt-1 text-sm text-[#717182]">
            選択中の組織に従業員を追加します
          </p>

          {createdEmployee && (
            <div className="mt-6 rounded-lg border border-[#b7dfc7] bg-[#effbf3] p-4">
              <p className="font-semibold text-[#007a2f]">登録が完了しました</p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-[#475569]">氏名</p>
                  <p className="mt-1 font-semibold">{createdEmployee.name}</p>
                </div>
                <div>
                  <p className="text-[#475569]">従業員ID</p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {createdEmployee.employeeId}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[#475569]">メールアドレス</p>
                  <p className="mt-1">{createdEmployee.email}</p>
                </div>
                <div>
                  <p className="text-[#475569]">シゴデキ度</p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {formatScore(createdEmployee.workScore)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#475569]">
                従業員は所属組織IDとこのメールアドレスでログインできます。希望シフトは従業員IDに紐づきます。
              </p>
            </div>
          )}

          {successMessage && !createdEmployee && (
            <div className="mt-6 rounded-md border border-[#b7dfc7] bg-[#effbf3] px-4 py-3 text-sm font-semibold text-[#007a2f]">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mt-6 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          <form className="mt-8" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="last-name" className="block text-sm font-semibold">
                  姓
                </label>
                <input
                  id="last-name"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm({ ...form, lastName: event.target.value })
                  }
                  placeholder="例：田中"
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none placeholder:text-[#717182] focus:border-[#030213]"
                />
              </div>

              <div>
                <label htmlFor="first-name" className="block text-sm font-semibold">
                  名
                </label>
                <input
                  id="first-name"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm({ ...form, firstName: event.target.value })
                  }
                  placeholder="例：太郎"
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none placeholder:text-[#717182] focus:border-[#030213]"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="employee-email" className="block text-sm font-semibold">
                  メールアドレス
                </label>
                <input
                  id="employee-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="例：tanaka@example.com"
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none placeholder:text-[#717182] focus:border-[#030213]"
                />
              </div>
            </div>

            <div className="mt-5 max-w-xs">
              <label htmlFor="employment-type" className="block text-sm font-semibold">
                雇用形態
              </label>
              <div className="relative mt-2">
                <select
                  id="employment-type"
                  value={form.employmentType}
                  onChange={(event) =>
                    setForm({ ...form, employmentType: event.target.value })
                  }
                  className="h-10 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-10 text-sm font-semibold shadow-sm outline-none focus:border-[#030213]"
                >
                  {employmentTypes.map((employmentType) => (
                    <option key={employmentType}>{employmentType}</option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
              </div>
            </div>

            <WorkScoreField
              id="work-score"
              value={form.workScore}
              onChange={(workScore) => setForm({ ...form, workScore })}
            />

            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                "mt-4 inline-flex h-10 items-center gap-3 rounded-md px-5 text-sm font-semibold text-white shadow-sm transition",
                canSubmit
                  ? "bg-[#030213] hover:bg-[#171624]"
                  : "cursor-not-allowed bg-[#8e8d95]",
              ].join(" ")}
            >
              <UserPlusIcon className="h-4 w-4" />
              {isSaving ? "登録中..." : "登録"}
            </button>
          </form>
        </Card>

        <Card className="mt-6 min-h-[202px] p-6">
          <h2 className="text-xl font-semibold">
            登録済み従業員（{registeredEmployees.length}名）
          </h2>
          <p className="mt-1 text-sm text-[#717182]">この組織の従業員一覧</p>

          {isLoading ? (
            <div className="flex min-h-28 items-center justify-center text-center text-[#717182]">
              <p>従業員を読み込んでいます</p>
            </div>
          ) : registeredEmployees.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center text-center text-[#717182]">
              <p>まだ従業員が登録されていません</p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {registeredEmployees.map((employee) => (
                <div
                  key={employee.employeeId}
                  className="rounded-lg border border-black/10 px-4 py-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{employee.name}</p>
                      <p className="mt-1 text-sm text-[#475569]">
                        {employee.email}
                        <span className="ml-4">{employee.employmentType}</span>
                        <span className="ml-4 font-mono">
                          シゴデキ {formatScore(employee.workScore)}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-fit rounded-md bg-[#eef2ff] px-3 py-1 font-mono text-sm font-semibold text-[#1d4ed8]">
                        {employee.employeeId}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditModal(employee)}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
                      >
                        <PencilIcon />
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteModal(employee)}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-[#ffd0d9] bg-white px-3 text-xs font-semibold text-[#db1741] shadow-sm transition hover:bg-[#fff1f4]"
                      >
                        <TrashIcon />
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
          <form
            onSubmit={handleUpdate}
            className="w-full max-w-[560px] rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">従業員情報を編集</h2>
                <p className="mt-1 text-sm text-[#717182]">
                  従業員IDは変更されません。メールアドレスを変更しても希望シフトは従業員IDに紐づいたままです。
                </p>
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={closeEditModal}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
              >
                <XIcon />
              </button>
            </div>

            <div className="mt-6 rounded-md bg-[#f7f8fb] px-4 py-3">
              <p className="text-xs text-[#717182]">従業員ID</p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {editingEmployee.employeeId}
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="edit-last-name" className="block text-sm font-semibold">
                  姓
                </label>
                <input
                  id="edit-last-name"
                  value={editForm.lastName}
                  onChange={(event) =>
                    setEditForm({ ...editForm, lastName: event.target.value })
                  }
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
              </div>

              <div>
                <label htmlFor="edit-first-name" className="block text-sm font-semibold">
                  名
                </label>
                <input
                  id="edit-first-name"
                  value={editForm.firstName}
                  onChange={(event) =>
                    setEditForm({ ...editForm, firstName: event.target.value })
                  }
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="edit-email" className="block text-sm font-semibold">
                  メールアドレス
                </label>
                <input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm({ ...editForm, email: event.target.value })
                  }
                  className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
                />
              </div>
            </div>

            <div className="mt-5 max-w-xs">
              <label htmlFor="edit-employment-type" className="block text-sm font-semibold">
                雇用形態
              </label>
              <div className="relative mt-2">
                <select
                  id="edit-employment-type"
                  value={editForm.employmentType}
                  onChange={(event) =>
                    setEditForm({ ...editForm, employmentType: event.target.value })
                  }
                  className="h-10 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-10 text-sm font-semibold shadow-sm outline-none focus:border-[#030213]"
                >
                  {employmentTypes.map((employmentType) => (
                    <option key={employmentType}>{employmentType}</option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717182]" />
              </div>
            </div>

            <WorkScoreField
              id="edit-work-score"
              value={editForm.workScore}
              onChange={(workScore) => setEditForm({ ...editForm, workScore })}
            />

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isUpdating}
                className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!canUpdate}
                className={[
                  "h-10 rounded-md text-sm font-semibold text-white transition",
                  canUpdate
                    ? "bg-[#030213] hover:bg-[#171624]"
                    : "cursor-not-allowed bg-[#8e8d95]",
                ].join(" ")}
              >
                {isUpdating ? "更新中..." : "更新する"}
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
                <h2 className="text-xl font-semibold">従業員アカウントの削除</h2>
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
              この従業員アカウントを削除します。この操作は元に戻せません。提出済みのシフト希望も同時に削除されます。
            </p>

            <div className="mt-6 rounded-lg bg-[#f7f8fb] px-4 py-4">
              <p className="font-semibold">{deleteTarget.name}</p>
              <p className="mt-2 text-sm text-[#475569]">
                {deleteTarget.email}
                <span className="ml-4">{deleteTarget.employmentType}</span>
              </p>
              <p className="mt-2 font-mono text-sm font-semibold text-[#1d4ed8]">
                {deleteTarget.employeeId}
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
                onClick={handleDelete}
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

export default function AdminEmployeeRegistrationPage() {
  return (
    <Suspense>
      <AdminEmployeeRegistrationContent />
    </Suspense>
  );
}
