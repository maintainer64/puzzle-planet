export const OBJECTS = ["asteroid", "comet", "cloud", "dwarf", "empty", "x"] as const;
export type ObjectType = (typeof OBJECTS)[number];
export const META: Record<ObjectType, { name: string; plural: string; icon: string; color: string }> = {
  asteroid: { name: "Астероид", plural: "астероиды", icon: "◆", color: "#b8a691" },
  comet: { name: "Комета", plural: "кометы", icon: "☄", color: "#87d5df" },
  cloud: { name: "Газовое облако", plural: "газовые облака", icon: "≋", color: "#aa9df4" },
  dwarf: { name: "Карликовая планета", plural: "карликовые планеты", icon: "◉", color: "#eab67c" },
  empty: { name: "Пустой сектор", plural: "пустые секторы", icon: "∅", color: "#8c98ad" },
  x: { name: "Планета X", plural: "Планета X", icon: "✦", color: "#d8fb98" },
};
export const COLORS = ["#d8fb98", "#ae9afa", "#80d3e6", "#eda47e"];
export type Mode = "standard" | "expert";
export function counts(mode: Mode): Record<ObjectType, number> {
  return { asteroid: 4, comet: 2, cloud: 2, dwarf: mode === "expert" ? 4 : 1, empty: mode === "expert" ? 5 : 2, x: 1 };
}
export type Entry = { id: number; text: string; time: number; type: "action" | "info" | "theory" | "end" };
export type Theory = { id: string; playerId: string; sector: number; object: ObjectType; age: number; phase: number; result: "pending" | "correct" | "wrong" };
export type PublicPlayer = { id: string; name: string; color: string; time: number; targets: number; order: number; score: number; xScore: number; leaderScore: number; lastSeen: number };
export type Me = PublicPlayer & { notes: number[][]; memo: string; hints: string[]; history: Entry[]; research: number[]; lastAction: string; finalDone: boolean };
export type View = {
  code: string; version: number; hostId: string; expiresAt: number; status: "lobby" | "playing" | "theory" | "final" | "finished";
  mode: Mode; size: number; earth: number; phase: number; activeId: string | null;
  players: PublicPlayer[]; me: Me; log: Entry[]; theories: (Omit<Theory, "object"> & { object: ObjectType | null })[];
  confirmed: Record<number, ObjectType>; conferences: string[]; topics: { id: number; title: string }[];
  submitted: string[]; finalCapacity: number; board: ObjectType[] | null; winners: string[];
};
export type TheoryDraft = { sector: number; object: ObjectType };
export type Action =
  | { type: "start" }
  | { type: "survey"; object: ObjectType; start: number; length: number }
  | { type: "target"; sector: number }
  | { type: "research"; topic: number }
  | { type: "locate"; sector: number; left: ObjectType; right: ObjectType }
  | { type: "theory"; theories: TheoryDraft[] }
  | { type: "notes"; notes: number[][]; memo: string };
export function visibleSectors(earth: number, size: number) {
  return Array.from({ length: size / 2 }, (_, i) => (earth + i) % size + 1);
}
