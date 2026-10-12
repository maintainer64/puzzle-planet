import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoom, joinRoom, projectRoom } from "../lib/server/engine";
import { ROOM_TTL_MS, RoomStore } from "../server/store";
import { createApp } from "../server/app";

test("rooms expire at 24h from creation, updates do not extend their lifetime", () => {
  let now = Date.now(); const store = new RoomStore(":memory:", () => now);
  try {
    const room = createRoom("TIME22", "player", "Анна", "standard"); assert.ok(store.insert(room));
    assert.equal(projectRoom(room, "player").expiresAt, room.createdAt + ROOM_TTL_MS);
    now = room.createdAt + ROOM_TTL_MS - 1;
    const saved = store.load(room.code); store.save(saved, saved.version);
    assert.equal(store.list("player").length, 1);
    now++;
    assert.equal(store.list("player").length, 0);
    assert.throws(() => store.load(room.code), /24 часа/);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM rooms").get()!.n, 0);
  } finally { store.close(); }
});
test("background cleanup deletes expired room codes but preserves live rooms", () => {
  let now = Date.now(); const store = new RoomStore(":memory:", () => now);
  try {
    const old = createRoom("OLD222", "a", "Анна", "standard"), fresh = createRoom("NEW222", "b", "Борис", "standard");
    now = fresh.createdAt;
    old.createdAt -= ROOM_TTL_MS;
    store.insert(old); store.insert(fresh); assert.equal(store.reap(), 1); assert.ok(store.load(fresh.code));
    assert.throws(() => store.load(old.code), /не найдена/);
    now += ROOM_TTL_MS; assert.equal(store.reap(), 1);
  } finally { store.close(); }
});
test("expired states cannot be saved; CAS prevents stale writers", () => {
  let now = Date.now(); const store = new RoomStore(":memory:", () => now);
  try {
    const room = createRoom("CAS222", "a", "Анна", "standard"); store.insert(room);
    const a = store.load(room.code), b = store.load(room.code); joinRoom(a, "b", "Борис"); store.save(a, 1);
    assert.throws(() => store.save(b, 1), /Другой игрок/);
    now = room.createdAt + ROOM_TTL_MS; assert.throws(() => store.save(a, a.version), /24 часа/);
  } finally { store.close(); }
});
test("SQLite state survives a server restart and expired data is purged on startup", () => {
  const folder = mkdtempSync(join(tmpdir(), "puzzle-test-")); const path = join(folder, "rooms.sqlite");
  const room = createRoom("DISK22", "a", "Анна", "standard");
  try {
    const first = new RoomStore(path); first.insert(room); first.close();
    const second = new RoomStore(path); assert.equal(second.load(room.code).hostId, room.hostId); second.close();
    const third = new RoomStore(path, () => room.createdAt + ROOM_TTL_MS); assert.equal(third.reap(), 1); third.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
test("anonymous cookies isolate players, ignore forged identity headers and enforce expiry over HTTP", async () => {
  let now = Date.now(); const store = new RoomStore(":memory:", () => now), server = createApp(store);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  let a = "", b = "";
  async function request(cookie: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const res = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", ...extra }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() as Record<string, any>, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "", fullCookie: res.headers.get("set-cookie") ?? "" };
  }
  try {
    const initial = await request("", "/api/rooms"); a = initial.cookie;
    assert.ok(initial.fullCookie.includes("HttpOnly")); assert.ok(initial.fullCookie.includes("SameSite=Lax"));
    b = (await request("", "/api/rooms")).cookie; assert.notEqual(a, b);
    const created = await request(a, "/api/rooms", { name: "Анна", mode: "standard" });
    const code = created.data.code;
    assert.equal(created.status, 201); assert.equal(created.data.board, null);
    assert.equal((await request(b, `/api/rooms/${code}`, undefined, { "oai-authenticated-user-id": store.load(code).players[0].userId })).status, 403);
    const joined = await request(b, "/api/rooms", { code, name: "Борис" }); assert.equal(joined.status, 200);
    const start = await request(a, `/api/rooms/${code}`, { expectedVersion: joined.data.version, action: { type: "start" } }); assert.equal(start.status, 200);
    const restored = await request(a, `/api/rooms/${code}`); assert.equal(restored.data.me.id, created.data.me.id);
    assert.equal((await request(a, `/api/rooms/${code}`, { expectedVersion: start.data.version, action: { type: "research", topic: 0 } }, { Origin: "https://attacker.invalid" })).status, 403);
    now = store.load(code).createdAt + ROOM_TTL_MS;
    assert.equal((await request(a, `/api/rooms/${code}`)).status, 410);
    assert.equal((await request(a, "/api/rooms")).data.rooms.length, 0);
    assert.equal((await request(a, `/api/rooms/${code}`)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
