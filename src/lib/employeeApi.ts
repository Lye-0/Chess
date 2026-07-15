import type { PayrollSettings } from "./payroll";
import type { ShiftRequest } from "./shiftRequests";
import type { ShiftRequestSettings } from "./shiftRequestSettings";
import type { ShiftSlot } from "./shiftSlots";
import type { OrganizationPosition } from "./managerOrganizations";
import type { CompatibilityScores } from "./compatibilities";

export type EmployeeShiftData = {
  requests: ShiftRequest[];
  slots: ShiftSlot[];
  positions: OrganizationPosition[];
  payrollSettings: PayrollSettings;
  shiftRequestSettings: ShiftRequestSettings;
};

export type EmployeeCompatibilityData = {
  employees: EmployeeCompatibilityTarget[];
  scores: CompatibilityScores;
};

export type EmployeeCompatibilityTarget = {
  name: string;
};

async function readApiResponse<T>(response: Response, fallbackMessage: string) {
  const result = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok || !result) {
    throw new Error(result?.error ?? fallbackMessage);
  }

  return result as T;
}

export type EmployeeShiftDataPeriod = string | {
  month?: string;
  year?: string;
};

export async function fetchEmployeeShiftData(period?: EmployeeShiftDataPeriod) {
  const searchParams = new URLSearchParams();

  if (typeof period === "string") {
    searchParams.set("month", period);
  } else {
    if (period?.month) {
      searchParams.set("month", period.month);
    }

    if (period?.year) {
      searchParams.set("year", period.year);
    }
  }
  const response = await fetch(
    `/api/employee/shift-data${searchParams.size > 0 ? `?${searchParams}` : ""}`,
    {
      cache: "no-store",
    },
  );

  return readApiResponse<EmployeeShiftData>(
    response,
    "従業員データの読み込みに失敗しました。",
  );
}

export async function fetchEmployeeCompatibilityData() {
  const response = await fetch("/api/employee/compatibility", {
    cache: "no-store",
  });

  return readApiResponse<EmployeeCompatibilityData>(
    response,
    "働きやすさ設定の読み込みに失敗しました。",
  );
}

export async function saveEmployeeCompatibilityScores(scores: CompatibilityScores) {
  const response = await fetch("/api/employee/compatibility", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scores }),
  });

  return readApiResponse<{ scores: CompatibilityScores }>(
    response,
    "働きやすさ設定の保存に失敗しました。",
  );
}
