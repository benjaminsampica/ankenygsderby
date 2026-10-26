import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { contactsCsv, openSlots, Problem, registrationOpen, registrationStatus, rosterCsv, validateParticipant, validateVolunteer, volunteersCsv, volunteerSignupOpen } from "./domain.js";
import { getStore, type DerbyStore } from "./store.js";
import { Dashboard, EditForm, Message, Receipt, RegistrationForm, Roster, VolunteerForm, VolunteerThanks } from "./views.js";

function csrf(c: Context) {
  const name = process.env.NODE_ENV === "development" ? "derby-csrf" : "__Host-derby-csrf";
  let value = getCookie(c, name);
  if (!value || !/^[\da-f]{64}$/.test(value)) {
    value = randomBytes(32).toString("hex");
    setCookie(c, name, value, { path: "/", httpOnly: true, secure: process.env.NODE_ENV !== "development", sameSite: "Strict" });
  }
  return value;
}
function checkCsrf(c: Context, body: Record<string, unknown>) {
  const expected = csrf(c), actual = typeof body.csrf === "string" ? body.csrf : "";
  const origin = c.req.header("origin");
  const configured = process.env.SITE_ORIGIN;
  if (!configured || origin !== configured || !/^[\da-f]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
    throw new Problem(403, "Your form session expired. Reload the page and try again.");
}
function organizer(c: Context) {
  try {
    const value = JSON.parse(Buffer.from(c.req.header("x-ms-client-principal") || "", "base64").toString("utf8"));
    return value.identityProvider === "aad" && typeof value.userId === "string" && Array.isArray(value.userRoles) && value.userRoles.includes("organizer");
  } catch { return false; }
}
function redirect(c: Context, url: string) {
  if (c.req.header("HX-Request")) { c.header("HX-Redirect", url); return c.body(null, 200); }
  return c.redirect(url, 303);
}
export function createApp(storeProvider: () => Promise<DerbyStore> = getStore) {
  const app = new Hono();
  // Volunteer availability is display-only; the store enforces slots when saving.
  // Without it, the form still renders so families can see validation errors.
  const volunteerSlots = async () => {
    try { return openSlots((await (await storeProvider()).settings()).volunteerCounts); }
    catch { return undefined; }
  };
  const csvDownload = (c: Context, filename: string, body: string) => {
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(body);
  };
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store"); c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Referrer-Policy", "no-referrer"); c.header("X-Content-Type-Options", "nosniff");
    await next();
  });
  app.use("/api/*", bodyLimit({ maxSize: 12_000, onError: c => c.text("Form is too large.", 413) }));
  app.use("/api/admin/*", async (c, next) => {
    if (!organizer(c)) return c.html(<Message heading="Organizer access required">Sign in with an invited organizer account.</Message>, 403);
    await next();
  });
  app.onError((error, c) => {
    const status = error instanceof Problem ? error.status : 503;
    // Do not log request data, confirmation tokens, or Cosmos error payloads.
    if (!(error instanceof Problem)) console.error("API operation failed", error.name);
    return c.html(<Message heading={status === 503 ? "Temporarily unavailable" : "Unable to complete request"}>{error instanceof Problem ? error.message : "Please try again shortly. Your entries have been kept."}</Message>, status as 400);
  });
  app.get("/api/health", async c => { await (await storeProvider()).settings(); return c.json({ status: "ok" }); });
  app.get("/api/status", async c => {
    return c.html(<span>{registrationStatus()}</span>);
  });
  app.get("/api/registration-form", async c => {
    if (!registrationOpen()) return c.html(<Message heading="Registration is closed">{registrationStatus()}</Message>);
    return c.html(<RegistrationForm csrf={csrf(c)} submissionId={randomUUID()} open={await volunteerSlots()} />);
  });
  for (const isAdmin of [false, true]) app.post(isAdmin ? "/api/admin/register" : "/api/register", async c => {
    const body = await c.req.parseBody({ all: true }); checkCsrf(c, body);
    if (body.website) throw new Problem(400, "Unable to accept this submission.");
    const submissionId = String(body.submissionId || "");
    const { values, errors, participant, volunteerRoles } = validateParticipant(body);
    if (!participant) return c.html(<RegistrationForm csrf={csrf(c)} submissionId={submissionId} values={values} errors={errors} organizer={isAdmin} open={await volunteerSlots()} />, 422);
    try {
      const store = await storeProvider();
      const row = await store.register(participant, submissionId, isAdmin, volunteerRoles);
      return redirect(c, isAdmin ? "/admin" : "/confirmation#" + row.id);
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      return c.html(<RegistrationForm csrf={csrf(c)} submissionId={submissionId} values={values} errors={{ form: error.message }} organizer={isAdmin} open={await volunteerSlots()} />, error.status as 400);
    }
  });
  app.get("/api/volunteer-form", async c => {
    if (!volunteerSignupOpen()) return c.html(<Message heading="Volunteer sign-up is closed">Contact an organizer if you'd still like to help.</Message>);
    return c.html(<VolunteerForm csrf={csrf(c)} submissionId={randomUUID()} open={await volunteerSlots()} />);
  });
  app.post("/api/volunteer", async c => {
    const body = await c.req.parseBody({ all: true }); checkCsrf(c, body);
    if (body.website) throw new Problem(400, "Unable to accept this submission.");
    const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
    const { values, errors, volunteer } = validateVolunteer(body);
    if (!volunteer) return c.html(<VolunteerForm csrf={csrf(c)} submissionId={submissionId} values={values} errors={errors} open={await volunteerSlots()} />, 422);
    try {
      return c.html(<VolunteerThanks volunteer={await (await storeProvider()).registerVolunteer(volunteer, submissionId)} />);
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      return c.html(<VolunteerForm csrf={csrf(c)} submissionId={submissionId} values={values} errors={{ form: error.message }} open={await volunteerSlots()} />, error.status as 400);
    }
  });
  app.get("/api/confirmation", async c => {
    const id = c.req.header("X-Receipt-Token") || "";
    const row = await (await storeProvider()).get(id);
    if (!row) return c.html(<Message heading="Confirmation unavailable">This private link is missing, invalid, or expired. Contact an organizer to recover your race number.</Message>, 404);
    return c.html(<Receipt row={row} />);
  });
  app.get("/api/admin/dashboard", async c => {
    const store = await storeProvider();
    return c.html(<Dashboard rows={await store.list()} volunteers={await store.listVolunteers()} csrf={csrf(c)} />);
  });
  app.get("/api/admin/roster", async c => c.html(<Roster rows={await (await storeProvider()).list()} search={(c.req.query("q") || "").slice(0, 100)} />));
  app.get("/api/admin/new", async c => c.html(<div class="paper editor-form"><RegistrationForm csrf={csrf(c)} submissionId={randomUUID()} organizer open={await volunteerSlots()} /></div>));
  app.get("/api/admin/edit/:id", async c => {
    const row = await (await storeProvider()).get(c.req.param("id"));
    if (!row) throw new Problem(404, "Registration not found or expired.");
    return c.html(<EditForm row={row} csrf={csrf(c)} />);
  });
  app.post("/api/admin/edit/:id", async c => {
    const body = await c.req.parseBody({ all: true }); checkCsrf(c, body);
    const store = await storeProvider(), old = await store.get(c.req.param("id"));
    if (!old) throw new Problem(404, "Registration not found or expired.");
    const { participant, values, errors } = validateParticipant(body);
    const etag = typeof body.etag === "string" ? body.etag : "";
    if (!etag) errors.form = "Reload this registration before saving.";
    if (!participant || Object.keys(errors).length) return c.html(<EditForm row={old} values={values} etag={etag} csrf={csrf(c)} errors={errors} />, 422);
    try { await store.update(old.id, participant, etag); }
    catch (error) {
      if (!(error instanceof Problem)) throw error;
      return c.html(<EditForm row={old} values={values} etag={etag} csrf={csrf(c)} errors={{ form: error.message }} />, error.status as 400);
    }
    return redirect(c, "/admin");
  });
  app.post("/api/admin/volunteers/:id/remove", async c => {
    const body = await c.req.parseBody(); checkCsrf(c, body);
    const store = await storeProvider(), volunteer = await store.getVolunteer(c.req.param("id"));
    if (!volunteer) throw new Problem(404, "Volunteer not found or expired.");
    await store.setVolunteerRoles(volunteer.id, volunteer.roles.filter(role => role !== body.role));
    return redirect(c, "/admin#volunteer-summary");
  });
  app.get("/api/admin/receipt/:id", async c => {
    const store = await storeProvider(), row = await store.get(c.req.param("id"));
    if (!row) throw new Problem(404, "Registration not found or expired.");
    return c.redirect("/confirmation#" + row.id, 303);
  });
  app.get("/api/admin/export", async c => csvDownload(c, "pinewood-derby-2027.csv", rosterCsv(await (await storeProvider()).list())));
  app.get("/api/admin/export/volunteers", async c => csvDownload(c, "pinewood-derby-2027-volunteers.csv", volunteersCsv(await (await storeProvider()).listVolunteers())));
  app.get("/api/admin/export/contacts", async c => csvDownload(c, "pinewood-derby-2027-contacts.csv", contactsCsv(await (await storeProvider()).list())));
  app.notFound(c => c.html(<Message heading="Page not found">Return to the home page and try again.</Message>, 404));
  return app;
}
export const app = createApp();
