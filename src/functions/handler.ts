import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { app } from "../app.js";

// Small Azure adapter; the same Hono application also runs in the local Node host.
export async function handler(request: HttpRequest): Promise<HttpResponseInit> {
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : new Uint8Array(await request.arrayBuffer());
  const response = await app.fetch(new Request(request.url, {
    method: request.method, headers: Object.fromEntries(request.headers.entries()), body,
  }));
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() };
}
