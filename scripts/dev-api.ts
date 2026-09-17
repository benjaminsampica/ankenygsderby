import { serve } from "@hono/node-server";
import { app } from "../src/app.js";
import { getStore } from "../src/store.js";

for (let attempt = 0; ; attempt++) {
  try { await getStore(); break; }
  catch (error) {
    if (attempt >= 40) throw error;
    if (attempt === 0) console.log("Waiting for local Cosmos DB…");
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 7071 }, () => console.log("API ready at http://127.0.0.1:7071"));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { server.close(); process.exit(0); });
