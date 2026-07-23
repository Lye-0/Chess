const employeeLoginStorageKey = "chess-remembered-employee-login";
const managerLoginStorageKey = "chess-remembered-manager-login";
const rememberedLoginStorageEvent = "chess-remembered-login-change";
const rememberedLoginVersion = 1;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export const employeeLoginRememberDays = 30;
export const managerLoginRememberDays = 30;

export type RememberedEmployeeLogin = {
  version: typeof rememberedLoginVersion;
  organizationId: string;
  email: string;
  expiresAt: number;
};

export type RememberedManagerLogin = {
  version: typeof rememberedLoginVersion;
  email: string;
  expiresAt: number;
};

type StorageRecord = Record<string, unknown>;

function isStorageRecord(value: unknown): value is StorageRecord {
  return typeof value === "object" && value !== null;
}

function isEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+$/.test(value)
  );
}

function isOrganizationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isExpiresAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRememberedEmployeeLogin(
  value: unknown,
): value is RememberedEmployeeLogin {
  return (
    isStorageRecord(value) &&
    value.version === rememberedLoginVersion &&
    isOrganizationId(value.organizationId) &&
    isEmail(value.email) &&
    isExpiresAt(value.expiresAt)
  );
}

function isRememberedManagerLogin(
  value: unknown,
): value is RememberedManagerLogin {
  return (
    isStorageRecord(value) &&
    value.version === rememberedLoginVersion &&
    isEmail(value.email) &&
    isExpiresAt(value.expiresAt)
  );
}

function removeStoredLogin(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
    window.dispatchEvent(new Event(rememberedLoginStorageEvent));
  } catch {
    // localStorage may be unavailable in privacy-restricted browser contexts.
  }
}

function getStoredLoginSnapshot(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseStoredLogin<T extends { expiresAt: number }>(
  rawValue: string | null,
  isValid: (value: unknown) => value is T,
): T | null {
  if (!rawValue) return null;

  try {
    const value: unknown = JSON.parse(rawValue);
    if (!isValid(value) || value.expiresAt <= Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

function readStoredLogin<T extends { expiresAt: number }>(
  key: string,
  isValid: (value: unknown) => value is T,
): T | null {
  if (typeof window === "undefined") return null;

  const rawValue = getStoredLoginSnapshot(key);
  const value = parseStoredLogin(rawValue, isValid);
  if (rawValue && !value) {
    removeStoredLogin(key);
  }

  return value;
}

function writeStoredLogin(key: string, value: object) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(rememberedLoginStorageEvent));
  } catch {
    // Remembering login input is optional when localStorage is unavailable.
  }
}

function createExpiration(days: number) {
  return Date.now() + days * millisecondsPerDay;
}

export function loadRememberedEmployeeLogin() {
  return readStoredLogin(
    employeeLoginStorageKey,
    isRememberedEmployeeLogin,
  );
}

export function rememberEmployeeLogin(input: {
  organizationId: string;
  email: string;
}) {
  const organizationId = input.organizationId.trim();
  const email = input.email.trim();

  if (!isOrganizationId(organizationId) || !isEmail(email)) return;

  writeStoredLogin(employeeLoginStorageKey, {
    version: rememberedLoginVersion,
    organizationId,
    email,
    expiresAt: createExpiration(employeeLoginRememberDays),
  });
}

export function clearRememberedEmployeeLogin() {
  removeStoredLogin(employeeLoginStorageKey);
}

export function getRememberedEmployeeLoginSnapshot() {
  return getStoredLoginSnapshot(employeeLoginStorageKey);
}

export function parseRememberedEmployeeLoginSnapshot(snapshot: string | null) {
  return parseStoredLogin(snapshot, isRememberedEmployeeLogin);
}

export function loadRememberedManagerLogin() {
  return readStoredLogin(managerLoginStorageKey, isRememberedManagerLogin);
}

export function rememberManagerLogin(input: { email: string }) {
  const email = input.email.trim();

  if (!isEmail(email)) return;

  writeStoredLogin(managerLoginStorageKey, {
    version: rememberedLoginVersion,
    email,
    expiresAt: createExpiration(managerLoginRememberDays),
  });
}

export function clearRememberedManagerLogin() {
  removeStoredLogin(managerLoginStorageKey);
}

export function getRememberedManagerLoginSnapshot() {
  return getStoredLoginSnapshot(managerLoginStorageKey);
}

export function parseRememberedManagerLoginSnapshot(snapshot: string | null) {
  return parseStoredLogin(snapshot, isRememberedManagerLogin);
}

export function getRememberedLoginServerSnapshot() {
  return null;
}

export function subscribeRememberedLogin(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(rememberedLoginStorageEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(rememberedLoginStorageEvent, onStoreChange);
  };
}
