export const event = {
  id: "pinewood-2027",
  name: "Pinewood Derby",
  year: 2027,
  raceDate: "Saturday, January 9, 2027",
  opensAt: "2026-12-04T06:00:00.000Z",
  closesAt: "2027-01-04T06:00:00.000Z",
  expiresAt: "2027-02-08T06:00:00.000Z",
  timeZone: "America/Chicago",
  venue: "Ankeny Christian Church",
  address: "2506 SW 3rd St Pl, Ankeny, IA 50023",
  raceTimes: "Race times coming soon.",
  contactEmail: "ankenygirlscouts@gmail.com",
} as const;

export const levels = ["Daisy", "Brownie", "Junior", "Cadette", "Senior", "Ambassador"] as const;
export type Level = (typeof levels)[number];
export const raceNumberStarts: Record<Level, number> = {
  Daisy: 100, Brownie: 200, Junior: 300, Cadette: 400, Senior: 500, Ambassador: 600,
};

export function displayDeadline(iso: string) {
  // The cutoff is exclusive: show the last minute available for registration.
  return new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone, month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(Date.parse(iso) - 60_000)) + " Central";
}

export function displayOpening() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone, month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(event.opensAt)) + " Central";
}
