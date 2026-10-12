import { resolve } from "node:path";
import { createApp } from "./app";
import { RoomStore } from "./store";
const store = new RoomStore(process.env.DATABASE_PATH ?? "data/puzzle-planet.sqlite");
store.reap();
const cleanup = setInterval(() => store.reap(), 60_000); cleanup.unref();
const server = createApp(store, { staticDir: resolve("dist/client"), secureCookie: process.env.COOKIE_SECURE === "true", publicOrigin: process.env.PUBLIC_ORIGIN || undefined });
const port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? "0.0.0.0";
server.listen(port, host, () => console.log(`Puzzle Planet listening on http://${host}:${port}; room TTL: 24 hours`));
let closing = false;
function close() { if (closing) return; closing = true; clearInterval(cleanup); server.close(() => { store.close(); process.exit(0); }); server.closeIdleConnections(); setTimeout(() => process.exit(1), 10_000).unref(); }
process.on("SIGTERM", close); process.on("SIGINT", close);
