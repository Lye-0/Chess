import {
  defaultOrganizationId,
  organization,
  type EmployeeProfile,
} from "./employees";

const employeeSessionKey = "chess-current-employee";
const employeeSessionEvent = "chess-employee-session-change";

export function saveEmployeeSession(employee: EmployeeProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(employeeSessionKey, JSON.stringify(employee));
  window.dispatchEvent(new Event(employeeSessionEvent));
}

function readEmployeeSessionString() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(employeeSessionKey);
}

function parseEmployeeSession(rawEmployee: string | null) {
  if (!rawEmployee) return null;

  try {
    const employee = JSON.parse(rawEmployee) as Partial<EmployeeProfile>;
    if (!employee.id || !employee.name || !employee.email) return null;

    const employeeId = String(employee.employeeId ?? employee.id);

    return {
      id: String(employee.id),
      organizationId: String(employee.organizationId ?? defaultOrganizationId),
      employeeId,
      firstName: String(employee.firstName ?? ""),
      lastName: String(employee.lastName ?? ""),
      name: String(employee.name),
      email: String(employee.email),
      employmentType: String(employee.employmentType ?? ""),
      organization: String(employee.organization ?? organization.name),
      department: String(employee.department ?? organization.department),
    };
  } catch {
    return null;
  }
}

export function loadEmployeeSession() {
  return parseEmployeeSession(readEmployeeSessionString());
}

export function getEmployeeSessionSnapshot() {
  return readEmployeeSessionString();
}

export function getEmployeeSessionServerSnapshot() {
  return null;
}

export function subscribeEmployeeSession(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(employeeSessionEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(employeeSessionEvent, onStoreChange);
  };
}

export function parseEmployeeSessionSnapshot(snapshot: string | null) {
  return parseEmployeeSession(snapshot);
}

export function clearEmployeeSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(employeeSessionKey);
  window.dispatchEvent(new Event(employeeSessionEvent));
}
