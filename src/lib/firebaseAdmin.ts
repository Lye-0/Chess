import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

function getPrivateKey() {
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  return privateKey?.replace(/\\n/g, "\n");
}

function configureFirebaseEmulators() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === "true"
  ) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  }
}

function isLoopbackEmulatorHost(value: string | undefined) {
  const normalized = value?.replace(/^https?:\/\//, "").trim() ?? "";
  const host = normalized.startsWith("[")
    ? normalized.slice(1, normalized.indexOf("]"))
    : normalized.slice(0, normalized.lastIndexOf(":"));

  return ["127.0.0.1", "localhost", "::1"].includes(host);
}

function isFirebaseEmulatorConfigured() {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  return (
    isLoopbackEmulatorHost(firestoreHost) &&
    (!authHost || isLoopbackEmulatorHost(authHost))
  );
}

export async function getAdminApp(): Promise<App> {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  configureFirebaseEmulators();
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId) {
    throw new Error("Firebase Admin SDKの環境変数が設定されていません。");
  }

  // Emulator requests are local-only and do not require a production service
  // account. This also lets security verification run in an isolated clone
  // where .env.local and its credentials are intentionally unavailable.
  if (isFirebaseEmulatorConfigured()) {
    return initializeApp({ projectId });
  }

  if (!clientEmail || !privateKey) {
    throw new Error("Firebase Admin SDKの環境変数が設定されていません。");
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export async function getAdminAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase-admin/auth");

  return getAuth(await getAdminApp());
}

export async function getAdminDb(): Promise<Firestore> {
  const { getFirestore } = await import("firebase-admin/firestore");

  return getFirestore(await getAdminApp());
}
