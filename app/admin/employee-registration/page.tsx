"use client";

import type { FormEvent } from "react";
import { Suspense, useEffect, useState } from "react";
import {
  createEmployee,
  subscribeEmployees,
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
};

const emptyForm: EmployeeForm = {
  lastName: "",
  firstName: "",
  email: "",
  employmentType: employmentTypes[0],
};

function AdminEmployeeRegistrationContent() {
  const {
    organizationId,
    organizationQuery,
    organization: currentOrganization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [registeredEmployees, setRegisteredEmployees] = useState<EmployeeProfile[]>([]);
  const [createdEmployee, setCreatedEmployee] = useState<EmployeeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canSubmit =
    Boolean(form.lastName.trim()) &&
    Boolean(form.firstName.trim()) &&
    Boolean(form.email.trim()) &&
    !isSaving;

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
      const employee = await createEmployee(form, organizationId);
      setCreatedEmployee(employee);
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
              </div>
              <p className="mt-3 text-xs text-[#475569]">
                従業員は所属組織IDとこのメールアドレスでログインできます。希望シフトは従業員IDに紐づきます。
              </p>
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
                      </p>
                    </div>
                    <span className="w-fit rounded-md bg-[#eef2ff] px-3 py-1 font-mono text-sm font-semibold text-[#1d4ed8]">
                      {employee.employeeId}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
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
