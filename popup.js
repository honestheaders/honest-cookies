import { siteOf, originPatternFor, cookieUrl, toSetDetails, toJson, toNetscape, toHeader, parseImport,
  toLocalInput, fromLocalInput, isValidName, isValidValue } from "./lib/cookies.js";

const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const $ = (id) => document.getElementById(id);

let tab = null;      // the page the popup is for
let pageUrl = null;  // URL object of that page
let storeId = null;  // cookie store of that tab (normal or incognito)
let cookies = [];
let openKey = null;  // which cookie's editor is open ("new" for a new one)
let deleteArmed = false;
let toastTimer = null;

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
}

function keyOf(c) {
  return [c.storeId || "", c.domain, c.path, c.name, c.partitionKey?.topLevelSite || ""].join("\n");
}

function showError(msg) {
  const b = $("banner");
  b.textContent = msg || "";
  b.hidden = !msg;
}
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2500);
}

function getScope() {
  try { return localStorage.getItem("scope") === "site" ? "site" : "page"; } catch { return "page"; }
}
function setScope(v) {
  try { localStorage.setItem("scope", v); } catch { /* not important */ }
}

async function currentTab() {
  // ?tab=<id> lets the popup be opened as a normal page (tests, keyboard users).
  const forced = Number(new URLSearchParams(location.search).get("tab"));
  if (forced) return chrome.tabs.get(forced);
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return active;
}

async function storeFor(tabId) {
  const stores = await chrome.cookies.getAllCookieStores();
  const s = stores.find((x) => x.tabIds.includes(tabId));
  return s ? s.id : null;
}

// ---------- reading ----------

async function fetchCookies() {
  const host = pageUrl.hostname;
  const q = getScope() === "site" ? { domain: siteOf(host) } : { url: pageUrl.href };
  if (storeId) q.storeId = storeId;
  const lists = [await chrome.cookies.getAll(q)];
  try {
    lists.push(await chrome.cookies.getAll({ ...q, partitionKey: { topLevelSite: `${pageUrl.protocol}//${siteOf(host)}` } }));
  } catch { /* older Chrome: no partitioned cookies */ }
  const seen = new Map();
  for (const c of lists.flat()) seen.set(keyOf(c), c);
  cookies = [...seen.values()].sort((a, b) =>
    a.domain.replace(/^\./, "").localeCompare(b.domain.replace(/^\./, "")) || a.name.localeCompare(b.name));
}

function visible() {
  const q = $("search").value.trim().toLowerCase();
  if (!q) return cookies;
  return cookies.filter((c) => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q));
}

// ---------- rendering ----------

function tagsFor(c) {
  const out = [c.domain];
  if (c.path !== "/") out.push(c.path);
  out.push(c.session ? t("session") : new Date(c.expirationDate * 1000).toLocaleString());
  if (c.secure) out.push("Secure");
  if (c.httpOnly) out.push("HttpOnly");
  if (c.sameSite && c.sameSite !== "unspecified") out.push("SameSite=" + ({ no_restriction: "None", lax: "Lax", strict: "Strict" }[c.sameSite] || c.sameSite));
  if (c.partitionKey) out.push("Partitioned");
  return out;
}

function render() {
  const list = $("list");
  list.innerHTML = "";
  const shown = visible();
  $("countLine").textContent = shown.length === cookies.length
    ? t("countAll", [String(cookies.length)])
    : t("countFiltered", [String(shown.length), String(cookies.length)]);
  disarmDelete();

  if (openKey === "new") list.appendChild(itemFor(null));
  for (const c of shown) list.appendChild(itemFor(c));
  if (!shown.length && openKey !== "new") {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = t(cookies.length ? "noMatch" : "noCookies");
    list.appendChild(p);
  }
}

function itemFor(c) {
  const key = c ? keyOf(c) : "new";
  const item = document.createElement("div");
  item.className = "item" + (openKey === key ? " open" : "");

  const head = document.createElement("button");
  head.type = "button";
  head.className = "head";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = c ? (c.name || t("noName")) : t("newCookie");
  head.appendChild(name);
  if (c) {
    const value = document.createElement("div");
    value.className = "value";
    value.textContent = c.value;
    const tags = document.createElement("div");
    tags.className = "tags";
    for (const label of tagsFor(c)) {
      const s = document.createElement("span");
      s.className = "tag";
      s.textContent = label;
      tags.appendChild(s);
    }
    head.append(value, tags);
  }
  head.addEventListener("click", () => {
    openKey = openKey === key ? null : key;
    render();
  });
  item.appendChild(head);
  if (openKey === key) item.appendChild(editorFor(c));
  return item;
}

function defaultsForNew() {
  const host = pageUrl.hostname;
  return {
    name: "", value: "", domain: host, path: "/", hostOnly: true, session: true,
    expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400,
    secure: pageUrl.protocol === "https:", httpOnly: false, sameSite: "lax"
  };
}

function editorFor(orig) {
  const form = $("editorTpl").content.firstElementChild.cloneNode(true);
  applyI18n(form);
  const c = orig || defaultsForNew();
  const f = form.elements;
  f.name.value = c.name;
  f.value.value = c.value;
  f.domain.value = c.domain.replace(/^\./, "");
  f.path.value = c.path;
  f.session.checked = !!c.session;
  f.expires.value = toLocalInput(c.session ? Math.floor(Date.now() / 1000) + 30 * 86400 : c.expirationDate);
  f.expires.disabled = f.session.checked;
  f.hostOnly.checked = !!c.hostOnly;
  f.secure.checked = !!c.secure;
  f.httpOnly.checked = !!c.httpOnly;
  f.sameSite.value = c.sameSite || "unspecified";
  f.session.addEventListener("change", () => (f.expires.disabled = f.session.checked));

  const err = form.querySelector(".err");
  const fail = (msg) => { err.textContent = msg; err.hidden = false; };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const next = {
      name: f.name.value,
      value: f.value.value,
      domain: (f.hostOnly.checked ? "" : ".") + f.domain.value.trim().replace(/^\./, ""),
      path: f.path.value.trim() || "/",
      hostOnly: f.hostOnly.checked,
      session: f.session.checked,
      expirationDate: f.session.checked ? undefined : fromLocalInput(f.expires.value),
      secure: f.secure.checked,
      httpOnly: f.httpOnly.checked,
      sameSite: f.sameSite.value,
      partitionKey: orig?.partitionKey
    };
    if (!next.name && !next.value) return fail(t("errNameEmpty"));
    if (!isValidName(next.name)) return fail(t("errName"));
    if (!isValidValue(next.value)) return fail(t("errValue"));
    if (next.domain.replace(/^\./, "") === "") return fail(t("errDomain"));
    if (!next.path.startsWith("/")) return fail(t("errPath"));
    if (!next.session && (!next.expirationDate || next.expirationDate * 1000 <= Date.now())) return fail(t("errPast"));
    if (next.sameSite === "no_restriction" && !next.secure) return fail(t("errSameSiteNone"));

    let saved = null;
    try {
      saved = await chrome.cookies.set(toSetDetails(next, storeId));
    } catch (e2) {
      return fail(t("errSave", [e2.message || ""]));
    }
    if (!saved) return fail(t("errSave", [chrome.runtime.lastError?.message || t("errRejected")]));
    if (orig && keyOf(orig) !== keyOf(saved)) await removeCookie(orig);
    openKey = null;
    toast(t("saved"));
    await refresh();
  });

  form.querySelector(".copy").addEventListener("click", () => copy(f.value.value, t("copiedValue")));
  const del = form.querySelector(".del");
  if (!orig) del.hidden = true;
  del.addEventListener("click", async () => {
    await removeCookie(orig);
    openKey = null;
    toast(t("deleted", ["1"]));
    await refresh();
  });
  form.querySelector(".cancel").addEventListener("click", () => { openKey = null; render(); });
  return form;
}

// ---------- actions ----------

async function removeCookie(c) {
  const d = { url: cookieUrl(c), name: c.name };
  if (c.storeId) d.storeId = c.storeId;
  if (c.partitionKey) d.partitionKey = c.partitionKey;
  try { await chrome.cookies.remove(d); } catch (e) { showError(e.message); }
}

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    showError(t("errCopy"));
  }
}

function disarmDelete() {
  deleteArmed = false;
  const b = $("deleteAll");
  b.classList.remove("armed");
  b.textContent = t("deleteAll");
  b.disabled = visible().length === 0;
}

async function onDeleteAll() {
  const targets = visible();
  if (!targets.length) return;
  if (!deleteArmed) {
    deleteArmed = true;
    const b = $("deleteAll");
    b.classList.add("armed");
    b.textContent = t("deleteAllConfirm", [String(targets.length)]);
    return;
  }
  for (const c of targets) await removeCookie(c);
  openKey = null;
  toast(t("deleted", [String(targets.length)]));
  await refresh();
}

function onExport(kind) {
  const list = visible();
  if (!list.length) return showError(t("noCookies"));
  if (kind === "json") return copy(toJson(list), t("copiedN", [String(list.length)]));
  if (kind === "netscape") return copy(toNetscape(list), t("copiedN", [String(list.length)]));
  if (kind === "header") return copy(toHeader(list), t("copiedN", [String(list.length)]));
  if (kind === "file") {
    const blob = new Blob([toJson(list)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cookies-${pageUrl.hostname}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}

async function onImport() {
  showError("");
  const { cookies: list, errors } = parseImport($("importText").value);
  if (!list.length) return showError(t("errImport"));
  const now = Date.now() / 1000;
  let ok = 0, failed = errors.length, expired = 0;
  for (const c of list) {
    if (!c.session && c.expirationDate && Number(c.expirationDate) <= now) { expired++; continue; }
    try {
      const res = await chrome.cookies.set(toSetDetails(c, storeId));
      if (res) ok++; else failed++;
    } catch {
      failed++;
    }
  }
  $("importText").value = "";
  $("importBox").hidden = true;
  toast(t("imported", [String(ok), String(failed), String(expired)]));
  await refresh();
}

async function refresh() {
  try {
    await fetchCookies();
  } catch (e) {
    showError(e.message);
    cookies = [];
  }
  render();
}

// ---------- access ----------

async function hasAccess() {
  return chrome.permissions.contains({ origins: [originPatternFor(pageUrl.hostname)] });
}

async function request(origins) {
  showError("");
  try {
    const granted = await chrome.permissions.request({ origins });
    if (granted) await start();
  } catch (e) {
    showError(e.message);
  }
}

async function start() {
  const ok = await hasAccess();
  $("needAccess").hidden = ok;
  $("main").hidden = !ok;
  if (ok) await refresh();
}

async function init() {
  applyI18n();
  tab = await currentTab();
  try { pageUrl = tab && tab.url ? new URL(tab.url) : null; } catch { pageUrl = null; }
  if (!pageUrl || !/^https?:$/.test(pageUrl.protocol)) {
    $("site").textContent = "";
    $("blockedText").textContent = t("blocked");
    $("blocked").hidden = false;
    return;
  }
  $("site").textContent = pageUrl.hostname;
  $("site").title = pageUrl.href;
  storeId = await storeFor(tab.id);

  $("grantSite").textContent = t("grantSite", [siteOf(pageUrl.hostname)]);
  $("grantSite").addEventListener("click", () => request([originPatternFor(pageUrl.hostname)]));
  $("grantAll").addEventListener("click", () => request(["<all_urls>"]));

  $("scope").value = getScope();
  $("scope").addEventListener("change", () => { setScope($("scope").value); openKey = null; refresh(); });
  $("search").addEventListener("input", render);
  $("add").addEventListener("click", () => { openKey = "new"; render(); $("list").scrollTop = 0; });
  $("deleteAll").addEventListener("click", onDeleteAll);
  $("exportSel").addEventListener("change", (e) => { const v = e.target.value; e.target.value = ""; if (v) onExport(v); });
  $("importBtn").addEventListener("click", () => { $("importBox").hidden = !$("importBox").hidden; if (!$("importBox").hidden) $("importText").focus(); });
  $("importCancel").addEventListener("click", () => { $("importBox").hidden = true; });
  $("importRun").addEventListener("click", onImport);

  await start();
}

init().catch((e) => showError(e.message));
