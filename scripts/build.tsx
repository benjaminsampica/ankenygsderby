import { mkdir, cp, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { build } from "esbuild";
import { Home, RegisterPage, GuidePage, ConfirmationPage, AdminPage, Layout } from "../src/views.js";

async function buildSite() {
  await mkdir("dist/site", { recursive: true });
  const pages = { "index.html": <Home />, "register/index.html": <RegisterPage />, "guide/index.html": <GuidePage />, "confirmation/index.html": <ConfirmationPage />, "admin/index.html": <AdminPage />,
    "403.html": <Layout title="Organizer access required" page="error"><section class="narrow"><p class="eyebrow">ORGANIZER ACCESS</p><h1>Organizer access required</h1><p>Use the Microsoft account invited by an organizer. Signing in alone does not grant access.</p><a class="button" href="/.auth/logout?post_logout_redirect_uri=/admin" hx-boost="false">Try another account</a></section></Layout>,
    "404.html": <Layout title="Page not found" page="error"><section class="narrow"><h1>Page not found</h1><p>This page wasn’t found.</p><a class="button" href="/">Back to the derby</a></section></Layout> };
  for (const [path, component] of Object.entries(pages)) {
    await mkdir("dist/site/" + path.split("/").slice(0, -1).join("/"), { recursive: true });
    await writeFile("dist/site/" + path, "<!doctype html>" + component.toString());
  }
  await cp("public", "dist/site", { recursive: true });
  await cp("node_modules/htmx.org/dist/htmx.min.js", "dist/site/htmx.min.js");
  await cp("node_modules/htmx.org/dist/ext/hx-preload.min.js", "dist/site/hx-preload.min.js");
  await cp("staticwebapp.config.json", "dist/site/staticwebapp.config.json");
}
async function buildApi() {
  await build({ entryPoints: ["src/functions/http.ts"], outfile: "dist/api/functions/http.js", bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", sourcemap: true });
  await writeFile("dist/api/host.json", JSON.stringify({ version: "2.0", extensions: { http: { routePrefix: "api" } } }, null, 2));
  await writeFile("dist/api/package.json", JSON.stringify({ name: "pinewood-api", private: true, type: "module", main: "functions/*.js", engines: { node: "22.x" }, dependencies: { "@azure/functions": "4.16.5", "@azure/cosmos": "4.10.1", hono: "4.13.8" } }, null, 2));
}
await buildSite();
if (!process.argv.includes("--watch")) await buildApi();
console.log("Site built in dist/site; managed API built in dist/api.");
if (process.argv.includes("--watch")) {
  // Restart this module when TSX changes so imported components are refreshed.
  const { spawn } = await import("node:child_process");
  let timer: ReturnType<typeof setTimeout>, building = false, pending = false;
  const rebuild = () => {
    if (building) { pending = true; return; }
    building = true;
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/build.tsx"], { stdio: "inherit" });
    child.on("exit", () => { building = false; if (pending) { pending = false; rebuild(); } });
  };
  for (const directory of ["src", "public"]) watch(directory, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); });
  watch("staticwebapp.config.json", () => rebuild());
}
