import { spawn } from "node:child_process";
import { build } from "esbuild";
await build({ entryPoints: ["server/main.ts"], bundle: true, packages: "external", platform: "node", format: "esm", outfile: "dist/server.mjs" });
const backend = spawn(process.execPath, ["dist/server.mjs"], { stdio: "inherit", env: { ...process.env, HOST: "127.0.0.1", PORT: "3000" } });
const frontend = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit" });
let closing = false;
function close(code = 0) { if (closing) return; closing = true; backend.kill(); frontend.kill(); process.exitCode = code; }
process.on("SIGINT", () => close()); process.on("SIGTERM", () => close());
backend.on("exit", code => close(code ?? 0)); frontend.on("exit", code => close(code ?? 0));
