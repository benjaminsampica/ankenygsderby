import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const tasks = process.argv[2] === "all" ? ["api", "assets", "web"] : [process.argv[2]];
const children = [];
let exiting = false;
function stop(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500).unref();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const task of tasks) {
  let args;
  if (task === "api") args = ["--import", "tsx", "--watch", "scripts/dev-api.ts"];
  else if (task === "assets") args = ["--import", "tsx", "scripts/build.tsx", "--watch"];
  else if (task === "web") {
    for (let attempt = 0; ; attempt++) {
      try { const response = await fetch("http://127.0.0.1:7071/api/health"); if (response.ok) break; } catch {}
      if (attempt > 120) throw new Error("API failed to become ready.");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    args = [require.resolve("@azure/static-web-apps-cli/dist/cli/bin.js"), "start", "dist/site", "--api-devserver-url", "http://127.0.0.1:7071", "--host", "0.0.0.0", "--port", "4280", "--verbose", "warning"];
  } else throw new Error("Unknown development task: " + task);
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
  children.push(child);
  child.on("exit", code => { if (!exiting) stop(code || 0); });
  child.on("error", error => { console.error(error.message); stop(1); });
}
