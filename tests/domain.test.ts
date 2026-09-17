import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { event } from "../src/event.js";
import { initialState, registrationOpen, remainingTtl, rosterCsv, validateParticipant, type Registration } from "../src/domain.js";
import { createApp } from "../src/app.js";
import type { DerbyStore } from "../src/store.js";
import { Receipt } from "../src/views.js";
import { jsx } from "hono/jsx";
import azureFunctions from "@azure/functions";
import { handler } from "../src/functions/handler.js";

test("validation accepts real names and preserves troop leading zeros", () => {
  assert.deepEqual(validateParticipant({ firstName: "  Zoë-Anne O’Neil  ", lastInitial: "s", level: "Junior", troopNumber: "00123" }).participant,
    { firstName: "Zoë-Anne O’Neil", lastInitial: "S", level: "Junior", troopNumber: "00123" });
  const bad = validateParticipant({ firstName: "<script>", lastInitial: "Smith", level: "Other", troopNumber: "1e4" });
  assert.equal(Object.keys(bad.errors).length, 4);
  assert.equal(bad.participant, undefined);
});
test("initial is exactly one ASCII letter, normalized to uppercase", () => {
  const valid = { firstName: "Avery", lastInitial: "a", level: "Daisy", troopNumber: "123" };
  assert.equal(validateParticipant(valid).participant?.lastInitial, "A");
  for (const lastInitial of ["AB", "A.", "1", "-", "É", "ſ", "ß", "K", ""]) {
    assert.ok(validateParticipant({ ...valid, lastInitial }).errors.lastInitial, lastInitial);
  }
});
test("fixed cutoff is exclusive at midnight Central", () => {
  assert.equal(registrationOpen(Date.parse("2027-01-04T05:59:59Z")), true);
  assert.equal(registrationOpen(Date.parse("2027-01-04T06:00:00Z")), false);
});
test("registration opens exactly December 4 at midnight Central", () => {
  assert.equal(registrationOpen(Date.parse("2026-12-04T05:59:59.999Z")), false);
  assert.equal(registrationOpen(Date.parse("2026-12-04T06:00:00.000Z")), true);
});
test("API hides signup before opening and shows the opening date", async t => {
  const app = createApp(async () => { throw new Error("Must not touch database"); });
  const clock = t.mock.method(Date, "now", () => Date.parse("2026-12-04T05:59:59.999Z"));
  for (const path of ["/api/status", "/api/registration-form"]) {
    const response = await app.request(path);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Registration opens December 4, 2026 at 12:00 AM Central/);
    assert.doesNotMatch(html, /<form|late entry/);
  }
  clock.mock.mockImplementation(() => Date.parse("2026-12-04T06:00:00.000Z"));
  assert.match(await (await app.request("/api/registration-form")).text(), /<form/);
  assert.match(await (await app.request("/api/status")).text(), /Registration closes January 3/);
  clock.mock.mockImplementation(() => Date.parse(event.closesAt));
  assert.doesNotMatch(await (await app.request("/api/registration-form")).text(), /<form/);
  assert.match(await (await app.request("/api/status")).text(), /Registration is closed/);
});
test("retention is an absolute event deadline, not thirty days from last edit", () => {
  assert.equal(remainingTtl(event.expiresAt, Date.parse("2027-02-07T06:00:00Z")), 86400);
  assert.equal(remainingTtl(event.expiresAt, Date.parse("2027-02-07T07:00:00Z")), 82800);
  assert.throws(() => remainingTtl(event.expiresAt, Date.parse(event.expiresAt)), /expired/);
});
const row = { firstName: "Avery", lastInitial: "S", level: "Brownie", troopNumber: "00123", raceNumber: 42 } as Registration;
test("export includes every racer, retains car numbers, and neutralizes formulas", () => {
  const csv = rosterCsv([row, { ...row, raceNumber: 41, firstName: "-Danger" }, { ...row, raceNumber: 43 }]);
  assert.match(csv, /"Last Name","Segment","Car Number"/);
  assert.match(csv, /"'\-Danger","S","Brownie","41","00123"/);
  assert.match(csv, /"Avery","S","Brownie","42","00123"/);
  assert.match(csv, /"43"/);
});
test("TSX escapes participant markup", () => {
  const rendered = jsx(Receipt, { row: { ...row, firstName: "<script>alert(1)</script>" } }).toString();
  assert.ok(typeof rendered === "string");
  assert.ok(rendered.includes("&lt;script&gt;"));
  assert.ok(!rendered.includes("<script>"));
});
test("API rejects unauthorized organizer access before reading the database", async () => {
  const app = createApp(async () => { throw new Error("Must not touch database"); });
  for (const roles of [undefined, ["anonymous", "authenticated"]]) {
    const headers: Record<string, string> = roles ? { "x-ms-client-principal": Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "test", userRoles: roles })).toString("base64") } : {};
    const response = await app.request("http://localhost/api/admin/export", { headers });
    assert.equal(response.status, 403);
  }
});
test("API renders populated validation fragments and rejects forged requests", async t => {
  t.mock.method(Date, "now", () => Date.parse(event.opensAt));
  process.env.NODE_ENV = "development";
  process.env.SITE_ORIGIN = "http://localhost:4280";
  const app = createApp(async () => ({ settings: async () => initialState() }) as DerbyStore);
  const form = await app.request("http://localhost:4280/api/registration-form");
  const cookie = form.headers.get("set-cookie")!.split(";")[0];
  const html = await form.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
  const submissionId = /name="submissionId" value="([^"]+)"/.exec(html)![1];
  const body = new URLSearchParams({ csrf, submissionId, firstName: "Avery", lastInitial: "S", level: "", troopNumber: "0123" });
  const headers = { cookie, origin: "http://localhost:4280", "content-type": "application/x-www-form-urlencoded", "HX-Request": "true" };
  const response = await app.request("http://localhost:4280/api/register", { method: "POST", headers, body });
  assert.equal(response.status, 422);
  assert.match(await response.text(), /value="Avery"/);
  const forged = await app.request("http://localhost:4280/api/register", { method: "POST", headers: { ...headers, origin: "https://other.example" }, body });
  assert.equal(forged.status, 403);
});
test("Azure Functions adapter preserves form bodies, validation status, and response headers", async () => {
  process.env.NODE_ENV = "development";
  process.env.SITE_ORIGIN = "http://localhost:4280";
  const csrf = "a".repeat(64);
  const request = new azureFunctions.HttpRequest({ url: "http://localhost:4280/api/register", method: "POST",
    headers: { origin: process.env.SITE_ORIGIN, cookie: "derby-csrf=" + csrf, "content-type": "application/x-www-form-urlencoded" },
    body: { string: new URLSearchParams({ csrf, submissionId: randomUUID(), firstName: "Zoë", lastInitial: "S", troopNumber: "00123" }).toString() } });
  const response = await handler(request);
  assert.equal(response.status, 422);
  assert.equal(new Headers(response.headers).get("cache-control"), "no-store");
  assert.match(String(response.body), /value="Zoë"/);
});
