import { build } from "esbuild";
await build({ entryPoints: ["server/main.ts"], bundle: true, packages: "external", platform: "node", format: "esm", target: "node24", outfile: "dist/server.mjs" });
