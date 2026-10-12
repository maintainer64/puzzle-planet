import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { GameError, type Room } from "../lib/server/engine";

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export class RoomStore {
  readonly db: DatabaseSync;
  constructor(path: string, private readonly now = Date.now) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;");
    this.db.exec("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS rooms_expiry ON rooms(expires_at);");
  }
  insert(room: Room) {
    const result = this.db.prepare("INSERT OR IGNORE INTO rooms VALUES (?, ?, ?, ?, ?, ?)").run(room.code, room.version, JSON.stringify(room), room.createdAt, room.createdAt + ROOM_TTL_MS, room.updatedAt);
    return result.changes === 1;
  }
  load(code: string): Room {
    if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("Неверный код комнаты.", 404);
    const row = this.db.prepare("SELECT state, expires_at FROM rooms WHERE code = ?").get(code) as { state: string; expires_at: number } | undefined;
    if (!row) throw new GameError("Комната не найдена или её срок уже истёк.", 404);
    if (row.expires_at <= this.now()) { this.db.prepare("DELETE FROM rooms WHERE code = ?").run(code); throw new GameError("Срок комнаты истёк: партия доступна только 24 часа.", 410); }
    return JSON.parse(row.state) as Room;
  }
  save(room: Room, oldVersion: number) {
    if (room.createdAt + ROOM_TTL_MS <= this.now()) { this.reap(); throw new GameError("Срок комнаты истёк: партия доступна только 24 часа.", 410); }
    room.version = oldVersion + 1; room.updatedAt = this.now();
    const result = this.db.prepare("UPDATE rooms SET version = ?, state = ?, updated_at = ? WHERE code = ? AND version = ? AND expires_at > ?").run(room.version, JSON.stringify(room), room.updatedAt, room.code, oldVersion, this.now());
    if (result.changes !== 1) throw new GameError("Другой игрок обновил партию. Обновите поле и повторите действие.", 409);
  }
  list(userId: string) {
    return (this.db.prepare("SELECT state FROM rooms WHERE expires_at > ? AND EXISTS (SELECT 1 FROM json_each(rooms.state, '$.players') p WHERE json_extract(p.value, '$.userId') = ?) ORDER BY updated_at DESC LIMIT 12").all(this.now(), userId) as { state: string }[]).map(({ state }) => {
      const r = JSON.parse(state) as Room;
      return { code: r.code, status: r.status, mode: r.mode, players: r.players.length, updatedAt: r.updatedAt, expiresAt: r.createdAt + ROOM_TTL_MS };
    });
  }
  countRecent(userId: string) {
    const row = this.db.prepare("SELECT COUNT(*) AS amount FROM rooms WHERE created_at > ? AND EXISTS (SELECT 1 FROM json_each(rooms.state, '$.players') p WHERE json_extract(p.value, '$.userId') = ?)").get(this.now() - 60_000, userId) as { amount: number };
    return row.amount;
  }
  reap() { return this.db.prepare("DELETE FROM rooms WHERE expires_at <= ?").run(this.now()).changes; }
  close() { this.db.close(); }
}
