import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

function getPrivateKey() {
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  return privateKey?.replace(/\\n/g, "\n");
}

export async function getAdminApp(): Promise<App> {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
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
