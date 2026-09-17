import { createHash } from "node:crypto";
import { event, levels, raceNumberStarts, displayOpening, displayDeadline, type Level } from "./event.js";

export type Participant = { firstName: string; lastInitial: string; level: Level; troopNumber: string };
export type Registration = Participant & {
  id: string; eventId: string; kind: "registration"; raceNumber: number;
  createdAt: string; expiresAt: string; ttl: number;
  submissionHash: string; _etag?: string;
};
export type EventState = {
  id: "settings"; eventId: string; kind: "settings"; nextNumbers: Record<Level, number>;
  _etag?: string;
};
export type Errors = Partial<Record<keyof Participant | "form", string>>;
export type FormValues = Partial<Record<keyof Participant, string>>;
export class Problem extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function validateParticipant(raw: Record<string, unknown>): { values: FormValues; errors: Errors; participant?: Participant } {
  const values: FormValues = Object.fromEntries(
    ["firstName", "lastInitial", "level", "troopNumber"].map(k => [k, typeof raw[k] === "string" ? raw[k].trim() : ""]),
  );
  const errors: Errors = {};
  if (!values.firstName || values.firstName.length > 60 || !/^[\p{L}\p{M} '\u2019-]+$/u.test(values.firstName))
    errors.firstName = "Enter a first name, using up to 60 letters, spaces, apostrophes, or hyphens.";
  if (!values.lastInitial || !/^[A-Za-z]$/.test(values.lastInitial)) errors.lastInitial = "Enter one letter, A–Z, for the last initial.";
  else values.lastInitial = values.lastInitial.toUpperCase();
  if (!levels.includes(values.level as Level)) errors.level = "Choose a troop level.";
  if (!values.troopNumber || !/^\d{1,10}$/.test(values.troopNumber)) errors.troopNumber = "Enter a troop number using 1–10 digits.";
  return { values, errors, participant: Object.keys(errors).length ? undefined : values as Participant };
}

export function initialState(eventId: string = event.id): EventState {
  return { id: "settings", kind: "settings", eventId, nextNumbers: { ...raceNumberStarts } };
}
export function allocateRaceNumber(settings: EventState, level: Level) {
  const raceNumber = settings.nextNumbers[level];
  if (raceNumber >= raceNumberStarts[level] + 100)
    throw new Problem(409, `All ${level} race numbers are assigned. Contact an organizer for help.`);
  return { raceNumber, nextNumbers: { ...settings.nextNumbers, [level]: raceNumber + 1 } };
}
export function registrationOpen(now = Date.now()) {
  return now >= Date.parse(event.opensAt) && now < Date.parse(event.closesAt) && now < Date.parse(event.expiresAt);
}
export function registrationStatus(now = Date.now()) {
  if (now < Date.parse(event.opensAt)) return `Registration opens ${displayOpening()}.`;
  return registrationOpen(now) ? `Registration closes ${displayDeadline(event.closesAt)}.` : "Registration is closed. Contact an organizer for help with a late entry.";
}
export function remainingTtl(expiresAt: string, now = Date.now()) {
  const seconds = Math.floor((Date.parse(expiresAt) - now) / 1000);
  if (seconds <= 0) throw new Problem(410, "Participant records for this event have expired.");
  return seconds;
}
export const submissionHash = (p: Participant) => createHash("sha256").update(JSON.stringify([p.firstName, p.lastInitial, p.level, p.troopNumber])).digest("hex");
export const duplicateKey = (p: Participant) => [p.firstName, p.lastInitial, p.level, p.troopNumber].join("|").toLocaleLowerCase("en-US");

export function rosterCsv(rows: Registration[]) {
  const cell = (s: string | number) => {
    const value = String(s).replace(/^[=+\-@\t\r]/, character => "'" + character);
    return '"' + value.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [
    ["First Name", "Last Name", "Segment", "Car Number", "Troop Number"],
    ...[...rows].sort((a, b) => a.raceNumber - b.raceNumber)
      .map(r => [r.firstName, r.lastInitial, r.level, r.raceNumber, r.troopNumber]),
  ].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
