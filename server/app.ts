import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { z } from "zod";
import { OBJECTS, type Action } from "../lib/model";
import { applyAction, createRoom, GameError, joinRoom, projectRoom } from "../lib/server/engine";
import { anonymousPlayer } from "./identity";
import { RoomStore } from "./store";

const object = z.enum(OBJECTS), sector = z.number().int().min(1).max(18);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("survey"), object, start: sector, length: z.number().int().min(1).max(9) }),
  z.object({ type: z.literal("target"), sector }),
  z.object({ type: z.literal("research"), topic: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("locate"), sector, left: object, right: object }),
  z.object({ type: z.literal("theory"), theories: z.array(z.object({ sector, object })).max(2) }),
  z.object({ type: z.literal("notes"), notes: z.array(z.array(z.number().int().min(0).max(2)).length(6)).max(18), memo: z.string().max(3000) }),
]);
async function payload(req: IncomingMessage) {
  const media = req.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (media !== "application/json") throw new GameError("Ожидается JSON-запрос.", 415);
  if (Number(req.headers["content-length"] ?? 0) > 20_000) { req.resume(); throw new GameError("Запрос слишком большой.", 413); }
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 20_000) throw new GameError("Запрос слишком большой.", 413);
    chunks.push(chunk);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new GameError("Некорректный JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new GameError("Некорректный запрос.");
  return parsed as Record<string, unknown>;
}
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(data));
}
export function createApp(store: RoomStore, options: { staticDir?: string; secureCookie?: boolean; publicOrigin?: string } = {}) {
  const requests = new Map<string, { count: number; until: number }>();
  function rateLimit(key: string, limit: number) {
    const now = Date.now(), bucket = requests.get(key);
    if (bucket && bucket.until > now) { if (++bucket.count > limit) throw new GameError("Слишком много запросов. Подождите минуту.", 429); }
    else { if (requests.size > 5000) for (const [k, v] of requests) if (v.until <= now) requests.delete(k); requests.set(key, { count: 1, until: now + 60_000 }); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/healthz" && req.method === "GET") { store.db.prepare("SELECT 1").get(); return json(res, { status: "ok" }); }
      if (url.pathname.startsWith("/api/")) {
        rateLimit(`requests:${req.socket.remoteAddress}`, 600);
        const userId = anonymousPlayer(req, res, options.secureCookie);
        const roomRoute = /^\/api\/rooms\/([A-Z2-9]{6})$/.exec(url.pathname);
        if (url.pathname !== "/api/rooms" && !roomRoute) throw new GameError("Маршрут не найден.", 404);
        if (req.method === "GET") return json(res, roomRoute ? projectRoom(store.load(roomRoute[1]), userId) : { rooms: store.list(userId) });
        if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); throw new GameError("Метод не поддерживается.", 405); }
        const origin = req.headers.origin;
        // PUBLIC_ORIGIN is recommended behind a TLS reverse proxy. Do not trust forwarded identity headers.
        const expectedOrigin = options.publicOrigin ?? `${options.secureCookie ? "https" : "http"}://${req.headers.host}`;
        if (origin && origin !== expectedOrigin || req.headers["sec-fetch-site"] === "cross-site") throw new GameError("Запрос с другого сайта запрещён.", 403);
        const body = await payload(req);
        rateLimit(`writes:${userId}`, 90);
        if (roomRoute) {
          const action = actionSchema.safeParse(body.action);
          if (!action.success) throw new GameError("Некорректное игровое действие.");
          const room = store.load(roomRoute[1]), version = room.version;
          if (!Number.isInteger(body.expectedVersion) || body.expectedVersion !== version) throw new GameError("Поле обновилось. Проверьте состояние партии и повторите действие.", 409);
          applyAction(room, userId, action.data as Action); store.save(room, version);
          return json(res, projectRoom(room, userId));
        }
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 24) throw new GameError("Введите имя: от 1 до 24 символов.");
        const name = body.name.trim();
        if (body.code !== undefined) {
          if (typeof body.code !== "string") throw new GameError("Введите код комнаты.");
          const room = store.load(body.code.toUpperCase().trim()), version = room.version;
          if (!room.players.some(p => p.userId === userId)) { joinRoom(room, userId, name); store.save(room, version); }
          return json(res, projectRoom(room, userId));
        }
        rateLimit(`creates:${req.socket.remoteAddress}`, 20);
        if (store.countRecent(userId) >= 5) throw new GameError("Слишком много новых комнат. Подождите минуту.", 429);
        const mode = body.mode ?? "standard";
        if (mode !== "standard" && mode !== "expert") throw new GameError("Неизвестный режим.");
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let i = 0; i < 5; i++) {
          const code = [...randomBytes(6)].map(b => alphabet[b % alphabet.length]).join("");
          const room = createRoom(code, userId, name, mode);
          if (store.insert(room)) return json(res, projectRoom(room, userId), 201);
        }
        throw new GameError("Попробуйте создать комнату ещё раз.", 503);
      }
      if (!options.staticDir || !["GET", "HEAD"].includes(req.method ?? "")) throw new GameError("Маршрут не найден.", 404);
      const root = resolve(options.staticDir);
      const file = resolve(root, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + sep) && file !== root) throw new GameError("Маршрут не найден.", 404);
      let chosen = file;
      try { if (!statSync(chosen).isFile()) chosen = resolve(root, "index.html"); }
      catch { if (extname(file)) throw new GameError("Файл не найден.", 404); chosen = resolve(root, "index.html"); }
      const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };
      res.writeHead(200, { "Content-Type": types[extname(chosen)] ?? "application/octet-stream", "Content-Length": statSync(chosen).size, "Cache-Control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
      if (req.method === "HEAD") res.end(); else createReadStream(chosen).on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      if (error instanceof GameError) return json(res, { error: error.message }, error.status);
      console.error("Game request failed", error); json(res, { error: "Сервер не смог обработать запрос." }, 500);
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  return server;
}
