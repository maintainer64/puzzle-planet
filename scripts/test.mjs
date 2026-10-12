import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "puzzle-tests-"));
try {
  const file = join(dir, "all.test.mjs");
  await build({ entryPoints: ["tests/all.ts"], bundle: true, platform: "node", format: "esm", outfile: file });
  const child = spawn(process.execPath, ["--test", file], { stdio: "inherit" });
  process.exitCode = await new Promise(resolve => child.on("exit", code => resolve(code ?? 1)));
} finally { await rm(dir, { recursive: true, force: true }); }
