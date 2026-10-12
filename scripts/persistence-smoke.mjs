import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const origin = process.argv[2] ?? "http://127.0.0.1:8080", project = process.argv[3] ?? "puzzle-planet";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || !/^[a-z0-9][a-z0-9-]+$/.test(project)) throw new Error("Persistence smoke is local-only and needs an explicit Compose project.");
let cookie = "";
async function request(path, body) {
  const res = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  cookie = res.headers.get("set-cookie")?.split(";")[0] ?? cookie;
  assert.ok(res.ok, `HTTP ${res.status}`); return res.json();
}
const room = await request("/api/rooms", { name: "Проверка сохранения" });
const memo = `Volume persistence ${crypto.randomUUID()}`;
const saved = await request(`/api/rooms/${room.code}`, { expectedVersion: room.version, action: { type: "notes", notes: room.me.notes, memo } });
const child = spawn("docker", ["compose", "-p", project, "restart", "app"], { stdio: "inherit" });
assert.equal(await new Promise(resolve => child.on("exit", resolve)), 0);
let ready = false;
for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + "/healthz")).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
assert.ok(ready, "container did not restart");
const restored = await request(`/api/rooms/${room.code}`);
assert.equal(restored.me.id, room.me.id); assert.equal(restored.me.memo, memo); assert.equal(restored.version, saved.version); assert.equal(restored.expiresAt, room.expiresAt);
console.log("Compose persistence passed: same anonymous player, notes, room version and fixed expiry after container restart.");
