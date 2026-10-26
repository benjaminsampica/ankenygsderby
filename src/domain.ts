import { createHash } from "node:crypto";
import { event, levels, raceNumberStarts, displayOpening, displayDeadline, volunteerRoles, type Level, type VolunteerRole } from "./event.js";

const textFields = ["firstName", "lastName", "level", "troopNumber", "parentName", "parentPhone", "emergencyName", "emergencyPhone"] as const;
type TextField = (typeof textFields)[number];
export type Participant = {
  firstName: string; lastName: string; level: Level; troopNumber: string;
  parentName: string; parentPhone: string; emergencyName: string; emergencyPhone: string;
  photoConsent: boolean;
};
export type Registration = Participant & {
  id: string; eventId: string; kind: "registration"; raceNumber: number;
  createdAt: string; expiresAt: string; ttl: number;
  submissionHash: string; _etag?: string;
};
export type VolunteerSignup = { name: string; phone: string; roles: VolunteerRole[] };
export type Volunteer = VolunteerSignup & {
  id: string; eventId: string; kind: "volunteer";
  // Set when the volunteer signed up while registering a racer.
  registrationId?: string;
  createdAt: string; expiresAt: string; ttl: number; submissionHash: string; _etag?: string;
};
export type VolunteerCounts = Partial<Record<VolunteerRole, number>>;
export type EventState = {
  id: "settings"; eventId: string; kind: "settings"; nextNumbers: Record<Level, number>;
  // Missing on settings saved before volunteer sign-up existed.
  volunteerCounts?: VolunteerCounts;
  _etag?: string;
};
export type Errors = Partial<Record<TextField | "volunteerName" | "volunteerPhone" | "volunteerRoles" | "form", string>>;
export type FormValues = Partial<Record<TextField | "volunteerName" | "volunteerPhone", string>> & { photoConsent?: boolean; volunteer?: boolean; volunteerRoles?: readonly string[] };
export class Problem extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const namePattern = /^[\p{L}\p{M} '’-]+$/u;
const validName = (value: string | undefined, max: number) => !!value && value.length <= max && namePattern.test(value);
function normalizePhone(value: string) {
  if (!/^[\d\s().+-]+$/.test(value)) return undefined;
  const digits = value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return /^[2-9]\d{9}$/.test(digits) ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : undefined;
}

function parseRoles(raw: Record<string, unknown>, errors: Errors, emptyMessage: string) {
  const submitted = [raw.volunteerRoles].flat().filter((role): role is string => typeof role === "string");
  const roles = volunteerRoles.map(role => role.id).filter(id => submitted.includes(id));
  if (!submitted.length) errors.volunteerRoles = emptyMessage;
  else if (submitted.length !== roles.length) errors.volunteerRoles = "Choose volunteer roles from the list.";
  return { submitted, roles };
}

export function validateParticipant(raw: Record<string, unknown>): { values: FormValues; errors: Errors; participant?: Participant; volunteerRoles: VolunteerRole[] } {
  const text = Object.fromEntries(textFields.map(k => [k, typeof raw[k] === "string" ? raw[k].trim() : ""])) as Record<TextField, string>;
  const errors: Errors = {};
  if (!validName(text.firstName, 60)) errors.firstName = "Enter a first name, using up to 60 letters, spaces, apostrophes, or hyphens.";
  if (!validName(text.lastName, 60)) errors.lastName = "Enter a last name, using up to 60 letters, spaces, apostrophes, or hyphens.";
  if (!levels.includes(text.level as Level)) errors.level = "Choose a troop level.";
  if (text.troopNumber ? !/^\d{1,10}$/.test(text.troopNumber) : text.level !== "Outlaw") errors.troopNumber = "Enter a troop number using 1-10 digits.";
  if (!validName(text.parentName, 100)) errors.parentName = "Enter the parent or guardian's name, using up to 100 letters, spaces, apostrophes, or hyphens.";
  if (!validName(text.emergencyName, 100)) errors.emergencyName = "Enter the emergency contact's name, using up to 100 letters, spaces, apostrophes, or hyphens.";
  const parentPhone = normalizePhone(text.parentPhone), emergencyPhone = normalizePhone(text.emergencyPhone);
  if (parentPhone) text.parentPhone = parentPhone;
  else errors.parentPhone = "Enter a 10-digit phone number for the parent or guardian.";
  if (emergencyPhone) text.emergencyPhone = emergencyPhone;
  else errors.emergencyPhone = "Enter a 10-digit phone number for the emergency contact.";
  if (parentPhone && parentPhone === emergencyPhone) errors.emergencyPhone = "Enter someone who won't be at the race, with a different phone number than the parent or guardian.";

  const photoConsent = raw.photoConsent === "yes", volunteer = raw.volunteer === "yes";
  const { submitted, roles } = volunteer ? parseRoles(raw, errors, "Choose at least one volunteer role, or uncheck volunteering.") : { submitted: [], roles: [] };

  const values: FormValues = { ...text, photoConsent, volunteer, volunteerRoles: submitted };
  const valid = !Object.keys(errors).length;
  return { values, errors, participant: valid ? { ...text, level: text.level as Level, photoConsent } : undefined, volunteerRoles: roles };
}
export function validateVolunteer(raw: Record<string, unknown>): { values: FormValues; errors: Errors; volunteer?: VolunteerSignup } {
  const text = (key: string) => typeof raw[key] === "string" ? raw[key].trim() : "";
  const values: FormValues = { volunteerName: text("volunteerName"), volunteerPhone: text("volunteerPhone") };
  const errors: Errors = {};
  if (!validName(values.volunteerName, 100)) errors.volunteerName = "Enter your name, using up to 100 letters, spaces, apostrophes, or hyphens.";
  const phone = normalizePhone(values.volunteerPhone!);
  if (phone) values.volunteerPhone = phone;
  else errors.volunteerPhone = "Enter a 10-digit phone number.";
  const { submitted, roles } = parseRoles(raw, errors, "Choose at least one volunteer role.");
  values.volunteerRoles = submitted;
  return { values, errors, volunteer: Object.keys(errors).length ? undefined : { name: values.volunteerName!, phone: phone!, roles } };
}

export function initialState(eventId: string = event.id): EventState {
  return { id: "settings", kind: "settings", eventId, nextNumbers: { ...raceNumberStarts }, volunteerCounts: {} };
}
export function allocateRaceNumber(settings: EventState, level: Level) {
  // Settings saved before a level existed have no counter for it yet.
  const raceNumber = settings.nextNumbers[level] ?? raceNumberStarts[level];
  if (raceNumber >= raceNumberStarts[level] + 100)
    throw new Problem(409, `All ${level} race numbers are assigned. Contact an organizer for help.`);
  return { raceNumber, nextNumbers: { ...settings.nextNumbers, [level]: raceNumber + 1 } };
}
export function openSlots(counts: VolunteerCounts = {}) {
  return Object.fromEntries(volunteerRoles.map(role => [role.id, Math.max(0, role.slots - (counts[role.id] ?? 0))])) as Record<VolunteerRole, number>;
}
export function claimVolunteerSlots(counts: VolunteerCounts = {}, oldRoles: readonly VolunteerRole[], newRoles: readonly VolunteerRole[]) {
  const next = { ...counts };
  for (const role of oldRoles) if (!newRoles.includes(role)) next[role] = Math.max(0, (next[role] ?? 0) - 1);
  for (const { id, label, slots } of volunteerRoles) {
    if (!newRoles.includes(id) || oldRoles.includes(id)) continue;
    if ((next[id] ?? 0) >= slots) throw new Problem(409, `The ${label} role is full. Choose another role.`);
    next[id] = (next[id] ?? 0) + 1;
  }
  return next;
}
export const volunteerSignupOpen = (now = Date.now()) => now < Date.parse(event.volunteersCloseAt);
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
export const submissionHash = (p: Participant) => createHash("sha256").update(JSON.stringify([...textFields.map(k => p[k]), p.photoConsent])).digest("hex");
export const volunteerHash = (v: VolunteerSignup) => createHash("sha256").update(JSON.stringify([v.name, v.phone, v.roles])).digest("hex");
export const duplicateKey = (p: Participant) => [p.firstName, p.lastName, p.level, p.troopNumber].join("|").toLocaleLowerCase("en-US");

function csv(rows: (string | number)[][]) {
  const cell = (s: string | number) => {
    const value = String(s).replace(/^[=+\-@\t\r]/, character => "'" + character);
    return '"' + value.replace(/"/g, '""') + '"';
  };
  return "﻿" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
const byRaceNumber = (rows: Registration[]) => [...rows].sort((a, b) => a.raceNumber - b.raceNumber);
export function rosterCsv(rows: Registration[]) {
  return csv([
    ["First Name", "Last Name", "Segment", "Car Number", "Troop Number"],
    ...byRaceNumber(rows).map(r => [r.firstName, r.lastName, r.level, r.raceNumber, r.troopNumber]),
  ]);
}
const roleLabels = (roles: readonly VolunteerRole[]) => volunteerRoles.filter(role => roles.includes(role.id)).map(role => role.label);
export function contactsCsv(rows: Registration[]) {
  return csv([
    ["Car Number", "First Name", "Last Name", "Level", "Troop", "Parent/Guardian", "Parent Phone", "Emergency Contact", "Emergency Phone", "Photo Consent"],
    ...byRaceNumber(rows).map(r => [r.raceNumber, r.firstName, r.lastName, r.level, r.troopNumber, r.parentName, r.parentPhone,
      r.emergencyName, r.emergencyPhone, r.photoConsent ? "Yes" : "No"]),
  ]);
}
export function volunteersCsv(rows: Volunteer[]) {
  return csv([
    ["Name", "Phone", "Roles", "Signed Up While Registering"],
    ...[...rows].sort((a, b) => a.name.localeCompare(b.name)).map(v => [v.name, v.phone, roleLabels(v.roles).join("; "), v.registrationId ? "Yes" : "No"]),
  ]);
}
