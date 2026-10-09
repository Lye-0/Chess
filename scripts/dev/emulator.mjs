import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);
const projectId = "demo-chess-dev";
const loginPath = resolve(root, ".local/emulator-login.json");
const dataPath = resolve(root, ".local/firebase-data");
const mode = process.argv[2];

function savedLogin() {
  mkdirSync(dirname(loginPath), { recursive: true });
  if (!existsSync(loginPath)) {
    writeFileSync(loginPath, JSON.stringify({
      projectId,
      email: "developer@example.test",
      password: "Dev-" + randomBytes(18).toString("base64url") + "!",
      loginUrl: "http://127.0.0.1:3001/login/manager",
    }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  }
  const login = JSON.parse(readFileSync(loginPath, "utf8"));
  if (login.projectId !== projectId || typeof login.email !== "string" ||
      typeof login.password !== "string" || login.password.length < 6) {
    throw new Error(".local/emulator-login.json の設定を確認してください。");
  }
  if (login.loginUrl !== "http://127.0.0.1:3001/login/manager") {
    login.loginUrl = "http://127.0.0.1:3001/login/manager";
    writeFileSync(loginPath, JSON.stringify(login, null, 2) + "\n", { mode: 0o600 });
  }
  return login;
}

// Explicit overrides keep .env.local service-account credentials and production
// Firebase configuration out of this development process.
const environment = {
  ...process.env,
  NODE_ENV: "development",
  CHESS_EMULATOR_DEV: "true",
  NEXT_PUBLIC_USE_FIRESTORE_EMULATOR: "true",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_ADMIN_PROJECT_ID: projectId,
  FIREBASE_ADMIN_CLIENT_EMAIL: "",
  FIREBASE_ADMIN_PRIVATE_KEY: "",
  GOOGLE_APPLICATION_CREDENTIALS: "",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: "fake-emulator-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: projectId + ".firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: projectId + ".appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:emulator",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3001",
  EMPLOYEE_SESSION_SECRET: "local-emulator-development-session-secret-only",
};

// mise's Windows shim may be blocked by application control even when the
// installed JDK works. Prefer JAVA_HOME, then the project's mise Java 21.
const javaHomes = [process.env.JAVA_HOME];
if (process.platform === "win32" && process.env.LOCALAPPDATA) {
  const installs = resolve(process.env.LOCALAPPDATA, "mise/installs/java");
  if (existsSync(installs)) {
    javaHomes.push(...readdirSync(installs).filter((name) => name.startsWith("temurin-21"))
      .sort().reverse().map((name) => resolve(installs, name)));
  }
}
const javaHome = javaHomes.find((home) => home && existsSync(resolve(home, "bin",
  process.platform === "win32" ? "java.exe" : "java")));
if (javaHome) {
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
  environment[pathKey] = resolve(javaHome, "bin") + delimiter + (environment[pathKey] ?? "");
}

async function seed() {
  // Never initialize the Admin SDK unless both explicit local endpoints exist.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
      (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId)) {
    throw new Error("demo-chess-dev のローカルエミュレーター専用です。");
  }
  const login = savedLogin();
  const { initializeApp, deleteApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const app = initializeApp({ projectId }, "development-seed");
  try {
    const auth = getAuth(app);
    let user;
    try {
      user = await auth.getUserByEmail(login.email);
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
    }
    const properties = {
      email: login.email, password: login.password,
      emailVerified: true, disabled: false, displayName: "開発用管理者",
    };
    if (user) await auth.updateUser(user.uid, properties);
    else await auth.createUser({ uid: "chess-development-manager", ...properties });
    console.log("[emulator] 開発用管理者を用意しました: " + login.email);
    console.log("[emulator] ログイン情報: .local/emulator-login.json");
  } finally {
    await deleteApp(app);
  }
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root, env: environment, stdio: "inherit", windowsHide: true,
    });
    // Windows broadcasts console Ctrl+C to the whole process group. Killing
    // the CLI here would interrupt its export-on-exit cleanup.
    const stop = () => {
      if (process.platform !== "win32") child.kill("SIGINT");
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.once("error", reject);
    child.once("close", (code) => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolvePromise(code ?? 1);
    });
  });
}

try {
  savedLogin();
  if (mode === "--app") {
    await seed();
    process.exitCode = await run(process.execPath, [
      "node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3001",
    ]);
  } else if (mode === "--seed") {
    // Seed an already-running emulator, without starting Next.js.
    Object.assign(process.env, environment);
    await seed();
  } else if (!mode) {
    const args = ["--cache", ".local/npm-cache", "-y", "firebase-tools@latest", "emulators:exec", "--ui", "--only", "firestore,auth",
      "--project", projectId, "--config", "firebase.json",
      "--export-on-exit", ".local/firebase-data"];
    if (existsSync(resolve(dataPath, "firebase-export-metadata.json"))) {
      args.push("--import", ".local/firebase-data");
    }
    args.push("node scripts/dev/emulator.mjs --app");
    console.log("[emulator] 起動後: http://127.0.0.1:3001/login/manager");
    console.log("[emulator] Ctrl+C で終了するとデータを .local/firebase-data に保存します。");
    const npxCli = process.env.npm_execpath
      ? resolve(dirname(process.env.npm_execpath), "npx-cli.js")
      : resolve(dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
    process.exitCode = await run(process.execPath, [npxCli, ...args]);
  } else {
    throw new Error("不明なオプション: " + mode);
  }
} catch (error) {
  console.error("[emulator] " + error.message);
  process.exitCode = 1;
}
