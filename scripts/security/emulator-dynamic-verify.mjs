import { spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const appHost = process.env.SECURITY_APP_HOST ?? "127.0.0.1";
const appPort = Number(process.env.SECURITY_APP_PORT ?? 3099);
const timeoutMs = 60_000;
const requestTimeoutMs = 5_000;

class DeferredError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeferredError";
  }
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function parseHost(value, label) {
  const normalized = String(value).trim().replace(/^https?:\/\//, "");
  const match = normalized.match(/^((?:\[[^\]]+\])|(?:[^:]+)):(\d+)$/);
  const host = match?.[1]?.replace(/^\[|\]$/g, "");
  const port = Number(match?.[2]);

  if (!host || !Number.isInteger(port) || !loopbackHosts.has(host)) {
    throw new DeferredError(
      label + " はループバックのhost:portで指定してください。外部Firebaseには接続しません。",
    );
  }

  return { host, port };
}

function urlFor(endpoint) {
  const host = endpoint.host.includes(":") ? "[" + endpoint.host + "]" : endpoint.host;
  return "http://" + host + ":" + endpoint.port;
}

function projectId() {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID) return process.env.FIREBASE_ADMIN_PROJECT_ID;

  try {
    const config = JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8"));
    if (typeof config?.projects?.default === "string") return config.projects.default;
  } catch {
    // The error below gives the actionable prerequisite.
  }

  throw new DeferredError("Firebase project IDが見つかりません。");
}

function commandName(name) {
  return process.platform === "win32" && !name.includes(".") ? name + ".cmd" : name;
}

async function reachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(description, check) {
  const deadline = Date.now() + timeoutMs;
  let detail = "";

  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new DeferredError(
    description + "を確認できませんでした。" + (detail ? "\n" + detail : ""),
  );
}

function tail(value, length = 3000) {
  return value.length > length ? value.slice(-length) : value;
}

function managed(command, args, env) {
  let child;
  try {
    child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32",
    });
  } catch (error) {
    throw new DeferredError(
      command +
        " の子プロセス起動が拒否されました: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }

  const state = { output: "", code: null, error: null };
  child.stdout?.on("data", (chunk) => (state.output += chunk.toString()));
  child.stderr?.on("data", (chunk) => (state.output += chunk.toString()));
  child.on("error", (error) => (state.error = error));
  child.on("close", (code) => (state.code = code));
  return { child, state };
}
function stop(handle) {
  if (!handle || handle.child.exitCode !== null) return;
  if (process.platform === "win32" && handle.child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(handle.child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    handle.child.kill("SIGTERM");
  }
}

function run(command, args, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      });
    } catch (error) {
      rejectPromise(
        new DeferredError(
          command +
            " の子プロセス起動が拒否されました: " +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      return;
    }

    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", (error) =>
      rejectPromise(
        new DeferredError(
          command +
            " の子プロセス起動に失敗しました: " +
            (error instanceof Error ? error.message : String(error)),
        ),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(command + " failed with code " + code + "\n" + tail(output)));
    });
  });
}
function assert(condition, message) {
  if (!condition) throw new Error("検証失敗: " + message);
}

async function json(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSONではないレスポンスです。status=" + response.status + " body=" + tail(text, 1000));
  }
}

async function ensureEmulator(project, firestore, auth) {
  const firestoreReady = await reachable(urlFor(firestore));
  const authReady = await reachable(urlFor(auth));

  if (firestoreReady && authReady) return null;
  if (firestoreReady || authReady) {
    throw new DeferredError("Firestore/Auth Emulatorの片方だけが起動しています。");
  }
  if (process.env.SECURITY_EMULATOR_AUTOSTART === "0") {
    throw new DeferredError("Emulator未起動かつ自動起動が無効です。");
  }

  const handle = managed(
    process.env.FIREBASE_CLI || commandName("firebase"),
    ["emulators:start", "--only", "firestore,auth", "--project", project, "--config", "firebase.json"],
    { ...process.env, CI: "true" },
  );

  try {
    await waitFor("Firestore/Auth Emulator", async () => {
      if (handle.state.error || handle.state.code !== null) {
        throw new Error(
          (handle.state.error?.message || "終了コード" + handle.state.code) +
            "\n" +
            tail(handle.state.output),
        );
      }
      return (await reachable(urlFor(firestore))) && (await reachable(urlFor(auth)));
    });
  } catch (error) {
    stop(handle);
    throw new DeferredError(
      "Emulator自動起動に失敗しました。Java、Firebase CLI、子プロセス権限、一時フォルダを確認してください。\n" +
        (error instanceof Error ? error.message : String(error)) +
        "\n" +
        tail(handle.state.output),
    );
  }

  return handle;
}

async function ensureApp(appUrl, env) {
  if (process.env.SECURITY_SKIP_BUILD !== "1") {
    rmSync(join(root, ".next", "dev"), { recursive: true, force: true });
    console.log("[security:emulator] next buildを実行します。");
    await run(commandName("npm"), ["run", "build"], env);
  }

  const handle = managed(
    commandName("npm"),
    ["run", "start", "--", "--hostname", appHost, "--port", String(appPort)],
    env,
  );

  try {
    await waitFor("Next.js API", async () => {
      if (handle.state.error || handle.state.code !== null) {
        throw new Error(
          (handle.state.error?.message || "終了コード" + handle.state.code) +
            "\n" +
            tail(handle.state.output),
        );
      }
      const response = await fetch(appUrl + "/api/employee/compatibility", {
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      return response.status === 401;
    });
  } catch (error) {
    stop(handle);
    throw new Error(
      "Next.jsアプリの起動確認に失敗しました。\n" +
        (error instanceof Error ? error.message : String(error)) +
        "\n" +
        tail(handle.state.output),
    );
  }

  return handle;
}

async function verifyCompatibility(db, appUrl) {
  const organizationId = "security-dynamic-" + Date.now();
  const ownerId = "employee-owner";
  const duplicateIds = ["employee-duplicate-1", "employee-duplicate-2"];
  const organization = db.collection("organizations").doc(organizationId);
  const employees = [
    {
      id: ownerId,
      employeeId: ownerId,
      email: "owner@example.test",
      name: "山本一郎",
      firstName: "一郎",
      lastName: "山本",
      employmentType: "正社員",
      department: "秘密部署",
      workScore: 5,
      authVersion: "security-auth-version",
    },
    {
      id: duplicateIds[0],
      employeeId: duplicateIds[0],
      email: "duplicate-1@example.test",
      name: "佐藤花子",
      firstName: "花子",
      lastName: "佐藤",
      employmentType: "アルバイト",
      department: "秘密部署",
      workScore: -5,
      authVersion: "security-auth-version",
    },
    {
      id: duplicateIds[1],
      employeeId: duplicateIds[1],
      email: "duplicate-2@example.test",
      name: "佐藤花子",
      firstName: "花子",
      lastName: "佐藤",
      employmentType: "契約社員",
      department: "秘密部署",
      workScore: 4,
      authVersion: "security-auth-version",
    },
  ];

  try {
    await organization.set({ name: "Security verification organization" });
    await Promise.all(
      employees.map(({ id, ...data }) =>
        organization.collection("employees").doc(id).set(data),
      ),
    );
    await organization.collection("compatibilities").doc(ownerId).set({
      employeeId: ownerId,
      organizationId,
      scores: { [duplicateIds[0]]: -2, [duplicateIds[1]]: 4 },
    });

    const login = await fetch(appUrl + "/api/employee/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId, email: "owner@example.test" }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    assert(login.status === 200, "従業員ログインがstatus=" + login.status);
    const setCookie = login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];
    assert(cookie.startsWith("chess-employee-session="), "セッションCookieが発行されていません。");

    const getResponse = await fetch(appUrl + "/api/employee/compatibility", {
      headers: { cookie },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    assert(getResponse.status === 200, "compatibility GETがstatus=" + getResponse.status);
    const getBody = await json(getResponse);
    assert(
      JSON.stringify(getBody.employees) ===
        JSON.stringify([{ name: "佐藤花子 (1)" }, { name: "佐藤花子 (2)" }]),
      "従業員レスポンスが名前のみ、かつ重複名を識別できる形式ではありません。",
    );
    assert(
      JSON.stringify(getBody.scores) === JSON.stringify({ "佐藤花子 (1)": -2, "佐藤花子 (2)": 4 }),
      "既存スコアの表示名変換に失敗しています。",
    );
    assert(
      getBody.employees.every(
        (entry) => Object.keys(entry).length === 1 && typeof entry.name === "string",
      ),
      "従業員レスポンスに不要なフィールドがあります。",
    );

    const postResponse = await fetch(appUrl + "/api/employee/compatibility", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        scores: {
          "佐藤花子 (1)": 1,
          "佐藤花子 (2)": -3,
          [duplicateIds[0]]: 5,
          "佐藤花子": 4,
        },
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    assert(postResponse.status === 200, "compatibility POSTがstatus=" + postResponse.status);
    const postBody = await json(postResponse);
    assert(
      JSON.stringify(postBody.scores) ===
        JSON.stringify({ "佐藤花子 (1)": 1, "佐藤花子 (2)": -3 }),
      "表示名から内部IDへの変換に失敗しています。",
    );

    const stored = (
      await organization.collection("compatibilities").doc(ownerId).get()
    ).data()?.scores ?? {};
    assert(stored[duplicateIds[0]] === 1, "1人目の内部ID保存に失敗しています。");
    assert(stored[duplicateIds[1]] === -3, "2人目の内部ID保存に失敗しています。");
    assert(!Object.hasOwn(stored, "佐藤花子 (1)"), "表示名がFirestoreキーになっています。");
    assert(!Object.hasOwn(stored, "佐藤花子 (2)"), "表示名がFirestoreキーになっています。");

    console.log("[security:emulator] compatibility dynamic verification: PASS");
  } finally {
    await Promise.all([
      ...employees.map(({ id }) => organization.collection("employees").doc(id).delete()),
      organization.collection("compatibilities").doc(ownerId).delete(),
    ]);
    await organization.delete();
  }
}

async function verifyPayroll(db, appUrl) {
  const organizationId = "security-payroll-" + Date.now();
  const employeeId = "employee-payroll";
  const firstSlotId = "payroll-slot-before";
  const secondSlotId = "payroll-slot-after";
  const positionId = "position-payroll";
  const date = (() => {
    const value = new Date();
    value.setDate(value.getDate() + 7);
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  })();
  const organization = db.collection("organizations").doc(organizationId);
  const payrollSettings = {
    hourlyRates: { 正社員: 4000, アルバイト: 1000 },
    nightStartTime: "22:00",
    nightEndTime: "05:00",
    nightMultiplier: 1.25,
  };

  async function fetchShiftData(cookie) {
    const response = await fetch(
      appUrl + "/api/employee/shift-data?month=" + date.slice(0, 7),
      {
        headers: { cookie },
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
    assert(response.status === 200, "shift-dataがstatus=" + response.status);
    return json(response);
  }

  try {
    await organization.set({ name: "Security payroll verification organization" });
    await organization.collection("settings").doc("payroll").set(payrollSettings);
    await organization.collection("settings").doc("shiftRequests").set({
      employeeGeneratedRequestsEnabled: false,
    });
    await organization.collection("positions").doc(positionId).set({
      name: "検証ポジション",
    });
    await organization.collection("employees").doc(employeeId).set({
      employeeId,
      email: "payroll@example.test",
      name: "給与検証従業員",
      firstName: "従業員",
      lastName: "給与検証",
      employmentType: "アルバイト",
      department: "検証部門",
      workScore: 0,
      authVersion: "security-payroll-auth-version",
    });
    await organization.collection("shiftSlots").doc(firstSlotId).set({
      date,
      startTime: "09:00",
      endTime: "11:00",
      positionId,
      positionName: "検証ポジション",
      capacity: 1,
      requestCount: 0,
    });

    const login = await fetch(appUrl + "/api/employee/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId,
        email: "payroll@example.test",
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    assert(login.status === 200, "給与検証用ログインがstatus=" + login.status);
    const setCookie = login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];
    assert(cookie.startsWith("chess-employee-session="), "給与検証用セッションCookieが発行されていません。");

    const firstSubmit = await fetch(appUrl + "/api/employee/shift-requests", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ slotIds: [firstSlotId] }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    assert(firstSubmit.status === 200, "初回シフト希望がstatus=" + firstSubmit.status);

    const firstRequestSnapshot = await organization
      .collection("shiftRequests")
      .where("employeeId", "==", employeeId)
      .get();
    assert(firstRequestSnapshot.size === 1, "初回シフト希望が1件作成されていません。");
    const firstRequestData = firstRequestSnapshot.docs[0].data();
    assert(firstRequestData.payrollSnapshot?.employmentType === "アルバイト", "給与スナップショットの雇用区分が不正です。");
    assert(firstRequestData.payrollSnapshot?.hourlyRate === 1000, "給与スナップショットの時給が不正です。");

    const initialBody = await fetchShiftData(cookie);
    assert(!Object.hasOwn(initialBody, "payrollSettings"), "従業員APIが組織の給与設定を返しています。");
    const initialRequest = initialBody.requests.find((request) => request.slotId === firstSlotId);
    assert(initialRequest, "初回シフト希望が従業員APIに含まれていません。");
    const allowedPayrollKeys = [
      "actualPay",
      "calculatedPay",
      "scheduledPay",
      "totalMinutes",
      "totalPay",
      "usesActualPay",
      "usesActualTime",
    ].sort();
    assert(
      JSON.stringify(Object.keys(initialRequest.employeePayroll).sort()) ===
        JSON.stringify(allowedPayrollKeys),
      "従業員向け給与結果に不要なキーがあります。",
    );
    assert(initialRequest.employeePayroll.totalPay === 2000, "初回給与が申請時点の時給で計算されていません。");

    await organization.collection("settings").doc("payroll").set({
      hourlyRates: { 正社員: 4000, アルバイト: 3000 },
    }, { merge: true });
    await organization.collection("employees").doc(employeeId).set({
      employmentType: "正社員",
    }, { merge: true });

    const afterChangeBody = await fetchShiftData(cookie);
    const unchangedRequest = afterChangeBody.requests.find((request) => request.slotId === firstSlotId);
    assert(unchangedRequest, "設定変更後に既存シフト希望が見つかりません。");
    assert(unchangedRequest.employeePayroll.totalPay === 2000, "既存シフトの給与が後から変更されています。");

    await organization.collection("shiftSlots").doc(secondSlotId).set({
      date,
      startTime: "13:00",
      endTime: "15:00",
      positionId,
      positionName: "検証ポジション",
      capacity: 1,
      requestCount: 0,
    });
    const secondSubmit = await fetch(appUrl + "/api/employee/shift-requests", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ slotIds: [secondSlotId] }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    assert(secondSubmit.status === 200, "設定変更後の新規シフト希望がstatus=" + secondSubmit.status);

    const finalBody = await fetchShiftData(cookie);
    const newRequest = finalBody.requests.find((request) => request.slotId === secondSlotId);
    assert(newRequest, "設定変更後の新規シフト希望が従業員APIに含まれていません。");
    assert(newRequest.employeePayroll.totalPay === 8000, "新規シフトに変更後の給与条件が適用されていません。");

    console.log("[security:emulator] payroll snapshot and employee payroll minimization: PASS");
  } finally {
    const requestSnapshots = await organization.collection("shiftRequests").get();
    await Promise.all([
      ...requestSnapshots.docs.map((snapshot) => snapshot.ref.delete()),
      organization.collection("employees").doc(employeeId).delete(),
      organization.collection("shiftSlots").doc(firstSlotId).delete(),
      organization.collection("shiftSlots").doc(secondSlotId).delete(),
      organization.collection("positions").doc(positionId).delete(),
      organization.collection("settings").doc("payroll").delete(),
      organization.collection("settings").doc("shiftRequests").delete(),
    ]);
    await organization.delete();
  }
}
async function main() {
  const project = projectId();
  const firestore = parseHost(firestoreHost, "FIRESTORE_EMULATOR_HOST");
  const auth = parseHost(authHost, "FIREBASE_AUTH_EMULATOR_HOST");

  if (!loopbackHosts.has(appHost) || !Number.isInteger(appPort) || appPort <= 0 || appPort >= 65536) {
    throw new DeferredError("検証アプリはループバックの有効なポートで起動してください。");
  }

  const appUrl = "http://" + (appHost.includes(":") ? "[" + appHost + "]" : appHost) + ":" + appPort;
  const environment = {
    ...process.env,
    FIREBASE_ADMIN_PROJECT_ID: project,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: project,
    NEXT_PUBLIC_USE_FIRESTORE_EMULATOR: "true",
    FIRESTORE_EMULATOR_HOST: firestore.host + ":" + firestore.port,
    FIREBASE_AUTH_EMULATOR_HOST: auth.host + ":" + auth.port,
    EMPLOYEE_SESSION_SECRET: "security-dynamic-verification-secret",
    NEXT_PUBLIC_APP_URL: appUrl,
  };

  let emulatorHandle = null;
  let appHandle = null;
  let adminApp = null;

  try {
    emulatorHandle = await ensureEmulator(project, firestore, auth);
    console.log(
      "[security:emulator] Emulator ready: Firestore=" +
        urlFor(firestore) +
        " Auth=" +
        urlFor(auth) +
        (emulatorHandle ? " (started by runner)" : " (reused)"),
    );

    appHandle = await ensureApp(appUrl, environment);
    console.log("[security:emulator] Next.js ready: " + appUrl);

    process.env.FIRESTORE_EMULATOR_HOST = environment.FIRESTORE_EMULATOR_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = environment.FIREBASE_AUTH_EMULATOR_HOST;
    process.env.FIREBASE_ADMIN_PROJECT_ID = project;

    const { deleteApp, initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    adminApp = initializeApp({ projectId: project }, "security-dynamic-" + Date.now());
    await verifyCompatibility(getFirestore(adminApp), appUrl);
    await verifyPayroll(getFirestore(adminApp), appUrl);
    await deleteApp(adminApp);
    adminApp = null;
  } finally {
    if (adminApp) {
      const { deleteApp } = await import("firebase-admin/app");
      await deleteApp(adminApp).catch(() => undefined);
    }
    stop(appHandle);
    stop(emulatorHandle);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof DeferredError) {
    console.error("[security:emulator] DEFERRED: " + message);
    process.exitCode = 2;
  } else {
    console.error("[security:emulator] FAILED: " + message);
    process.exitCode = 1;
  }
});
