import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { CosmosClient } from "@azure/cosmos";
import { DerbyStore } from "../../src/store.js";
import { createApp } from "../../src/app.js";
import { event, levels, raceNumberStarts } from "../../src/event.js";
import { initialState, rosterCsv, type Participant } from "../../src/domain.js";

test("Cosmos: registration, concurrency, retry, edits, private UUID links, expiry", { timeout: 120_000 }, async t => {
  t.mock.method(Date, "now", () => Date.parse(event.opensAt));
  const key = process.env.COSMOS_KEY || readFileSync("dev/cosmos.key", "utf8").trim();
  const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT || "http://localhost:8081", key, connectionPolicy: { enableEndpointDiscovery: false } });
  const { database } = await client.databases.create({ id: "derby-tests-" + randomUUID() });
  const { container } = await database.containers.create({ id: "event-data", partitionKey: { paths: ["/eventId"] }, defaultTtl: -1 });
  const store = new DerbyStore(container);
  const racer: Participant = { firstName: "Avery", lastInitial: "S", level: "Brownie", troopNumber: "00123" };
  const submissionId = randomUUID();
  try {
    await store.initialize();
    await t.test("early public submissions fail while organizers can add racers", async t => {
      t.mock.method(Date, "now", () => Date.parse(event.opensAt) - 1);
      process.env.NODE_ENV = "development";
      process.env.SITE_ORIGIN = "http://localhost:4280";
      const earlyStore = new DerbyStore(container, "early-tests");
      await earlyStore.initialize();
      const app = createApp(async () => earlyStore);
      const csrf = "a".repeat(64);
      const response = await app.request("/api/register", { method: "POST",
        headers: { origin: process.env.SITE_ORIGIN, cookie: "derby-csrf=" + csrf },
        body: new URLSearchParams({ ...racer, csrf, submissionId: randomUUID() }) });
      assert.equal(response.status, 409);
      assert.match(await response.text(), /Registration opens December 4/);
      assert.equal((await earlyStore.list()).length, 0);
      assert.equal((await earlyStore.settings()).nextNumbers.Brownie, 200);
      assert.equal((await earlyStore.register(racer, randomUUID(), true)).raceNumber, 200);
    });
    await t.test("HTTP signup, retry, private receipt, organizer edit, and export work together", async () => {
      process.env.NODE_ENV = "development";
      process.env.SITE_ORIGIN = "http://localhost:4280";
      const httpStore = new DerbyStore(container, "http-tests");
      await httpStore.initialize();
      const app = createApp(async () => httpStore);
      const form = await app.request("/api/registration-form");
      const cookie = form.headers.get("set-cookie")!.split(";")[0];
      const html = await form.text();
      const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
      const submissionId = /name="submissionId" value="([^"]+)"/.exec(html)![1];
      const headers = { cookie, origin: process.env.SITE_ORIGIN, "HX-Request": "true" };
      const submit = () => app.request("/api/register", { method: "POST", headers, body: new URLSearchParams({ ...racer, csrf, submissionId }) });
      const first = await submit(), retry = await submit();
      assert.equal(first.status, 200);
      const location = first.headers.get("HX-Redirect")!;
      assert.equal(location, "/confirmation#" + submissionId);
      assert.equal(retry.headers.get("HX-Redirect"), location);
      const receipt = await app.request("/api/confirmation", { headers: { "X-Receipt-Token": location.split("#")[1] } });
      assert.equal(receipt.status, 200);
      assert.equal(receipt.headers.get("cache-control"), "no-store");
      assert.match(await receipt.text(), /Avery S\./);
      assert.equal((await app.request("/api/confirmation")).status, 404);
      const row = (await httpStore.list())[0];
      assert.equal(row.id, submissionId);
      assert.ok(!("receiptHash" in row));
      for (const id of ["settings", submissionId + "x", randomUUID()]) {
        assert.equal((await app.request("/api/confirmation", { headers: { "X-Receipt-Token": id } })).status, 404);
      }
      const principal = Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "test-organizer", userRoles: ["organizer"] })).toString("base64");
      const adminHeaders = { ...headers, "x-ms-client-principal": principal };
      const recovered = await app.request("/api/admin/receipt/" + row.id, { headers: adminHeaders });
      assert.equal(recovered.status, 303);
      assert.equal(recovered.headers.get("location"), location);
      assert.equal((await app.request("/api/admin/receipt/" + row.id)).status, 403);
      const edit = await app.request("/api/admin/edit/" + row.id, { method: "POST", headers: adminHeaders,
        body: new URLSearchParams({ ...racer, firstName: "Updated", csrf, etag: row._etag! }) });
      assert.equal(edit.status, 200);
      assert.equal(edit.headers.get("HX-Redirect"), "/admin");
      const csv = await app.request("/api/admin/export", { headers: adminHeaders });
      assert.equal(csv.status, 200);
      assert.match(await csv.text(), /Updated/);
      assert.equal((await httpStore.list())[0].raceNumber, row.raceNumber);
      assert.equal((await app.request("/api/admin/export")).status, 403);
      const removedSettings = await app.request("/api/admin/settings", { method: "POST", headers: adminHeaders,
        body: new URLSearchParams({ csrf, deadline: "2027-01-09T00:00" }) });
      assert.equal(removedSettings.status, 404);
    });
    await t.test("racing requests allocate unique numbers and atomic duplicate retries", async () => {
      const results = await Promise.all([
        ...Array.from({ length: 12 }, () => store.register(racer, randomUUID())),
        ...Array.from({ length: 4 }, () => store.register(racer, submissionId)),
      ]);
      assert.equal(new Set(results.map(row => row.raceNumber)).size, 13);
      assert.equal(new Set(results.slice(12).map(row => row.raceNumber)).size, 1);
      assert.equal((await store.list()).length, 13);
      assert.equal((await store.settings()).nextNumbers.Brownie, 213);
    });
    await t.test("every level has its own range; level edits retire the previous number", async () => {
      const grouped = new DerbyStore(container, "level-tests");
      await grouped.initialize();
      const entries = await Promise.all(levels.flatMap(level => [0, 1].map(() => grouped.register({ ...racer, level }, randomUUID()))));
      for (const level of levels) assert.deepEqual(entries.filter(r => r.level === level).map(r => r.raceNumber).sort(), [raceNumberStarts[level], raceNumberStarts[level] + 1]);
      const daisy = (await grouped.list()).find(r => r.raceNumber === 100)!;
      const changed = await grouped.update(daisy.id, { ...racer, level: "Junior" }, daisy._etag!);
      assert.equal(changed.raceNumber, 302);
      assert.equal((await grouped.get(daisy.id))?.raceNumber, 302);
      await assert.rejects(grouped.update(daisy.id, { ...racer, level: "Senior" }, daisy._etag!), /Someone edited/);
      const returned = await grouped.update(daisy.id, { ...racer, level: "Daisy" }, changed._etag!);
      assert.equal(returned.raceNumber, 102);
      assert.equal((await grouped.register({ ...racer, level: "Daisy" }, randomUUID())).raceNumber, 103);
      // Exercise the last slot without manufacturing another 95 registrations.
      const settings = await grouped.settings();
      await container.item("settings", grouped.eventId).replace({ ...settings, nextNumbers: { ...settings.nextNumbers, Daisy: 199 } });
      assert.equal((await grouped.register({ ...racer, level: "Daisy" }, randomUUID())).raceNumber, 199);
      await assert.rejects(grouped.register({ ...racer, level: "Daisy" }, randomUUID()), /All Daisy race numbers/);
      const junior = (await grouped.list()).find(r => r.raceNumber === 300)!;
      await assert.rejects(grouped.update(junior.id, { ...racer, level: "Daisy" }, junior._etag!), /All Daisy race numbers/);
      assert.equal((await grouped.get(junior.id))?.raceNumber, 300);
      assert.equal((await grouped.register(racer, randomUUID())).raceNumber, 202);
    });
    await t.test("legacy settings upgrade preserves issued numbers and skips occupied slots", async () => {
      const legacy = new DerbyStore(container, "legacy-tests");
      await legacy.initialize();
      const row = await legacy.register(racer, randomUUID());
      const { nextNumbers, ...oldSettings } = initialState(legacy.eventId);
      await container.item("settings", legacy.eventId).replace({ ...oldSettings, nextNumber: 201 });
      await Promise.all([legacy.initialize(), legacy.initialize()]);
      assert.equal((await legacy.get(row.id))?.raceNumber, 200);
      assert.equal((await legacy.register(racer, randomUUID())).raceNumber, 201);
      assert.equal((await legacy.register({ ...racer, level: "Daisy" }, randomUUID())).raceNumber, 100);
      await legacy.initialize();
      assert.equal((await legacy.settings()).nextNumbers.Brownie, 202);
    });
    await t.test("UUID lookup rejects invalid IDs, unknown IDs, and other event partitions", async () => {
      const row = await store.get(submissionId);
      assert.ok(row);
      assert.equal((await store.get(row.id))?.id, row.id);
      for (const id of [row.id + "x", "settings", "", randomUUID()]) assert.equal(await store.get(id), undefined);
      const otherEvent = new DerbyStore(container, "other-event");
      assert.equal(await otherEvent.get(row.id), undefined);
    });
    await t.test("organizers can recover confirmations for older prefixed records", async () => {
      const row = (await store.get(submissionId))!;
      const id = "registration:" + randomUUID();
      await container.items.create({ ...row, id, receiptHash: "unused-legacy-hash" });
      const app = createApp(async () => store);
      const principal = Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "organizer", userRoles: ["organizer"] })).toString("base64");
      const recovered = await app.request("/api/admin/receipt/" + id, { headers: { "x-ms-client-principal": principal } });
      assert.equal(recovered.headers.get("location"), "/confirmation#" + id);
      assert.equal((await app.request("/api/confirmation", { headers: { "X-Receipt-Token": id } })).status, 200);
      assert.equal((await app.request("/api/confirmation", { headers: { "X-Receipt-Token": id + ".old-signature" } })).status, 404);
    });
    await t.test("changed submission cannot overwrite an earlier receipt", async () => {
      await assert.rejects(store.register({ ...racer, firstName: "Other" }, submissionId), /different details/);
    });
    await t.test("edits keep number and expiry; stale edits fail; export includes changes", async () => {
      const row = (await store.get(submissionId))!;
      const updated = await store.update(row.id, { ...racer, firstName: "Changed" }, row._etag!);
      assert.equal(updated.raceNumber, row.raceNumber);
      assert.equal(updated.expiresAt, row.expiresAt);
      await assert.rejects(store.update(row.id, racer, row._etag!), /Someone edited/);
      assert.match(rosterCsv(await store.list()), /Changed/);
    });
    await t.test("fixed cutoff ignores legacy settings and permits retries and organizer entries", async t => {
      const settings = await store.settings();
      await container.item("settings", store.eventId).replace({ ...settings, closesAt: "2000-01-01T00:00:00Z", manuallyClosed: true });
      assert.ok(await store.register(racer, randomUUID()));
      t.mock.method(Date, "now", () => Date.parse(event.closesAt));
      try {
        await assert.rejects(store.register(racer, randomUUID()), /closed/);
        assert.ok(await store.register(racer, submissionId));
        const late = await store.register(racer, randomUUID(), true);
        assert.equal(late.raceNumber, 214);
      } finally { t.mock.restoreAll(); }
    });
    await t.test("expired records are unavailable even before background TTL deletion", async () => {
      const row = (await store.get(submissionId))!;
      await container.item(row.id, store.eventId).replace({ ...row, expiresAt: "2000-01-01T00:00:00.000Z", ttl: 60 });
      assert.equal(await store.get(row.id), undefined);
      const app = createApp(async () => store);
      assert.equal((await app.request("/api/confirmation", { headers: { "X-Receipt-Token": row.id } })).status, 404);
      assert.ok(!(await store.list()).some(r => r.id === row.id));
    });
  } finally { await database.delete(); client.dispose(); }
});
