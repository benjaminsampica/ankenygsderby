export const event = {
  id: "pinewood-2027",
  name: "Pinewood Derby",
  year: 2027,
  raceDate: "Saturday, January 9, 2027",
  opensAt: "2026-12-04T06:00:00.000Z",
  closesAt: "2027-01-04T06:00:00.000Z",
  expiresAt: "2027-02-08T06:00:00.000Z",
  // Volunteer sign-up opens on deploy and closes at midnight Central after Friday night set-up.
  volunteersCloseAt: "2027-01-09T06:00:00.000Z",
  timeZone: "America/Chicago",
  venue: "Ankeny Christian Church",
  address: "2506 SW 3rd St Pl, Ankeny, IA 50023",
  contactEmail: "ankenygirlscouts@gmail.com",
} as const;

export const levels = ["Daisy", "Brownie", "Junior", "Cadette", "Senior", "Ambassador", "Outlaw"] as const;
export type Level = (typeof levels)[number];
export const levelLabels: Record<Level, string> = {
  Daisy: "Daisy (K-1)", Brownie: "Brownie (2-3)", Junior: "Junior (4-5)", Cadette: "Cadette (6-8)",
  Senior: "Senior (9-10)", Ambassador: "Ambassador (11-12)", Outlaw: "Outlaw (open to anyone)",
};
export const raceNumberStarts: Record<Level, number> = {
  Daisy: 100, Brownie: 200, Junior: 300, Cadette: 400, Senior: 500, Ambassador: 600, Outlaw: 700,
};

// Approximate race-day times by group.
export const raceSchedule: { group: string; checkInEnds: string; votingEnds?: string; racing: string; awards?: string }[] = [
  { group: "Daisy", checkInEnds: "9:30 am", votingEnds: "9:45 am", racing: "Begins 10:00 am", awards: "10:30 am" },
  { group: "Brownie", checkInEnds: "10:15 am", votingEnds: "10:30 am", racing: "10:30-10:45 am", awards: "11:30 am" },
  { group: "Junior", checkInEnds: "11:15 am", votingEnds: "11:30 am", racing: "11:30-11:45 am", awards: "12:15 pm" },
  { group: "Cadette and up", checkInEnds: "11:45 am", votingEnds: "12:00 pm", racing: "12:00-12:15 pm", awards: "12:45 pm" },
  { group: "Outlaw", checkInEnds: "11:45 am", racing: "After the last group" },
];

export const volunteerRoles = [
  { id: "setup", label: "Friday night set-up", when: "Friday, January 8, 6-9 pm", description: "Set up the track, tables, signs, and other event needs.", slots: 4 },
  { id: "check-in", label: "Check-in", when: "Race day, 8:30 am-12:00 pm", description: "Check in racers as they arrive and weigh cars.", slots: 2 },
  { id: "runner", label: "Runner", when: "Race day, 8:30 am-12:00 pm", description: "Help check-in place cars on the staging table.", slots: 1 },
  { id: "track-runner", label: "Track car runner", when: "Race day, 8:30 am-12:00 pm", description: "Return cars from the finish line to the staging table.", slots: 2 },
  { id: "loader", label: "Racetrack loader", when: "Race day, 8:30 am-12:00 pm", description: "Place cars in the correct starting lanes.", slots: 1 },
  { id: "race-controller", label: "Race controller", when: "Race day, 8:30 am-12:00 pm", description: "Run the race software on the computer.", slots: 1 },
  { id: "emcee", label: "Emcee", when: "Race day, 8:30 am-12:00 pm", description: "Announce the racers.", slots: 1 },
  { id: "vote-counter", label: "Vote counter", when: "Race day, 8:30 am-12:00 pm", description: "Add up votes for the three design awards.", slots: 1 },
  { id: "cleanup", label: "Clean-up", when: "Race day, after racing", description: "Tear down and leave the space better than we found it.", slots: 4 },
] as const;
export type VolunteerRole = (typeof volunteerRoles)[number]["id"];

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
