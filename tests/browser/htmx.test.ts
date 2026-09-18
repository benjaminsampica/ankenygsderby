import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import { readFile } from "node:fs/promises";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "../../src/app.js";
import { initialState, type Registration } from "../../src/domain.js";
import type { DerbyStore } from "../../src/store.js";
import { event } from "../../src/event.js";

let browser: Browser;
let server: ReturnType<typeof serve>;
let origin: string;
const racer = { id: "a1111111-1111-4111-8111-111111111111", firstName: "Avery", lastInitial: "S", level: "Brownie", troopNumber: "00123", raceNumber: 200, _etag: "test-etag" } as Registration;
const organizer = Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "browser-test", userRoles: ["organizer"] })).toString("base64");

before(async () => {
  mock.method(Date, "now", () => Date.parse(event.opensAt));
  process.env.NODE_ENV = "development";
  // Real routes and templates with an in-memory store: never write to an event roster.
  const store = {
    settings: async () => initialState(),
    list: async () => [racer],
    get: async (id: string) => id === racer.id ? racer : undefined,
    register: async () => racer,
    update: async () => racer,
  } as unknown as DerbyStore;
  const config = JSON.parse(await readFile("staticwebapp.config.json", "utf8"));
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("cookie")?.includes("browser-organizer=true")) c.req.raw.headers.set("x-ms-client-principal", organizer);
    for (const [key, value] of Object.entries(config.globalHeaders)) c.header(key, String(value));
    await next();
  });
  app.route("/", createApp(async () => store));
  app.use("*", serveStatic({ root: "dist/site", rewriteRequestPath: path => path.endsWith("/") ? path + "index.html" : path.includes(".") ? path : path + "/index.html" }));
  server = serve({ fetch: app.fetch, port: 0 });
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://localhost:${address.port}`;
  process.env.SITE_ORIGIN = origin;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  mock.restoreAll();
});

async function pageFor(path: string, admin = false) {
  const context = await browser.newContext();
  if (admin) await context.addCookies([{ name: "browser-organizer", value: "true", url: origin }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /Content Security Policy|Refused to/.test(message.text())) errors.push(message.text()); });
  await page.goto(origin + path);
  return { page, close: async () => { await context.close(); assert.deepEqual(errors, []); } };
}
async function fillRacer(page: Page) {
  await page.getByLabel("First name", { exact: true }).fill("Avery");
  await page.getByLabel("Last initial", { exact: true }).fill("s");
  await page.getByLabel("Troop level", { exact: true }).selectOption("Brownie");
  await page.getByLabel("Troop number", { exact: true }).fill("00123");
}

test("boosted navigation consumes preload, updates title/history, and rewires gallery", async () => {
  const { page, close } = await pageFor("/");
  try {
    assert.equal(await page.evaluate(() => (window as any).htmx.version), "4.0.0");
    const requests: string[] = [];
    page.on("request", request => { if (new URL(request.url()).pathname === "/guide") requests.push(request.resourceType()); });
    await page.getByRole("navigation").getByText("Car guide").hover();
    await expect.poll(() => requests.length).toBe(1);
    // Move away before keyboard activation so the new page does not start another hover preload.
    await page.mouse.move(0, 0);
    await page.getByRole("navigation").getByText("Car guide").press("Enter");
    await expect(page).toHaveURL(origin + "/guide");
    await expect(page).toHaveTitle("Car guide | Pinewood Derby 2027");
    assert.deepEqual(requests, ["fetch"]);
    await expect(page.getByRole("navigation").getByText("Car guide")).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page.locator("#photo-viewer")).toBeAttached();
    await page.locator("[data-gallery-photo]").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#viewer-count")).toHaveText("2 / 6");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gallery-photo]").first()).toBeFocused();
    await page.goForward();
    await expect(page).toHaveTitle("Car guide | Pinewood Derby 2027");
    await page.getByRole("link", { name: "Pinewood Derby home" }).click();
    await page.locator("[data-gallery-photo]").first().click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#viewer-count")).toHaveText("2 / 6");
  } finally { await close(); }
});

test("opening a saved confirmation sends its private receipt token on the first request", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    // A slow application script must not let HTMX send the request before its listeners are installed.
    await page.route("**/site.js", async route => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill({ response });
    });
    const receipt = page.waitForRequest(request => request.url().endsWith("/api/confirmation"));
    await page.goto(origin + "/confirmation#" + racer.id);
    assert.equal((await receipt).headers()["x-receipt-token"], racer.id);
    await expect(page.locator(".race-number")).toHaveText("200");
  } finally { await context.close(); }
});

test("validation replaces form and focuses errors; submit redirects with private receipt header", async () => {
  const { page, close } = await pageFor("/register");
  try {
    await fillRacer(page);
    await page.getByLabel("Troop number", { exact: true }).fill("invalid");
    const invalid = page.waitForResponse(response => response.url().endsWith("/api/register"));
    await page.getByRole("button", { name: "Register", exact: true }).click();
    assert.equal((await invalid).status(), 422);
    await expect(page.locator(".validation-summary")).toBeFocused();
    await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Avery");
    await expect(page.locator("#request-error")).toBeHidden();
    await expect(page.locator("#registration-panel form")).toHaveCount(1);
    await page.getByLabel("Troop number", { exact: true }).fill("00123");
    const receipt = page.waitForRequest(request => request.url().endsWith("/api/confirmation"));
    await page.getByRole("button", { name: "Register", exact: true }).click();
    assert.equal((await receipt).headers()["x-receipt-token"], racer.id);
    await expect(page.locator(".race-number")).toHaveText("200");
    await expect(page).toHaveURL(origin + "/confirmation#" + racer.id);
    await page.getByRole("navigation").getByText("Car guide").click();
    await expect(page).toHaveURL(origin + "/guide");
    await expect(page).toHaveTitle("Car guide | Pinewood Derby 2027");
    const restoredReceipt = page.waitForRequest(request => request.url().endsWith("/api/confirmation"));
    await page.goBack();
    assert.equal((await restoredReceipt).headers()["x-receipt-token"], racer.id);
    await expect(page.locator(".race-number")).toHaveText("200");
  } finally { await close(); }
});

test("server/network failures retain input and re-enable submit; retry clears error", async () => {
  const { page, close } = await pageFor("/register");
  try {
    await fillRacer(page);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/register", async route => { await pending; await route.fulfill({ status: 503, contentType: "text/html", body: "<p>Unavailable</p>" }); });
    const submit = page.locator("button[type=submit]");
    await submit.click();
    await expect(submit).toBeDisabled();
    release();
    await expect(page.locator("#request-error")).toBeVisible();
    await expect(submit).toBeEnabled();
    await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Avery");
    await page.unroute("**/api/register");
    await page.route("**/api/register", route => route.abort("failed"));
    await submit.click();
    await expect(page.locator("#request-error")).toBeVisible();
    await expect(submit).toBeEnabled();
    await page.unroute("**/api/register");
    await submit.click();
    await expect(page.locator(".race-number")).toHaveText("200");
    await expect(page.locator("#request-error")).toBeHidden();
  } finally { await close(); }
});

test("organizer search/edit swap correctly; export stays a download and auth stays navigation", async () => {
  const { page, close } = await pageFor("/admin", true);
  try {
    await page.getByRole("button", { name: "Edit racer 200" }).click();
    await expect(page.getByLabel("First name", { exact: true })).toBeFocused();
    await page.getByLabel("Troop number", { exact: true }).fill("invalid");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".validation-summary")).toBeFocused();
    await expect(page.locator("#editor form")).toHaveCount(1);
    const search = page.getByRole("searchbox");
    await search.fill("no match");
    await expect(page.getByText("No matching racers.")).toBeVisible();
    await expect(page.locator("#roster")).toHaveCount(1);
    await expect(search).toBeFocused();
    await search.fill("Avery");
    await expect(page.getByRole("button", { name: "Edit racer 200" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV" }).click();
    assert.equal((await download).suggestedFilename(), "pinewood-derby-2027.csv");
    await expect(page.getByRole("heading", { name: "Race roster" })).toBeVisible();
    const authRequests: string[] = [];
    page.on("request", request => { if (request.url().includes("/.auth/")) authRequests.push(request.resourceType()); });
    await page.getByRole("link", { name: "Sign out", exact: true }).hover();
    assert.deepEqual(authRequests, []);
    const logout = page.waitForRequest(request => request.url().includes("/.auth/logout"));
    await page.getByRole("link", { name: "Sign out", exact: true }).click();
    assert.equal((await logout).isNavigationRequest(), true);
  } finally { await close(); }
});
