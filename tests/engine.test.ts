import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createRoom, GameError, generateBoard, joinRoom, projectRoom, validBoard, type Room } from "../lib/server/engine";
import { counts, OBJECTS, visibleSectors, type Mode, type ObjectType } from "../lib/model";

function seeded(seed: number) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; }; }
function game(players = 2, mode: Mode = "standard") {
  const room = createRoom("TEST22", "user-0", "Первый", mode);
  for (let i = 1; i < players; i++) joinRoom(room, `user-${i}`, `Игрок ${i}`);
  applyAction(room, "user-0", { type: "start" }); return room;
}
function active(room: Room) { return room.players.find(p => p.id === projectRoom(room, "user-0").activeId)!; }
function locate(room: Room) {
  const sector = room.board.indexOf("x") + 1;
  return { type: "locate" as const, sector, left: room.board[(sector - 2 + room.size) % room.size], right: room.board[sector % room.size] };
}

for (const mode of ["standard", "expert"] as const) test(`${mode}: 300 seeded boards satisfy all object constraints`, () => {
  const maps = new Set<string>();
  for (let i = 1; i <= 300; i++) {
    const board = generateBoard(mode, seeded(i));
    assert.ok(validBoard(board, mode)); maps.add(board.join(","));
    for (const type of OBJECTS) assert.equal(board.filter(o => o === type).length, counts(mode)[type]);
  }
  assert.ok(maps.size > 250);
});
test("invalid boards are rejected", () => { assert.equal(validBoard(Array(12).fill("empty"), "standard"), false); assert.equal(validBoard(generateBoard("expert"), "standard"), false); });
test("room creation does not generate or expose a board", () => { const room = createRoom("TEST22", "a", "Анна", "standard"); assert.deepEqual(room.board, []); assert.equal(projectRoom(room, "a").board, null); });
test("join is idempotent and seats cannot be stolen", () => { const r = game(1); assert.throws(() => joinRoom(r, "b", "Борис"), GameError); joinRoom(r, "user-0", "Чужое имя"); assert.equal(r.players.length, 1); assert.equal(r.players[0].name, "Первый"); });
test("four seats, host-only start, identity required for projection", () => {
  const r = createRoom("TEST22", "a", "Анна", "standard");
  for (const id of ["b", "c", "d"]) joinRoom(r, id, id);
  assert.throws(() => joinRoom(r, "e", "Егор"), GameError);
  assert.throws(() => applyAction(r, "b", { type: "start" }), GameError);
  assert.throws(() => projectRoom(r, "outsider"), GameError);
});
test("private projection excludes board, other notes, user IDs, research answers and pending theory types", () => {
  const r = game(); r.players[1].memo = "НЕПОКАЗЫВАТЬ"; r.players[1].hints = ["PRIVATE_CLUE"]; r.players[1].history = [{ id: 100, text: "PRIVATE_RESULT", time: 0, type: "action" }];
  r.theories.push({ id: "theory", playerId: r.players[1].id, sector: 3, object: "cloud", age: 1, phase: 1, result: "pending" });
  const view = projectRoom(r, "user-0"), json = JSON.stringify(view);
  assert.equal(view.board, null); assert.equal(view.theories[0].object, null);
  for (const secret of ["НЕПОКАЗЫВАТЬ", "PRIVATE_CLUE", "PRIVATE_RESULT", "user-0", "user-1", "conferenceClues", "submissions"]) assert.ok(!json.includes(secret));
  assert.deepEqual(view.topics, r.topics.map(({ id, title }) => ({ id, title })));
});
test("only the least-time player may act; arrival order breaks ties", () => {
  const r = game(3); const p = active(r), waiting = r.players.find(x => x.id !== p.id)!;
  assert.throws(() => applyAction(r, waiting.userId, { type: "research", topic: 0 }), GameError);
  applyAction(r, p.userId, { type: "research", topic: 0 });
  assert.equal(p.time, 1); assert.notEqual(active(r).id, p.id);
  r.players.forEach((p, i) => { p.time = 4; p.order = i; });
  assert.equal(active(r).id, r.players[0].id);
});
test("target masks X, spends one token, keeps its answer private", () => {
  const r = game(); const p = active(r), s = r.board.indexOf("x") + 1;
  r.earth = s - 1; r.players.forEach(x => { x.time = r.earth; });
  applyAction(r, p.userId, { type: "target", sector: s });
  assert.equal(p.targets, 1); assert.ok(p.history.at(-1)!.text.includes("Пустой сектор"));
  assert.ok(!r.log.at(-1)!.text.includes("Пустой сектор"));
});
test("survey empty includes X and wraparound sectors work", () => {
  const r = game(1); const p = r.players[0]; r.earth = p.time = 10;
  applyAction(r, p.userId, { type: "survey", start: 11, length: 4, object: "empty" });
  const expected = [11, 12, 1, 2].filter(s => ["x", "empty"].includes(r.board[s - 1])).length;
  assert.ok(p.history.at(-1)!.text.endsWith(`→ ${expected}.`)); assert.equal(p.time, 13);
});
test("invalid or hidden ranges and invalid comet endpoints are rejected", () => {
  const r = game(1);
  assert.throws(() => applyAction(r, "user-0", { type: "target", sector: 10 }), GameError);
  assert.throws(() => applyAction(r, "user-0", { type: "survey", start: 5, length: 3, object: "asteroid" }), GameError);
  assert.throws(() => applyAction(r, "user-0", { type: "survey", start: 1, length: 3, object: "comet" }), GameError);
  assert.throws(() => applyAction(r, "user-0", { type: "survey", start: 1, length: 1, object: "x" }), GameError);
});
test("research cannot be repeated or used twice consecutively", () => {
  const r = game(1); applyAction(r, "user-0", { type: "research", topic: 0 });
  assert.throws(() => applyAction(r, "user-0", { type: "research", topic: 1 }), GameError);
  assert.equal(r.players[0].hints.length, 5);
});
test("target tokens exhaust, no negative balances", () => {
  const r = game(1); r.players[0].targets = 0;
  assert.throws(() => applyAction(r, "user-0", { type: "target", sector: 1 }), GameError); assert.equal(r.players[0].targets, 0);
});
test("private notes work off-turn and survive serialization, malformed notes rejected", () => {
  const r = game(); const p = r.players.find(x => x.id !== active(r).id)!;
  const notes = p.notes.map((row, i) => i === 1 ? [2, 1, 0, 0, 0, 0] : row);
  applyAction(r, p.userId, { type: "notes", notes, memo: "Проверить сектор 2" });
  const loaded = JSON.parse(JSON.stringify(r)) as Room;
  assert.equal(projectRoom(loaded, p.userId).me.memo, "Проверить сектор 2");
  assert.throws(() => applyAction(r, p.userId, { type: "notes", notes: [[9]], memo: "" }), GameError);
});
test("theory submissions stay secret until all respond; one response per player", () => {
  const r = game(); r.status = "theory"; r.phase = 1;
  applyAction(r, "user-0", { type: "theory", theories: [{ sector: 1, object: "asteroid" }] });
  assert.equal(r.theories.length, 0); assert.equal(r.status, "theory"); assert.deepEqual(projectRoom(r, "user-1").submitted, [r.players[0].id]);
  assert.throws(() => applyAction(r, "user-0", { type: "theory", theories: [] }), GameError);
  applyAction(r, "user-1", { type: "theory", theories: [] });
  assert.equal(r.theories[0].age, 1); assert.equal(projectRoom(r, "user-1").theories[0].object, null);
});
test("theories review at third phase; success confirms all later theories and wrong guesses add time", () => {
  const r = game(); const sector = r.board.indexOf("asteroid") + 1;
  r.status = "theory"; r.phase = 3;
  r.theories = [
    { id: "correct", sector, object: "asteroid", playerId: r.players[0].id, age: 2, phase: 1, result: "pending" },
    { id: "bad", sector, object: "cloud", playerId: r.players[1].id, age: 0, phase: 2, result: "pending" },
  ];
  applyAction(r, "user-0", { type: "theory", theories: [] }); applyAction(r, "user-1", { type: "theory", theories: [] });
  assert.equal(r.confirmed[sector], "asteroid"); assert.equal(r.theories[0].result, "correct"); assert.equal(r.theories[1].result, "wrong"); assert.equal(r.players[1].time, 1);
});
test("incorrect unconfirmed theory does not reveal later theory", () => {
  const r = game(); const s = r.board.indexOf("empty") + 1; r.status = "theory";
  r.theories = [
    { id: "bad", sector: s, object: "asteroid", playerId: r.players[0].id, age: 2, phase: 1, result: "pending" },
    { id: "later", sector: s, object: "comet", playerId: r.players[1].id, age: 0, phase: 2, result: "pending" },
  ];
  applyAction(r, "user-0", { type: "theory", theories: [] }); applyAction(r, "user-1", { type: "theory", theories: [] });
  assert.equal(r.confirmed[s], undefined); assert.equal(r.theories[1].result, "pending"); assert.equal(projectRoom(r, "user-0").theories[1].object, null);
});
test("confirmed, duplicate, over-capacity and spent-token theories are rejected", () => {
  const r = game(); r.status = "theory"; r.confirmed[1] = "asteroid";
  assert.throws(() => applyAction(r, "user-0", { type: "theory", theories: [{ sector: 1, object: "asteroid" }] }), GameError);
  assert.throws(() => applyAction(r, "user-0", { type: "theory", theories: [{ sector: 2, object: "empty" }] }), GameError);
  assert.throws(() => applyAction(r, "user-0", { type: "theory", theories: [{ sector: 2, object: "dwarf" }, { sector: 3, object: "dwarf" }] }), GameError);
  r.theories.push({ id: "used", playerId: r.players[0].id, sector: 2, object: "dwarf", age: 3, phase: 1, result: "wrong" });
  assert.throws(() => applyAction(r, "user-0", { type: "theory", theories: [{ sector: 3, object: "dwarf" }] }), GameError);
});
test("correct locate requires both true neighbors, not merely the X sector", () => {
  const r = game(1), guess = locate(r); const bad: ObjectType = guess.left === "comet" ? "cloud" : "comet";
  applyAction(r, "user-0", { ...guess, left: bad }); assert.notEqual(r.status, "finished"); assert.equal(r.players[0].xScore, 0);
});
test("finder triggers final opportunities without revealing X; final players do not advance", () => {
  const r = game(3); const p = active(r), guess = locate(r);
  applyAction(r, p.userId, guess); assert.equal(r.status, "final"); assert.equal(p.xScore, 10); assert.equal(p.time, 5);
  assert.equal(r.earth, 0); assert.equal(projectRoom(r, r.players.find(x => x.id !== p.id)!.userId).board, null);
  assert.ok(!r.log.at(-1)!.text.includes(`сектор ${guess.sector}`));
  const other = active(r); const time = other.time; applyAction(r, other.userId, guess); assert.equal(other.time, time); assert.equal(other.xScore, 10);
  applyAction(r, active(r).userId, { type: "theory", theories: [] }); assert.equal(r.status, "finished"); assert.ok(projectRoom(r, p.userId).board); assert.equal(r.winners.length, 2);
});
test("scores include theory points, tied leader bonus and X points", () => {
  const r = game(); const p = active(r), other = r.players.find(x => x.id !== p.id)!, s = r.board.indexOf("cloud") + 1;
  r.theories = [p, other].map((pl, i) => ({ id: String(i), playerId: pl.id, sector: s, object: "cloud", phase: 1, age: 1, result: "pending" }));
  applyAction(r, p.userId, locate(r)); applyAction(r, other.userId, { type: "theory", theories: [] });
  assert.equal(p.score, 15); assert.equal(other.score, 5); assert.equal(p.leaderScore, 1); assert.equal(other.leaderScore, 1);
});
test("complete multi-player game can resume through theory, conference and final states", () => {
  const r = game(4); let sawTheory = false;
  for (let i = 0; i < 40; i++) {
    if (r.status === "theory") { sawTheory = true; for (const p of [...r.players]) applyAction(r, p.userId, { type: "theory", theories: [] }); }
    else { const p = active(r); applyAction(r, p.userId, { type: "survey", object: "asteroid", start: visibleSectors(r.earth, r.size)[0], length: 6 }); }
  }
  while (r.status === "theory") for (const p of [...r.players]) applyAction(r, p.userId, { type: "theory", theories: [] });
  assert.ok(sawTheory); assert.equal(r.conferences.length, 2);
  applyAction(r, active(r).userId, locate(r));
  while (r.status === "final") applyAction(r, active(r).userId, { type: "theory", theories: [] });
  assert.equal(r.status, "finished"); assert.equal(r.winners.length, 1);
});
