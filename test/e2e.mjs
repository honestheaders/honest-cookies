// Usage: node test/e2e.mjs <extension dir with all_urls> <extension dir as shipped>
import { chromium } from "playwright";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const extId = (dir) => [...crypto.createHash("sha256").update(path.resolve(dir)).digest("hex").slice(0, 32)]
  .map((h) => String.fromCharCode(97 + parseInt(h, 16))).join("");

const server = http.createServer((req, res) => {
  res.setHeader("Set-Cookie", ["sid=abc123; HttpOnly; Path=/; Max-Age=3600", "theme=dark; Path=/", "deep=1; Path=/app"]);
  res.setHeader("Content-Type", "text/html");
  res.end("<h1>test</h1>");
});
await new Promise((r) => server.listen(8765, "127.0.0.1", r));
const shots = process.env.SHOTS || os.tmpdir();

async function run(dir, fn) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "hc-")), {
    headless: true,
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--headless=new"],
    viewport: { width: 520, height: 700 }
  });
  try { await fn(ctx, extId(dir)); } finally { await ctx.close(); }
}

// 1) Shipped manifest: asks for access first.
await run(process.argv[3], async (ctx, id) => {
  const site = await ctx.newPage();
  await site.goto("http://127.0.0.1:8765/");
  const tabId = await (async () => {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${id}/popup.html`);
    const t = await p.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1:8765/*" }))[0].id);
    await p.close();
    return t;
  })();
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
  await pop.waitForSelector("#needAccess:not([hidden])");
  assert.match(await pop.textContent("#grantSite"), /127\.0\.0\.1/);
  assert.equal(await pop.isHidden("#main"), true);
  await pop.screenshot({ path: path.join(shots, "access.png") });
  console.log("ok: access panel");
});

// 2) With access: list, edit, add, delete, export, import.
await run(process.argv[2], async (ctx, id) => {
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const site = await ctx.newPage();
  await site.goto("http://127.0.0.1:8765/");
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${id}/popup.html`);
  const tabId = await helper.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1:8765/*" }))[0].id);
  const all = () => helper.evaluate(() => chrome.cookies.getAll({ domain: "127.0.0.1" }));

  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
  await pop.waitForSelector(".item");
  let names = await pop.$$eval(".item .name", (els) => els.map((e) => e.textContent));
  assert.deepEqual(names.sort(), ["sid", "theme"]); // "deep" is on /app, not this page
  await pop.selectOption("#scope", "site");
  await pop.waitForFunction(() => document.querySelectorAll(".item").length === 3);
  assert.match(await pop.textContent("#countLine"), /3/);
  await pop.screenshot({ path: path.join(shots, "list.png") });

  // edit value of theme
  await pop.click(".item:has(.name:text-is('theme')) .head");
  await pop.fill(".editor [name=value]", "light");
  await pop.screenshot({ path: path.join(shots, "edit.png") });
  await pop.click(".editor button[type=submit]");
  await pop.waitForSelector("#toast:not([hidden])");
  let c = (await all()).find((x) => x.name === "theme");
  assert.equal(c.value, "light");

  // rename sid -> sid2 (old one removed, HttpOnly kept)
  await pop.click(".item:has(.name:text-is('sid')) .head");
  await pop.fill(".editor [name=name]", "sid2");
  await pop.click(".editor button[type=submit]");
  await pop.waitForFunction(() => [...document.querySelectorAll(".item .name")].some((e) => e.textContent === "sid2"));
  let cs = await all();
  assert.ok(!cs.some((x) => x.name === "sid"));
  assert.equal(cs.find((x) => x.name === "sid2").httpOnly, true);

  // validation: SameSite=None without Secure
  await pop.click("#add");
  await pop.fill(".editor [name=name]", "bad");
  await pop.selectOption(".editor [name=sameSite]", "no_restriction");
  await pop.click(".editor button[type=submit]");
  await pop.waitForSelector(".editor .err:not([hidden])");

  // add a persistent cookie
  await pop.selectOption(".editor [name=sameSite]", "lax");
  await pop.fill(".editor [name=name]", "added");
  await pop.fill(".editor [name=value]", "v 1");
  await pop.uncheck(".editor [name=session]");
  await pop.click(".editor button[type=submit]");
  await pop.waitForFunction(() => [...document.querySelectorAll(".item .name")].some((e) => e.textContent === "added"));
  c = (await all()).find((x) => x.name === "added");
  assert.equal(c.value, "v 1");
  assert.equal(c.session, false);
  assert.equal(c.sameSite, "lax");

  // search
  await pop.fill("#search", "add");
  await pop.waitForFunction(() => document.querySelectorAll(".item").length === 1);
  await pop.fill("#search", "");

  // export header + cookies.txt
  await pop.selectOption("#exportSel", "header");
  await pop.waitForSelector("#toast:not([hidden])");
  const header = await pop.evaluate(() => navigator.clipboard.readText());
  assert.match(header, /sid2=abc123/);
  await pop.selectOption("#exportSel", "json");
  await pop.waitForTimeout(200);
  const json = await pop.evaluate(() => navigator.clipboard.readText());
  assert.equal(JSON.parse(json).length, 4);

  // delete all (two clicks)
  await pop.click("#deleteAll");
  assert.match(await pop.textContent("#deleteAll"), /4/);
  await pop.click("#deleteAll");
  await pop.waitForSelector(".list .hint");
  assert.equal((await all()).length, 0);

  // import the JSON back
  await pop.click("#importBtn");
  await pop.fill("#importText", json);
  await pop.click("#importRun");
  await pop.waitForFunction(() => document.querySelectorAll(".item").length === 4);
  cs = await all();
  assert.equal(cs.find((x) => x.name === "sid2").httpOnly, true);
  assert.equal(cs.find((x) => x.name === "deep").path, "/app");
  assert.match(await pop.textContent("#toast"), /4/);

  // import cookies.txt
  await pop.click("#importBtn");
  await pop.fill("#importText", "127.0.0.1\tFALSE\t/\tFALSE\t0\tfromtxt\thello\n");
  await pop.click("#importRun");
  await pop.waitForFunction(() => document.querySelectorAll(".item").length === 5);
  await pop.screenshot({ path: path.join(shots, "final.png") });
  console.log("ok: list, edit, rename, validate, add, search, export, delete all, import");
});

// 3) non-http page
await run(process.argv[2], async (ctx, id) => {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${id}/popup.html`);
  await p.waitForSelector("#blocked:not([hidden])");
  console.log("ok: blocked page");
});
server.close();
