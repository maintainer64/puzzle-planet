import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const origin = process.argv[2] ?? "http://127.0.0.1:5176";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Browser smoke is local-only.");
const profile = await mkdtemp(join(tmpdir(), "orbit-x-browser-"));
const chrome = process.env.CHROME_BINARY ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--remote-debugging-port=9236", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 60; i++) {
    try { const result = await fetch(`http://127.0.0.1:9236/json/new?${encodeURIComponent(origin)}`, { method: "PUT" }); target = await result.json(); break; } catch { await sleep(200); }
  }
  assert.ok(target?.webSocketDebuggerUrl, "Chrome debugger did not start");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map(), errors = [];
  socket.onmessage = e => { const message = JSON.parse(e.data); if (message.id) { const entry = pending.get(message.id); pending.delete(message.id); if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result); } if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text); };
  function send(method, params = {}) { return new Promise((resolve, reject) => { const seq = ++id; pending.set(seq, { resolve, reject }); socket.send(JSON.stringify({ id: seq, method, params })); }); }
  async function evaluate(expression) { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "Evaluation failed"); return r.result?.value; }
  async function until(expression, description) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(150); } throw new Error(`Timed out: ${description}`); }
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(text)}))?.click()`);
  await send("Page.enable"); await send("Runtime.enable"); await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: origin });
  await until("document.querySelector('.entry-card') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Создать экспедицию') && !b.disabled)", "anonymous welcome");
  await sleep(500); await mkdir("outputs", { recursive: true });
  async function screenshot(name) { const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(`outputs/${name}.png`, Buffer.from(shot.data, "base64")); }
  await screenshot("welcome");
  await click("Создать экспедицию"); await until("!!document.querySelector('.lobby')", "room creation");
  await click("Начать тренировку"); await until("!!document.querySelector('.game-layout')", "start game");
  await screenshot("board");
  await click("Выполнить наблюдение"); await until("!!document.querySelector('.last-answer')", "private survey answer");
  if (await evaluate("document.querySelector('.turn-banner')?.textContent.includes('Время выдвинуть теорию')")) { await click("Пропустить теории"); await sleep(300); }
  await click("Мой планшет"); await until("!!document.querySelector('.deduction-table')", "player tablet");
  await evaluate("document.querySelector('.note-cell').click()"); await click("Сохранить"); await until("document.querySelector('.notebook .button')?.textContent.includes('Сохранено')", "saved notes");
  await screenshot("tablet");
  await send("Page.reload"); await until("!!document.querySelector('.game-layout')", "reconnect after reload");
  await click("Мой планшет"); await until("document.querySelector('.note-cell')?.textContent==='×'", "notes persisted after reload");
  await evaluate("document.querySelector('[aria-label=\"Отключить анимации\"]')?.click()");
  assert.ok(await evaluate("!!document.querySelector('.motion-off')"));
  await evaluate("document.querySelector('[aria-label=\"Помощь по игре\"]').click()"); await until("!!document.querySelector('[role=dialog]')", "help dialog");
  await screenshot("rules");
  await evaluate("document.querySelector('[data-slot=dialog-close]').click()");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300); await screenshot("mobile");
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), "mobile horizontal overflow");
  assert.deepEqual(errors, [], "browser runtime exceptions");
  console.log("Browser smoke passed: welcome, lobby, action, player tablet, saved notes, reconnect, animation toggle, accessible rules, 390px mobile. Screenshots: outputs/.");
} finally {
  socket?.close(); browser.kill();
  await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once("exit", resolve); setTimeout(resolve, 2000); } });
  await rm(profile, { recursive: true, force: true });
}
