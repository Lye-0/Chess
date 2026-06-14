import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export const organization = {
  id: "nagoya-engineering",
  name: "名古屋エンジニアリング",
  department: "開発部",
};

const employeesCollection = collection(
  db,
  "organizations",
  organization.id,
  "employees",
);
const employeeSessionKey = "chess-current-employee";
const employeeSessionEvent = "chess-employee-session-change";

export type EmployeeProfile = {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  employmentType: string;
  organization: string;
  department: string;
};

type EmployeeDocument = EmployeeProfile & {
  passwordHash: string;
};

export type EmployeeRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  employmentType: string;
};

export type RegisteredEmployeeResult = {
  employee: EmployeeProfile;
  initialPassword: string;
};

export const fallbackEmployee: EmployeeProfile = {
  id: "E000001",
  employeeId: "E000001",
  firstName: "健一",
  lastName: "田中",
  name: "田中健一",
  email: "tanaka@example.com",
  employmentType: "正社員",
  organization: organization.name,
  department: organization.department,
};

export const employees: EmployeeProfile[] = [fallbackEmployee];
export const currentEmployee = fallbackEmployee;

function toEmployeeProfile(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): EmployeeProfile {
  const data = snapshot.data();
  const employeeId = String(data.employeeId ?? snapshot.id);
  const firstName = String(data.firstName ?? "");
  const lastName = String(data.lastName ?? "");
  const name = String(data.name ?? `${lastName}${firstName}`);

  return {
    id: employeeId,
    employeeId,
    firstName,
    lastName,
    name,
    email: String(data.email ?? ""),
    employmentType: String(data.employmentType ?? ""),
    organization: String(data.organization ?? organization.name),
    department: String(data.department ?? organization.department),
  };
}

function normalizeEmployeeId(employeeId: string) {
  return employeeId.trim().toUpperCase();
}

function createRandomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(8);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    values.forEach((_, index) => {
      values[index] = Math.floor(Math.random() * alphabet.length);
    });
  }

  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

async function hashPassword(password: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("このブラウザではパスワードのハッシュ化に対応していません。");
  }

  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  );

  return Array.from(new Uint8Array(buffer), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

async function createUniqueEmployeeId() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const randomPart = Math.floor(100000 + Math.random() * 900000);
    const employeeId = `E${randomPart}`;
    const snapshot = await getDoc(doc(employeesCollection, employeeId));

    if (!snapshot.exists()) return employeeId;
  }

  throw new Error("従業員IDを生成できませんでした。もう一度登録してください。");
}

export function subscribeEmployees(
  onNext: (employees: EmployeeProfile[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    employeesCollection,
    (snapshot) => {
      const nextEmployees = snapshot.docs
        .map(toEmployeeProfile)
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      onNext(nextEmployees);
    },
    onError,
  );
}

export async function createEmployee(
  input: EmployeeRegistrationInput,
): Promise<RegisteredEmployeeResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const employmentType = input.employmentType.trim();

  if (!firstName || !lastName || !email || !employmentType) {
    throw new Error("必須項目をすべて入力してください。");
  }

  const employeeId = await createUniqueEmployeeId();
  const initialPassword = createRandomPassword();
  const passwordHash = await hashPassword(initialPassword);
  const employee: EmployeeProfile = {
    id: employeeId,
    employeeId,
    firstName,
    lastName,
    name: `${lastName}${firstName}`,
    email,
    employmentType,
    organization: organization.name,
    department: organization.department,
  };

  const document: EmployeeDocument = {
    ...employee,
    passwordHash,
  };

  await setDoc(doc(employeesCollection, employeeId), {
    ...document,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { employee, initialPassword };
}

export async function loginEmployee(employeeId: string, password: string) {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  const snapshot = await getDoc(doc(employeesCollection, normalizedEmployeeId));

  if (!snapshot.exists()) return null;

  const data = snapshot.data() as EmployeeDocument;
  const passwordHash = await hashPassword(password);

  if (data.passwordHash !== passwordHash) return null;

  return toEmployeeProfile(snapshot);
}

export async function changeEmployeePassword(
  employeeId: string,
  currentPassword: string,
  newPassword: string,
) {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  const snapshot = await getDoc(doc(employeesCollection, normalizedEmployeeId));

  if (!snapshot.exists()) return false;
  if (newPassword.length < 8) {
    throw new Error("パスワードは8文字以上で設定してください。");
  }

  const data = snapshot.data() as EmployeeDocument;
  const currentPasswordHash = await hashPassword(currentPassword);

  if (data.passwordHash !== currentPasswordHash) return false;

  await updateDoc(doc(employeesCollection, normalizedEmployeeId), {
    passwordHash: await hashPassword(newPassword),
    updatedAt: serverTimestamp(),
    passwordChangedAt: serverTimestamp(),
  });

  return true;
}

export async function resetEmployeePassword(
  employeeId: string,
): Promise<RegisteredEmployeeResult> {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  const employeeRef = doc(employeesCollection, normalizedEmployeeId);
  const snapshot = await getDoc(employeeRef);

  if (!snapshot.exists()) {
    throw new Error("従業員が見つかりません。");
  }

  const initialPassword = createRandomPassword();

  await updateDoc(employeeRef, {
    passwordHash: await hashPassword(initialPassword),
    updatedAt: serverTimestamp(),
    passwordResetAt: serverTimestamp(),
  });

  return {
    employee: toEmployeeProfile(snapshot),
    initialPassword,
  };
}

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
    const employee = JSON.parse(rawEmployee) as EmployeeProfile;
    if (!employee.employeeId || !employee.name) return null;
    return employee;
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
