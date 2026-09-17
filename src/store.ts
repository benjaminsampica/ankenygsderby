import { CosmosClient, type Container, type OperationInput } from "@azure/cosmos";
import { readFileSync } from "node:fs";
import { event, levels, raceNumberStarts } from "./event.js";
import { allocateRaceNumber, initialState, Problem, registrationOpen, registrationStatus, remainingTtl, submissionHash,
  type EventState, type Participant, type Registration } from "./domain.js";

const codeOf = (error: unknown) => Number((error as { code?: number })?.code);
const clean = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("_"))) as T;
function batchSucceeded(result: Awaited<ReturnType<Container["items"]["batch"]>>, count: number) {
  if (result.result?.length === count && result.result.every(op => op.statusCode >= 200 && op.statusCode < 300)) return true;
  const failure = result.result?.find(op => op.statusCode >= 400 && op.statusCode !== 424);
  const code = failure?.statusCode || result.code || 500;
  if ([409, 412, 424, 429].includes(code)) return false;
  throw new Error("Registration transaction failed: " + code);
}
const backoff = (attempt: number) => new Promise(resolve => setTimeout(resolve, Math.min(20 * (attempt + 1), 300) + Math.random() * 50));

export class DerbyStore {
  constructor(public readonly container: Container, public readonly eventId: string = event.id) {}

  async initialize() {
    try { await this.container.items.create(initialState(this.eventId)); return; }
    catch (error) { if (codeOf(error) !== 409) throw error; }
    // Upgrade the old global counter without changing issued car numbers.
    for (let attempt = 0; attempt < 30; attempt++) {
      const settings = await this.settings();
      if (settings.nextNumbers) return;
      const nextNumbers = { ...raceNumberStarts };
      for (const row of await this.list()) for (const level of levels) {
        if (row.raceNumber >= raceNumberStarts[level] && row.raceNumber < raceNumberStarts[level] + 100)
          nextNumbers[level] = Math.max(nextNumbers[level], row.raceNumber + 1);
      }
      const upgraded = { ...clean(settings), nextNumbers } as EventState & { nextNumber?: number };
      delete upgraded.nextNumber;
      try {
        await this.container.item("settings", this.eventId).replace(upgraded, { accessCondition: { type: "IfMatch", condition: settings._etag! } });
        return;
      } catch (error) { if (codeOf(error) !== 412) throw error; }
      await backoff(attempt);
    }
    throw new Error("Event settings upgrade is busy.");
  }
  async settings(): Promise<EventState> {
    const { resource } = await this.container.item("settings", this.eventId).read<EventState>();
    if (!resource) throw new Error("Event settings are missing.");
    return resource;
  }
  async get(id: string): Promise<Registration | undefined> {
    // Older local records keep their registration: prefix; new records use plain UUIDs.
    if (!/^(registration:)?[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)) return undefined;
    try {
      const { resource } = await this.container.item(id, this.eventId).read<Registration>();
      return resource && resource.kind === "registration" && Date.parse(resource.expiresAt) > Date.now() ? resource : undefined;
    } catch (error) { if (codeOf(error) === 404) return undefined; throw error; }
  }
  async list(): Promise<Registration[]> {
    const { resources } = await this.container.items.query<Registration>({
      query: "SELECT * FROM c WHERE c.eventId = @event AND c.kind = 'registration' AND c.expiresAt > @now",
      parameters: [{ name: "@event", value: this.eventId }, { name: "@now", value: new Date().toISOString() }],
    }, { partitionKey: this.eventId }).fetchAll();
    return resources.sort((a, b) => a.raceNumber - b.raceNumber);
  }
  async register(participant: Participant, submissionId: string, organizer = false): Promise<Registration> {
    if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(submissionId))
      throw new Problem(400, "Reload the form before submitting.");
    const id = submissionId;
    const fingerprint = submissionHash(participant);
    for (let attempt = 0; attempt < 30; attempt++) {
      const existing = await this.get(id);
      if (existing) {
        if (existing.submissionHash !== fingerprint) throw new Problem(409, "This submission was already saved with different details. Open a new registration form.");
        return existing;
      }
      const settings = await this.settings();
      if (!organizer && !registrationOpen()) throw new Problem(409, registrationStatus());
      const { raceNumber, nextNumbers } = allocateRaceNumber(settings, participant.level);
      const row: Registration = {
        ...participant, id, kind: "registration", eventId: this.eventId, raceNumber,
        createdAt: new Date().toISOString(), expiresAt: event.expiresAt,
        ttl: remainingTtl(event.expiresAt), submissionHash: fingerprint,
      };
      const operations: OperationInput[] = [
        { operationType: "Replace", id: "settings", resourceBody: { ...clean(settings), nextNumbers }, ifMatch: settings._etag },
        { operationType: "Create", resourceBody: row },
      ];
      const result = await this.container.items.batch(operations, this.eventId);
      // A batch can return HTTP 207 with failed operations. Commit is successful
      // only when every operation succeeded, not merely when transport was 2xx.
      if (batchSucceeded(result, operations.length)) return row;
      await backoff(attempt);
    }
    throw new Problem(503, "Registration is busy. Please try again; your form has been kept.");
  }
  async update(id: string, participant: Participant, etag: string) {
    const old = await this.get(id);
    if (!old) throw new Problem(404, "Registration not found or expired.");
    if (old._etag !== etag) throw new Problem(409, "Someone edited this registration. Reload it before saving your changes.");
    if (participant.level !== old.level) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const current = await this.get(id);
        if (!current || current._etag !== etag) throw new Problem(409, "Someone edited this registration. Reload it before saving your changes.");
        const settings = await this.settings();
        const { raceNumber, nextNumbers } = allocateRaceNumber(settings, participant.level);
        const updated = { ...clean(old), ...participant, raceNumber, ttl: remainingTtl(old.expiresAt) };
        const result = await this.container.items.batch([
          { operationType: "Replace", id: "settings", resourceBody: { ...clean(settings), nextNumbers }, ifMatch: settings._etag },
          { operationType: "Replace", id, resourceBody: updated, ifMatch: etag },
        ], this.eventId);
        if (batchSucceeded(result, 2)) return (await this.get(id))!;
        await backoff(attempt);
      }
      throw new Problem(503, "Registration is busy. Please try again.");
    }
    try {
      const { resource } = await this.container.item(id, this.eventId).replace<Registration>({
        ...clean(old), ...participant, ttl: remainingTtl(old.expiresAt),
      }, { accessCondition: { type: "IfMatch", condition: etag } });
      return resource!;
    } catch (error) {
      if (codeOf(error) === 412) throw new Problem(409, "Someone edited this registration. Reload it before saving your changes.");
      throw error;
    }
  }

}

let ready: Promise<DerbyStore> | undefined;
export function getStore() {
  if (!ready) ready = connect().catch(error => { ready = undefined; throw error; });
  return ready;
}
async function connect() {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY || (process.env.NODE_ENV === "development" && process.env.COSMOS_KEY_FILE ? readFileSync(process.env.COSMOS_KEY_FILE, "utf8").trim() : undefined);
  if (!endpoint || !key) throw new Error("Missing database configuration.");
  if (process.env.NODE_ENV !== "development" && new URL(endpoint).protocol !== "https:")
    throw new Error("Production Cosmos connections require HTTPS.");
  const client = new CosmosClient({ endpoint, key, connectionPolicy: { enableEndpointDiscovery: false } });
  const databaseId = process.env.COSMOS_DATABASE || "pinewood";
  if (process.env.NODE_ENV === "development") {
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    await database.containers.createIfNotExists({ id: "event-data", partitionKey: { paths: ["/eventId"] }, defaultTtl: -1 });
  }
  const store = new DerbyStore(client.database(databaseId).container("event-data"));
  await store.initialize();
  return store;
}
