import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { event } from "../src/event.js";
import { allocateRaceNumber, claimVolunteerSlots, contactsCsv, initialState, openSlots, registrationOpen, remainingTtl, rosterCsv, validateParticipant, validateVolunteer, volunteersCsv, type Registration, type Volunteer } from "../src/domain.js";
import { createApp } from "../src/app.js";
import type { DerbyStore } from "../src/store.js";
import { Receipt } from "../src/views.js";
import { jsx } from "hono/jsx";
import azureFunctions from "@azure/functions";
import { handler } from "../src/functions/handler.js";

const valid = { firstName: "Avery", lastName: "Smith", level: "Daisy", troopNumber: "123", parentName: "Jordan Smith", parentPhone: "515-555-0123", emergencyName: "Pat Lee", emergencyPhone: "(515) 555-0199" };

test("validation accepts real names, full last names, and preserves troop leading zeros", () => {
  assert.deepEqual(validateParticipant({ firstName: "  Zoë-Anne O’Neil  ", lastName: " de la Cruz ", level: "Junior", troopNumber: "00123",
    parentName: "Maria de la Cruz", parentPhone: "+1 (515) 555-0123", emergencyName: "Ana Ruiz", emergencyPhone: "515.555.0199" }).participant,
  { firstName: "Zoë-Anne O’Neil", lastName: "de la Cruz", level: "Junior", troopNumber: "00123", parentName: "Maria de la Cruz",
    parentPhone: "(515) 555-0123", emergencyName: "Ana Ruiz", emergencyPhone: "(515) 555-0199", photoConsent: false });
  const bad = validateParticipant({ firstName: "<script>", lastName: "", level: "Other", troopNumber: "1e4", parentName: "", parentPhone: "555", emergencyName: "x".repeat(101), emergencyPhone: "" });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["emergencyName", "emergencyPhone", "firstName", "lastName", "level", "parentName", "parentPhone", "troopNumber"]);
  assert.equal(bad.participant, undefined);
});
test("phones need ten digits and the emergency contact must be someone else", () => {
  for (const parentPhone of ["555-0123", "015-555-0123", "1 (115) 555-0123", "515-555-01234", "515-CALL-NOW", "2 515 555 0123"]) {
    assert.ok(validateParticipant({ ...valid, parentPhone }).errors.parentPhone, parentPhone);
  }
  assert.match(validateParticipant({ ...valid, emergencyPhone: "5155550123" }).errors.emergencyPhone!, /won't be at the race/);
});
test("troop number is optional only for Outlaw racers", () => {
  assert.equal(validateParticipant({ ...valid, level: "Outlaw", troopNumber: "" }).participant?.troopNumber, "");
  assert.ok(validateParticipant({ ...valid, troopNumber: "" }).errors.troopNumber);
  assert.ok(validateParticipant({ ...valid, level: "Outlaw", troopNumber: "12a" }).errors.troopNumber);
});
test("photo consent and volunteer roles come from opt-in checkboxes", () => {
  assert.equal(validateParticipant({ ...valid, photoConsent: "yes" }).participant?.photoConsent, true);
  assert.equal(validateParticipant(valid).participant?.photoConsent, false);
  assert.deepEqual(validateParticipant({ ...valid, volunteer: "yes", volunteerRoles: ["emcee", "setup"] }).volunteerRoles, ["setup", "emcee"]);
  assert.deepEqual(validateParticipant({ ...valid, volunteerRoles: ["emcee"] }).volunteerRoles, []);
  assert.ok(validateParticipant({ ...valid, volunteer: "yes" }).errors.volunteerRoles);
  assert.ok(validateParticipant({ ...valid, volunteer: "yes", volunteerRoles: ["emcee", "bogus"] }).errors.volunteerRoles);
  assert.ok(validateParticipant({ ...valid, firstName: ["Avery", "Other"] }).errors.firstName);
});
test("standalone volunteers need a name, phone, and at least one known role", () => {
  assert.deepEqual(validateVolunteer({ volunteerName: " Sam Rivera ", volunteerPhone: "515 555 0144", volunteerRoles: ["cleanup", "setup"] }).volunteer,
    { name: "Sam Rivera", phone: "(515) 555-0144", roles: ["setup", "cleanup"] });
  const bad = validateVolunteer({ volunteerName: "", volunteerPhone: "12", volunteerRoles: "bogus" });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["volunteerName", "volunteerPhone", "volunteerRoles"]);
  assert.match(validateVolunteer({ volunteerName: "Sam", volunteerPhone: "5155550144" }).errors.volunteerRoles!, /at least one/);
});
test("volunteer slots are claimed, freed, and capped per role", () => {
  assert.deepEqual(claimVolunteerSlots({}, [], ["check-in", "emcee"]), { "check-in": 1, emcee: 1 });
  assert.throws(() => claimVolunteerSlots({ emcee: 1 }, [], ["emcee"]), /Emcee role is full/);
  assert.deepEqual(claimVolunteerSlots({ emcee: 1 }, ["emcee"], ["runner", "emcee"]), { emcee: 1, runner: 1 });
  assert.deepEqual(claimVolunteerSlots({ emcee: 1, runner: 1 }, ["runner", "emcee"], []), { emcee: 0, runner: 0 });
  const open = openSlots({ "check-in": 1, setup: 4 });
  assert.deepEqual([open["check-in"], open.setup, open.emcee, open.cleanup], [1, 0, 1, 4]);
  assert.equal(openSlots(undefined).emcee, 1);
});
test("Outlaw numbers start at 700 when saved settings predate the class", () => {
  const settings = initialState();
  delete (settings.nextNumbers as Partial<typeof settings.nextNumbers>).Outlaw;
  const { raceNumber, nextNumbers } = allocateRaceNumber(settings, "Outlaw");
  assert.equal(raceNumber, 700);
  assert.equal(nextNumbers.Outlaw, 701);
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
const row = { firstName: "Avery", lastName: "Smith", level: "Brownie", troopNumber: "00123", raceNumber: 42, parentName: "Jordan Smith", parentPhone: "(515) 555-0123",
  emergencyName: "Pat Lee", emergencyPhone: "(515) 555-0199", photoConsent: false } as Registration;
test("DerbyNet export includes every racer, retains car numbers, and leaves out contacts", () => {
  const csv = rosterCsv([row, { ...row, raceNumber: 41, firstName: "-Danger" }, { ...row, raceNumber: 43 }]);
  assert.match(csv, /"Last Name","Segment","Car Number"/);
  assert.match(csv, /"'\-Danger","Smith","Brownie","41","00123"/);
  assert.match(csv, /"Avery","Smith","Brownie","42","00123"/);
  assert.match(csv, /"43"/);
  assert.doesNotMatch(csv, /555|Jordan/);
});
test("contacts export lists contacts and photo consent", () => {
  const csv = contactsCsv([row, { ...row, raceNumber: 41, parentName: "=cmd", photoConsent: true }]);
  assert.match(csv, /^﻿"Car Number","First Name","Last Name","Level","Troop","Parent\/Guardian","Parent Phone","Emergency Contact","Emergency Phone","Photo Consent"\r\n"41",/);
  assert.match(csv, /"'=cmd","\(515\) 555-0123","Pat Lee","\(515\) 555-0199","Yes"\r\n/);
  assert.match(csv, /"42","Avery","Smith","Brownie","00123","Jordan Smith","\(515\) 555-0123","Pat Lee","\(515\) 555-0199","No"\r\n/);
});
test("volunteer export lists each volunteer with role labels", () => {
  const csv = volunteersCsv([{ name: "Sam Rivera", phone: "(515) 555-0144", roles: ["emcee", "cleanup"] }, { name: "+Ana", phone: "(515) 555-0155", roles: ["setup"], registrationId: "a" }] as Volunteer[]);
  assert.match(csv, /"'\+Ana","\(515\) 555-0155","Friday night set-up","Yes"\r\n"Sam Rivera","\(515\) 555-0144","Emcee; Clean-up","No"/);
});
test("TSX escapes participant markup", () => {
  const rendered = jsx(Receipt, { row: { ...row, firstName: "<script>alert(1)</script>" } }).toString();
  assert.ok(typeof rendered === "string");
  assert.ok(rendered.includes("&lt;script&gt;"));
  assert.ok(!rendered.includes("<script>"));
});
test("API rejects unauthorized organizer access before reading the database", async () => {
  const app = createApp(async () => { throw new Error("Must not touch database"); });
  for (const path of ["/api/admin/export", "/api/admin/export/contacts", "/api/admin/export/volunteers"]) for (const roles of [undefined, ["anonymous", "authenticated"]]) {
    const headers: Record<string, string> = roles ? { "x-ms-client-principal": Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "test", userRoles: roles })).toString("base64") } : {};
    const response = await app.request("http://localhost" + path, { headers });
    assert.equal(response.status, 403);
  }
});
test("API renders populated validation fragments and rejects forged requests", async t => {
  t.mock.method(Date, "now", () => Date.parse(event.opensAt));
  process.env.NODE_ENV = "development";
  process.env.SITE_ORIGIN = "http://localhost:4280";
  const app = createApp(async () => ({ settings: async () => ({ ...initialState(), volunteerCounts: { runner: 1 } }) }) as DerbyStore);
  const form = await app.request("http://localhost:4280/api/registration-form");
  const cookie = form.headers.get("set-cookie")!.split(";")[0];
  const html = await form.text();
  assert.match(html, /value="runner" disabled=""/);
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
  const submissionId = /name="submissionId" value="([^"]+)"/.exec(html)![1];
  const body = new URLSearchParams({ csrf, submissionId, ...valid, level: "", volunteer: "yes" });
  body.append("volunteerRoles", "emcee");
  body.append("volunteerRoles", "setup");
  const headers = { cookie, origin: "http://localhost:4280", "content-type": "application/x-www-form-urlencoded", "HX-Request": "true" };
  const response = await app.request("http://localhost:4280/api/register", { method: "POST", headers, body });
  assert.equal(response.status, 422);
  const invalid = await response.text();
  assert.match(invalid, /value="Avery"/);
  assert.match(invalid, /value="setup" checked=""/);
  assert.match(invalid, /value="emcee" checked=""/);
  const forged = await app.request("http://localhost:4280/api/register", { method: "POST", headers: { ...headers, origin: "https://other.example" }, body });
  assert.equal(forged.status, 403);
});
test("volunteer sign-up stays open until Friday night and keeps entries on validation errors", async t => {
  const clock = t.mock.method(Date, "now", () => Date.parse("2026-10-26T12:00:00Z"));
  process.env.NODE_ENV = "development";
  process.env.SITE_ORIGIN = "http://localhost:4280";
  const app = createApp(async () => ({ settings: async () => ({ ...initialState(), volunteerCounts: { emcee: 1 } }) }) as DerbyStore);
  const form = await app.request("http://localhost:4280/api/volunteer-form");
  const html = await form.text();
  assert.match(html, /value="emcee" disabled=""/);
  const cookie = form.headers.get("set-cookie")!.split(";")[0];
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
  const body = new URLSearchParams({ csrf, submissionId: randomUUID(), volunteerName: "Sam Rivera", volunteerPhone: "12" });
  body.append("volunteerRoles", "setup");
  const response = await app.request("http://localhost:4280/api/volunteer", { method: "POST", body,
    headers: { cookie, origin: "http://localhost:4280", "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(response.status, 422);
  const invalid = await response.text();
  assert.match(invalid, /value="Sam Rivera"/);
  assert.match(invalid, /value="setup" checked=""/);
  clock.mock.mockImplementation(() => Date.parse(event.volunteersCloseAt));
  assert.match(await (await app.request("/api/volunteer-form")).text(), /Volunteer sign-up is closed/);
});
test("Azure Functions adapter preserves form bodies, validation status, and response headers", async () => {
  process.env.NODE_ENV = "development";
  process.env.SITE_ORIGIN = "http://localhost:4280";
  const csrf = "a".repeat(64);
  const request = new azureFunctions.HttpRequest({ url: "http://localhost:4280/api/register", method: "POST",
    headers: { origin: process.env.SITE_ORIGIN, cookie: "derby-csrf=" + csrf, "content-type": "application/x-www-form-urlencoded" },
    body: { string: new URLSearchParams({ csrf, submissionId: randomUUID(), firstName: "Zoë", lastName: "Smith", troopNumber: "00123" }).toString() } });
  const response = await handler(request);
  assert.equal(response.status, 422);
  assert.equal(new Headers(response.headers).get("cache-control"), "no-store");
  assert.match(String(response.body), /value="Zoë"/);
});
