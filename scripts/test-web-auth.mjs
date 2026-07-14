import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convexCli = path.join(process.cwd(), "node_modules", "convex", "bin", "main.js");

function call(name, args = {}) {
  const result = spawnSync(process.execPath, [convexCli, "run", name, JSON.stringify(args)], { encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function must(name, args = {}) {
  const result = call(name, args);
  if (!result.ok) throw new Error(`${name} failed: ${redact(result.stderr)}`);
  return JSON.parse(result.stdout);
}

const seeded = must("webPreview:seedPreviewAccess", { label: "auth-regression" });
const userId = seeded.userId;
const firstToken = tokenFromUrl(seeded.url);
const firstSignIn = must("auth:signIn", authArgs(firstToken));
if (!firstSignIn.tokens?.token || !firstSignIn.tokens?.refreshToken) {
  throw new Error("The first exchange did not establish a Convex Auth session");
}
if (call("auth:signIn", authArgs(firstToken)).ok) {
  throw new Error("A single-use link was accepted twice");
}

const secondUser = must("webPreview:seedPreviewAccess", { label: "auth-regression-other-user" });
const secondSignIn = must("auth:signIn", authArgs(tokenFromUrl(secondUser.url)));
await assertCrossUserIsolation(firstSignIn.tokens.token, secondSignIn.tokens.token);
await assertFullResetWorkflow();

const supersededToken = tokenFromUrl(must("webAuth:issueWebLoginLink", { userId }).url);
const currentToken = tokenFromUrl(must("webAuth:issueWebLoginLink", { userId }).url);
if (call("auth:signIn", authArgs(supersededToken)).ok) {
  throw new Error("A superseded pending link was accepted");
}
const currentSignIn = must("auth:signIn", authArgs(currentToken));
if (!currentSignIn.tokens?.token) throw new Error("The current link did not establish a session");

const expiredToken = randomBytes(32).toString("base64url");
const now = Date.now();
must("webAuth:storeWebLoginLink", {
  userId,
  tokenDigest: createHash("sha256").update(expiredToken).digest("base64url"),
  createdAt: now - 600_000,
  expiresAt: now - 1,
});
if (call("auth:signIn", authArgs(expiredToken)).ok) {
  throw new Error("An expired link was accepted");
}

must("webAuth:revokeAllWebAccess", { userId });
console.log("Web auth regression passed: issue, exchange, single use, supersession, expiration, revocation, cross-user isolation, and full user reset.");

function authArgs(token) {
  return { provider: "telegram-link", params: { token }, calledBy: "auth-regression" };
}

function tokenFromUrl(urlValue) {
  const token = new URL(urlValue).searchParams.get("t");
  if (!token) throw new Error("Issued URL has no opaque token");
  return token;
}

function redact(value) {
  return value.replace(/[A-Za-z0-9_-]{43}/g, "[REDACTED]");
}

async function assertCrossUserIsolation(firstAuthToken, secondAuthToken) {
  const deploymentUrl = readLocalEnv("CONVEX_URL");
  const firstClient = new ConvexHttpClient(deploymentUrl);
  const secondClient = new ConvexHttpClient(deploymentUrl);
  firstClient.setAuth(firstAuthToken);
  secondClient.setAuth(secondAuthToken);

  const [firstToday, secondToday] = await Promise.all([
    firstClient.query(api.web.getToday, {}),
    secondClient.query(api.web.getToday, {}),
  ]);
  const firstKey = firstToday.routine.habits[0]?.habitKey;
  const secondKey = secondToday.routine.habits[0]?.habitKey;
  if (!firstKey || !secondKey) throw new Error("Preview users must have a daily habit for isolation validation");

  await firstClient.mutation(api.web.setTodayHabitCompletion, { habitKey: firstKey, completed: true });
  await secondClient.mutation(api.web.setTodayHabitCompletion, { habitKey: secondKey, completed: false });
  const [firstAfter, secondAfter] = await Promise.all([
    firstClient.query(api.web.getToday, {}),
    secondClient.query(api.web.getToday, {}),
  ]);
  if (firstAfter.progress.completed === 0 || secondAfter.progress.completed !== 0) {
    throw new Error("A web mutation crossed the authenticated user boundary");
  }
}

async function assertFullResetWorkflow() {
  const deploymentUrl = readLocalEnv("CONVEX_URL");
  const seededReset = must("webPreview:seedPreviewAccess", { label: "auth-regression-reset" });
  const resetSignIn = must("auth:signIn", authArgs(tokenFromUrl(seededReset.url)));
  const resetClient = new ConvexHttpClient(deploymentUrl);
  resetClient.setAuth(resetSignIn.tokens.token);

  await resetClient.mutation(api.web.resetAllUserData, { confirmation: "DELETE_ALL_USER_DATA" });
  const [resetBootstrap, resetHabits, resetHistory] = await Promise.all([
    resetClient.query(api.web.getBootstrap, {}),
    resetClient.query(api.web.getHabits, {}),
    resetClient.query(api.web.getHistory, {}),
  ]);
  if (resetBootstrap.onboarding.complete || resetBootstrap.onboarding.step !== "introduction") {
    throw new Error("The reset did not restore the first introductory onboarding step");
  }
  if (resetHabits.length !== 0 || resetHistory.items.length !== 0) {
    throw new Error("The reset preserved routine or history data");
  }

  must("webAuth:revokeAllWebAccess", { userId: seededReset.userId });
  let oldSessionRejected = false;
  try { await resetClient.query(api.web.getBootstrap, {}); } catch { oldSessionRejected = true; }
  if (!oldSessionRejected) throw new Error("Revocation after reset left the browser session active");

  const renewedUrl = must("webAuth:issueWebLoginLink", { userId: seededReset.userId }).url;
  const renewedSignIn = must("auth:signIn", authArgs(tokenFromUrl(renewedUrl)));
  const renewedClient = new ConvexHttpClient(deploymentUrl);
  renewedClient.setAuth(renewedSignIn.tokens.token);
  const [bootstrap, habits, history] = await Promise.all([
    renewedClient.query(api.web.getBootstrap, {}),
    renewedClient.query(api.web.getHabits, {}),
    renewedClient.query(api.web.getHistory, {}),
  ]);
  if (bootstrap.onboarding.complete || bootstrap.onboarding.step !== "introduction") {
    throw new Error("The reset did not restore the first introductory onboarding step");
  }
  if (habits.length !== 0 || history.items.length !== 0) {
    throw new Error("The reset preserved routine or history data");
  }
}

function readLocalEnv(name) {
  const source = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim();
  if (!value) throw new Error(`${name} is missing from .env.local`);
  return value;
}
