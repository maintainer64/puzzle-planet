import { COLORS, META, OBJECTS, counts, visibleSectors, type Action, type Entry, type Me, type Mode, type ObjectType, type PublicPlayer, type Theory, type TheoryDraft, type View } from "../model";

export class GameError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Player = Me & { userId: string };
type Topic = { id: number; title: string; text: string };
export type Room = {
  code: string; version: number; hostId: string; createdAt: number; updatedAt: number; mode: Mode; size: number;
  status: View["status"]; board: ObjectType[]; earth: number; phase: number; sequence: number;
  players: Player[]; log: Entry[]; theories: Theory[]; confirmed: Record<number, ObjectType>;
  topics: Topic[]; conferenceClues: string[]; conferences: string[];
  submissions: Record<string, TheoryDraft[]>; finderId: string | null; finalQueue: string[]; winners: string[];
};
const prime = new Set([2, 3, 5, 7, 11, 13, 17]);
const theoryObjects: ObjectType[] = ["asteroid", "comet", "cloud", "dwarf"];
const mod = (n: number, size: number) => (n % size + size) % size;
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
function shuffle<T>(items: T[], rng = random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function validBoard(board: ObjectType[], mode: Mode): boolean {
  const size = mode === "expert" ? 18 : 12;
  if (board.length !== size || OBJECTS.some(t => board.filter(x => x === t).length !== counts(mode)[t])) return false;
  const around = (i: number) => [board[mod(i - 1, size)], board[mod(i + 1, size)]];
  if (board.some((t, i) => (t === "comet" && !prime.has(i + 1)) || (t === "asteroid" && !around(i).includes("asteroid")) || (t === "cloud" && !around(i).includes("empty")) || (t === "x" && around(i).includes("dwarf")))) return false;
  if (mode === "expert") {
    return board.some((t, i) => t === "dwarf" && board[mod(i + 5, size)] === "dwarf" && Array.from({ length: 6 }, (_, j) => board[mod(i + j, size)]).filter(x => x === "dwarf").length === 4);
  }
  return true;
}
export function generateBoard(mode: Mode, rng = random): ObjectType[] {
  const size = mode === "expert" ? 18 : 12;
  // Constrain dwarfs and comets first; rejection-sample the other legal placements.
  for (let attempt = 0; attempt < 100000; attempt++) {
    const board = Array<ObjectType | null>(size).fill(null);
    if (mode === "expert") {
      const start = Math.floor(rng() * size);
      for (const d of [0, 5, ...shuffle([1, 2, 3, 4], rng).slice(0, 2)]) board[mod(start + d, size)] = "dwarf";
    }
    const slots = shuffle(Array.from({ length: size }, (_, i) => i).filter(i => prime.has(i + 1) && board[i] === null), rng);
    if (slots.length < 2) continue;
    board[slots[0]] = board[slots[1]] = "comet";
    const rest = shuffle(OBJECTS.flatMap(t => Array<ObjectType>(counts(mode)[t] - board.filter(x => x === t).length).fill(t)), rng);
    const result = board.map(t => t ?? rest.pop()!);
    if (validBoard(result, mode)) return result;
  }
  throw new GameError("Не удалось построить карту. Попробуйте ещё раз.", 503);
}
function relation(board: ObjectType[], a: ObjectType, b: ObjectType, distance: number): string {
  const size = board.length;
  const adjacent = board.some((t, i) => t === a && [board[mod(i - distance, size)], board[mod(i + distance, size)]].includes(b));
  const subject = a === "x" ? "Планета X" : `Хотя бы один объект «${META[a].name}»`;
  const negativeSubject = a === "x" ? "Планета X" : `Ни один объект «${META[a].name}»`;
  const relationName = distance === 1 ? "соседствует с" : "находится напротив объекта";
  return `${adjacent ? subject : negativeSubject} ${adjacent ? "" : "не "}${relationName} «${META[b].name}».`;
}
function makeTopics(board: ObjectType[]): Topic[] {
  const pairs: [ObjectType, ObjectType, number][] = [
    ["asteroid", "comet", 1], ["cloud", "dwarf", 1], ["comet", "dwarf", board.length / 2],
    ["asteroid", "cloud", 1], ["dwarf", "asteroid", board.length / 2], ["cloud", "comet", 1],
  ];
  return pairs.map(([a, b, distance], id) => ({ id, title: `${META[a].name} / ${META[b].name}`, text: relation(board, a, b, distance) }));
}
function addPlayer(room: Room, userId: string, name: string): Player {
  if (!name || name.length > 24) throw new GameError("Имя должно содержать от 1 до 24 символов.");
  const player: Player = {
    id: crypto.randomUUID(), userId, name, color: COLORS[room.players.length], time: 0, order: room.sequence++, targets: 2,
    notes: Array.from({ length: room.size }, () => Array(6).fill(0)), memo: "", hints: [], history: [], research: [], lastAction: "", finalDone: false,
    score: 0, xScore: 0, leaderScore: 0, lastSeen: Date.now(),
  };
  room.players.push(player);
  return player;
}
export function createRoom(code: string, userId: string, name: string, mode: Mode): Room {
  if (mode !== "standard" && mode !== "expert") throw new GameError("Неизвестный режим.");
  const now = Date.now();
  const room: Room = { code, version: 1, hostId: "", createdAt: now, updatedAt: now, mode, size: mode === "expert" ? 18 : 12,
    status: "lobby", board: [], earth: 0, phase: 0, sequence: 0, players: [], log: [], theories: [], confirmed: {}, topics: [],
    conferenceClues: [], conferences: [], submissions: {}, finderId: null, finalQueue: [], winners: [] };
  room.hostId = addPlayer(room, userId, name).id;
  return room;
}
export function joinRoom(room: Room, userId: string, name: string) {
  if (room.players.some(p => p.userId === userId)) return;
  if (room.status !== "lobby") throw new GameError("Партия уже началась; новые игроки не могут войти.", 409);
  if (room.players.length >= 4) throw new GameError("В комнате уже четыре игрока.", 409);
  addPlayer(room, userId, name);
}
function ordered(room: Room) { return [...room.players].sort((a, b) => a.time - b.time || a.order - b.order); }
function event(room: Room, text: string, type: Entry["type"] = "info", player?: Player) {
  const item = { id: room.sequence++, text, time: Date.now(), type };
  (player ? player.history : room.log).push(item);
}
function move(room: Room, player: Player, amount: number) { player.time += amount; player.order = room.sequence++; }
function sectorNumber(value: number, room: Room): number {
  if (!Number.isInteger(value) || value < 1 || value > room.size) throw new GameError("Сектор вне поля.");
  return value;
}
function objectType(value: string): ObjectType {
  if (!OBJECTS.includes(value as ObjectType)) throw new GameError("Неизвестный объект.");
  return value as ObjectType;
}
function requireVisible(room: Room, sector: number) {
  sectorNumber(sector, room);
  if (!visibleSectors(room.earth, room.size).includes(sector)) throw new GameError("Этот сектор сейчас скрыт за горизонтом.");
}
function capacity(room: Room, player: Player) {
  const finder = room.players.find(p => p.id === room.finderId);
  if (!finder || !room.finalQueue.includes(player.id)) return 0;
  return finder.time - player.time >= 4 ? 2 : 1;
}
function validateTheories(room: Room, player: Player, drafts: TheoryDraft[], limit: number) {
  if (!Array.isArray(drafts) || drafts.length > limit) throw new GameError(`Можно предложить не более ${limit} теорий.`);
  const existing = room.theories.filter(t => t.playerId === player.id);
  for (const d of drafts) {
    sectorNumber(d.sector, room); objectType(d.object);
    if (!theoryObjects.includes(d.object)) throw new GameError("Теории можно выдвигать об астероидах, кометах, облаках и карликовых планетах.");
    if (room.confirmed[d.sector]) throw new GameError("Этот сектор уже подтверждён.");
    if (drafts.filter(x => x.sector === d.sector).length > 1) throw new GameError("Две теории в одном секторе в одной фазе запрещены.");
    if (existing.some(t => t.sector === d.sector && t.object === d.object)) throw new GameError("Вы уже выдвинули эту теорию.");
    if (existing.filter(t => t.object === d.object).length + drafts.filter(t => t.object === d.object).length > counts(room.mode)[d.object]) throw new GameError("Жетоны этого объекта закончились.");
  }
}
function placeTheories(room: Room, player: Player, drafts: TheoryDraft[]) {
  for (const d of drafts) room.theories.push({ ...d, id: crypto.randomUUID(), playerId: player.id, age: 0, phase: room.phase, result: "pending" });
}
function review(room: Room) {
  for (let sector = 1; sector <= room.size; sector++) {
    const ready = room.theories.filter(t => t.sector === sector && t.result === "pending" && t.age >= 3);
    if (!ready.length) continue;
    const correct = ready.some(t => t.object === room.board[sector - 1]);
    if (correct) room.confirmed[sector] = room.board[sector - 1];
    const resolved = correct ? room.theories.filter(t => t.sector === sector && t.result === "pending") : ready;
    // Preserve pawn order when several incorrect theories receive the same penalty.
    const order = ordered(room).map(p => p.id);
    resolved.sort((a, b) => order.indexOf(a.playerId) - order.indexOf(b.playerId));
    for (const t of resolved) {
      t.result = t.object === room.board[sector - 1] ? "correct" : "wrong";
      const p = room.players.find(p => p.id === t.playerId)!;
      event(room, `${p.name}: сектор ${sector}, ${META[t.object].name} — ${t.result === "correct" ? "подтверждено" : "неверно (+1 время)"}.`, "theory");
      if (t.result === "wrong") move(room, p, 1);
    }
  }
}
function advanceEarth(room: Room) {
  while (room.earth < Math.min(...room.players.map(p => p.time))) {
    room.earth++;
    const position = room.earth % room.size;
    const conferencePositions = room.mode === "expert" ? [5, 11] : [5, 10];
    const conference = conferencePositions.indexOf(position);
    if (conference >= 0 && !room.conferences.includes(room.conferenceClues[conference])) {
      room.conferences.push(room.conferenceClues[conference]);
      event(room, `Конференция ${conference + 1}: ${room.conferenceClues[conference]}`);
    }
    if (position % 3 === 2) {
      room.phase++; room.status = "theory"; room.submissions = {};
      event(room, `Фаза теорий ${room.phase}. Каждый игрок выбирает теории или пропускает.`, "theory");
      return;
    }
  }
  room.status = "playing";
}
function finish(room: Room) {
  for (const t of room.theories) t.result = t.object === room.board[t.sector - 1] ? "correct" : "wrong";
  const points = { asteroid: 2, comet: 3, cloud: 4, dwarf: room.mode === "expert" ? 2 : 4, empty: 0, x: 0 };
  for (const p of room.players) {
    const correct = room.theories.filter(t => t.playerId === p.id && t.result === "correct");
    p.leaderScore = correct.filter(t => !room.theories.some(other => other.sector === t.sector && other.result === "correct" && other.phase < t.phase)).length;
    p.score = p.xScore + p.leaderScore + correct.reduce((sum, t) => sum + points[t.object], 0);
  }
  const ranked = [...room.players].sort((a, b) => b.score - a.score || b.xScore - a.xScore || b.leaderScore - a.leaderScore);
  const first = ranked[0];
  room.winners = ranked.filter(p => p.score === first.score && p.xScore === first.xScore && p.leaderScore === first.leaderScore).map(p => p.id);
  room.status = "finished";
  event(room, `Исследование завершено. Планета X — сектор ${room.board.indexOf("x") + 1}. Победитель: ${room.players.filter(p => room.winners.includes(p.id)).map(p => p.name).join(", ")}.`, "end");
}
function completeFinal(room: Room, player: Player) {
  player.finalDone = true; room.finalQueue = room.finalQueue.filter(id => id !== player.id);
  if (!room.finalQueue.length) finish(room);
}
function correctLocation(room: Room, sector: number, left: ObjectType, right: ObjectType) {
  sectorNumber(sector, room); objectType(left); objectType(right);
  return room.board[sector - 1] === "x" && room.board[mod(sector - 2, room.size)] === left && room.board[mod(sector, room.size)] === right;
}
export function applyAction(room: Room, userId: string, action: Action) {
  const player = room.players.find(p => p.userId === userId);
  if (!player) throw new GameError("Вы не участник этой комнаты.", 403);
  if (room.log.length > 2000 && action.type !== "notes") throw new GameError("Партия слишком длинная. Создайте новую комнату.", 409);
  if (action.type === "notes") {
    if (!Array.isArray(action.notes) || action.notes.length !== room.size || action.notes.some(row => !Array.isArray(row) || row.length !== 6 || row.some(n => ![0, 1, 2].includes(n))) || typeof action.memo !== "string" || action.memo.length > 3000) throw new GameError("Некорректные заметки.");
    player.notes = action.notes; player.memo = action.memo; return;
  }
  if (action.type === "start") {
    if (player.id !== room.hostId || room.status !== "lobby") throw new GameError("Только создатель может начать новую партию.", 403);
    room.board = generateBoard(room.mode); room.topics = makeTopics(room.board);
    room.conferenceClues = [relation(room.board, "x", "comet", room.size / 2), relation(room.board, "x", "cloud", 1)];
    const initialOrder = shuffle(room.players);
    for (const p of initialOrder) {
      p.order = room.sequence++;
      const clues = shuffle(room.board.flatMap((t, i) => theoryObjects.filter(o => o !== t).map(o => `Сектор ${i + 1}: здесь нет объекта «${META[o].name}».`))).slice(0, 4);
      p.hints = clues;
    }
    room.status = "playing"; event(room, "Новая карта неба построена. Результаты наблюдений видны только исследователю."); return;
  }
  if (room.status === "lobby" || room.status === "finished") throw new GameError("Сейчас нельзя выполнять действия.", 409);
  if (room.status === "theory") {
    if (action.type !== "theory") throw new GameError("Ожидаем теории от всех игроков.", 409);
    if (player.id in room.submissions) throw new GameError("Вы уже выбрали теории для этой фазы.", 409);
    validateTheories(room, player, action.theories, room.mode === "expert" ? 2 : 1);
    room.submissions[player.id] = action.theories;
    if (Object.keys(room.submissions).length === room.players.length) {
      for (const p of ordered(room)) placeTheories(room, p, room.submissions[p.id]);
      for (const t of room.theories) if (t.result === "pending") t.age++;
      review(room); room.submissions = {}; advanceEarth(room);
    }
    return;
  }
  const active = room.status === "final" ? room.finalQueue[0] : ordered(room)[0].id;
  if (player.id !== active) throw new GameError("Сейчас ход другого игрока.", 409);
  if (room.status === "final") {
    if (action.type === "theory") {
      validateTheories(room, player, action.theories, capacity(room, player)); placeTheories(room, player, action.theories);
      event(room, `${player.name} завершил финальное выдвижение теорий.`, "theory");
    } else if (action.type === "locate") {
      const success = correctLocation(room, action.sector, action.left, action.right);
      if (success) player.xScore = Math.min(10, 2 * (room.players.find(p => p.id === room.finderId)!.time - player.time));
      event(room, `${player.name}: финальный поиск ${success ? "успешен" : "неуспешен"}.`, "end");
      event(room, `Поиск в секторе ${action.sector}: ${success ? "Планета X найдена" : "гипотеза неверна"}.`, "action", player);
    } else throw new GameError("В финале можно предложить теории или найти Планету X.");
    completeFinal(room, player); return;
  }
  let cost: number;
  switch (action.type) {
    case "survey": {
      objectType(action.object);
      if (action.object === "x") throw new GameError("Планета X не видна при обзоре.");
      if (!Number.isInteger(action.length) || action.length < 1 || action.length > room.size / 2) throw new GameError("Неверная длина обзора.");
      const start = sectorNumber(action.start, room);
      const sectors = Array.from({ length: action.length }, (_, i) => mod(start - 1 + i, room.size) + 1);
      for (const sector of sectors) requireVisible(room, sector);
      if (action.object === "comet" && (!prime.has(start) || !prime.has(sectors.at(-1)!))) throw new GameError("Обзор комет должен начинаться и заканчиваться в простых секторах.");
      const amount = sectors.filter(s => room.board[s - 1] === action.object || (action.object === "empty" && room.board[s - 1] === "x")).length;
      const description = `Обзор: ${META[action.object].name}, секторы ${sectors.join(", ")}`;
      event(room, `${player.name} • ${description}.`, "action");
      event(room, `${description} → ${amount}.`, "action", player);
      cost = action.length <= 3 ? 4 : action.length <= 6 ? 3 : 2; break;
    }
    case "target": {
      requireVisible(room, action.sector);
      if (!player.targets) throw new GameError("Оба прицельных наблюдения уже использованы.");
      player.targets--; const found = room.board[action.sector - 1];
      event(room, `${player.name} • Прицельное наблюдение сектора ${action.sector}.`, "action");
      event(room, `Сектор ${action.sector}: ${META[found === "x" ? "empty" : found].name}${found === "empty" || found === "x" ? " (может скрывать Планету X)" : ""}.`, "action", player);
      cost = 4; break;
    }
    case "research": {
      if (player.lastAction === "research") throw new GameError("Нельзя исследовать два хода подряд.");
      const topic = room.topics.find(t => t.id === action.topic);
      if (!topic || player.research.includes(action.topic)) throw new GameError("Эта тема недоступна или уже изучена.");
      player.research.push(topic.id); player.hints.push(topic.text);
      event(room, `${player.name} • Исследование ${String.fromCharCode(65 + topic.id)}.`, "action");
      event(room, `Исследование ${String.fromCharCode(65 + topic.id)}: ${topic.text}`, "action", player);
      cost = 1; break;
    }
    case "locate": {
      const success = correctLocation(room, action.sector, action.left, action.right);
      event(room, `${player.name} • Поиск Планеты X ${success ? "успешен!" : "неуспешен"}.`, "end");
      event(room, `Поиск в секторе ${action.sector}, соседи ${META[action.left].name} / ${META[action.right].name}: ${success ? "Планета X найдена!" : "гипотеза неверна"}.`, "action", player);
      if (success) {
        player.xScore = 10; move(room, player, 5); room.finderId = player.id; room.phase++;
        room.finalQueue = ordered(room).filter(p => p.id !== player.id && p.time < player.time).map(p => p.id);
        room.status = "final"; if (!room.finalQueue.length) finish(room); return;
      }
      cost = 5; break;
    }
    default: throw new GameError("Неизвестное действие.");
  }
  player.lastAction = action.type; move(room, player, cost); advanceEarth(room);
}
function publicPlayer(p: Player): PublicPlayer {
  const { id, name, color, time, order, targets, score, xScore, leaderScore, lastSeen } = p;
  return { id, name, color, time, order, targets, score, xScore, leaderScore, lastSeen };
}
export function projectRoom(room: Room, userId: string): View {
  const p = room.players.find(p => p.userId === userId);
  if (!p) throw new GameError("Вы не участник этой комнаты.", 403);
  return {
    code: room.code, version: room.version, hostId: room.hostId, expiresAt: room.createdAt + 86_400_000, status: room.status, mode: room.mode, size: room.size, earth: room.earth, phase: room.phase,
    activeId: room.status === "playing" ? ordered(room)[0].id : room.status === "final" ? room.finalQueue[0] : null,
    players: room.players.map(publicPlayer), me: { ...publicPlayer(p), notes: p.notes, memo: p.memo, hints: p.hints, history: p.history, research: p.research, lastAction: p.lastAction, finalDone: p.finalDone },
    log: room.log, theories: room.theories.map(t => ({ ...t, object: t.playerId === p.id || t.result !== "pending" ? t.object : null })),
    confirmed: room.confirmed, conferences: room.conferences, topics: room.topics.map(({ id, title }) => ({ id, title })),
    submitted: Object.keys(room.submissions), finalCapacity: capacity(room, p), board: room.status === "finished" ? room.board : null, winners: room.winners,
  };
}
