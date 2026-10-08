// Pure helpers: no chrome.* calls here, so they can be tested in Node.

const TWO_PART_SUFFIXES = /^(co|com|ne|net|or|org|ac|ad|ed|go|gr|lg|gov|edu|mil|ltd|plc|sch|nhs|police)$/;

export function isIp(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

// Best guess at the "site" a host belongs to (example.com, example.co.jp).
// Used only to decide which host permission to ask for, never for security.
export function siteOf(host) {
  host = host.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIp(host) || !host.includes(".")) return host;
  const parts = host.split(".");
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const take = parts.length >= 3 && tld.length === 2 && TWO_PART_SUFFIXES.test(sld) ? 3 : 2;
  return parts.slice(-take).join(".");
}

// Match pattern that covers a site and all its subdomains.
export function originPatternFor(host) {
  const site = siteOf(host);
  if (isIp(site) || !site.includes(".")) return `*://${site}/*`;
  return `*://*.${site}/*`;
}

// URL Chrome needs to address a cookie (set/remove).
export function cookieUrl(c) {
  const host = String(c.domain || "").replace(/^\./, "");
  const path = c.path && c.path.startsWith("/") ? c.path : "/";
  return `http${c.secure ? "s" : ""}://${host}${path}`;
}

const SAME_SITE = { no_restriction: "no_restriction", none: "no_restriction", lax: "lax", strict: "strict", unspecified: "unspecified" };

export function normalizeSameSite(v) {
  return SAME_SITE[String(v || "unspecified").toLowerCase()] || "unspecified";
}

// Details for chrome.cookies.set() from a cookie-like object
// (chrome.cookies.Cookie, EditThisCookie export, or Cookie-Editor export).
export function toSetDetails(c, storeId) {
  const hostOnly = c.hostOnly === true || (c.hostOnly === undefined && !String(c.domain || "").startsWith("."));
  const session = c.session === true || c.expirationDate === undefined || c.expirationDate === null || c.expirationDate === "";
  const d = {
    url: cookieUrl(c),
    name: String(c.name ?? ""),
    value: String(c.value ?? ""),
    path: c.path || "/",
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: normalizeSameSite(c.sameSite)
  };
  if (!hostOnly) d.domain = String(c.domain);
  if (!session) d.expirationDate = Number(c.expirationDate);
  if (storeId) d.storeId = storeId;
  if (c.partitionKey && c.partitionKey.topLevelSite) d.partitionKey = { topLevelSite: c.partitionKey.topLevelSite };
  return d;
}

// Fields we export. Matches the EditThisCookie / Cookie-Editor JSON shape.
export function toExport(c, i) {
  const o = {
    domain: c.domain,
    expirationDate: c.session ? undefined : c.expirationDate,
    hostOnly: c.hostOnly,
    httpOnly: c.httpOnly,
    name: c.name,
    path: c.path,
    sameSite: c.sameSite,
    secure: c.secure,
    session: c.session,
    storeId: c.storeId,
    value: c.value,
    id: i + 1
  };
  if (o.expirationDate === undefined) delete o.expirationDate;
  return o;
}

export function toJson(cookies) {
  return JSON.stringify(cookies.map(toExport), null, 2);
}

// Netscape cookies.txt (curl -b, wget --load-cookies, yt-dlp ...).
export function toNetscape(cookies) {
  const lines = ["# Netscape HTTP Cookie File", "# Exported by Honest Cookies", ""];
  for (const c of cookies) {
    const domain = (c.httpOnly ? "#HttpOnly_" : "") + c.domain;
    lines.push([
      domain,
      c.hostOnly ? "FALSE" : "TRUE",
      c.path,
      c.secure ? "TRUE" : "FALSE",
      c.session ? 0 : Math.floor(c.expirationDate),
      c.name,
      c.value
    ].join("\t"));
  }
  return lines.join("\n") + "\n";
}

// "Cookie:" request header value.
export function toHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

// Accepts JSON (array, or {cookies: [...]}) or Netscape cookies.txt.
// Returns { cookies, errors }.
export function parseImport(text) {
  const src = String(text || "").trim();
  if (!src) return { cookies: [], errors: ["empty"] };
  if (src.startsWith("[") || src.startsWith("{")) {
    let data;
    try { data = JSON.parse(src); } catch { return { cookies: [], errors: ["json"] }; }
    const list = Array.isArray(data) ? data : Array.isArray(data.cookies) ? data.cookies : null;
    if (!list) return { cookies: [], errors: ["format"] };
    const cookies = [];
    const errors = [];
    list.forEach((c, i) => {
      if (!c || typeof c !== "object" || !c.name && c.name !== "" || !c.domain) errors.push(`#${i + 1}`);
      else cookies.push(c);
    });
    return { cookies, errors };
  }
  const cookies = [];
  const errors = [];
  src.split(/\r?\n/).forEach((line, i) => {
    let l = line;
    let httpOnly = false;
    if (l.startsWith("#HttpOnly_")) { httpOnly = true; l = l.slice(10); }
    else if (!l.trim() || l.startsWith("#")) return;
    const f = l.split("\t");
    if (f.length < 7) { errors.push(`line ${i + 1}`); return; }
    const exp = Number(f[4]);
    cookies.push({
      domain: f[0],
      hostOnly: f[1] !== "TRUE",
      path: f[2],
      secure: f[3] === "TRUE",
      expirationDate: exp > 0 ? exp : undefined,
      session: !(exp > 0),
      name: f[5],
      value: f.slice(6).join("\t"),
      httpOnly
    });
  });
  if (!cookies.length && !errors.length) errors.push("format");
  return { cookies, errors };
}

// <input type="datetime-local"> value <-> unix seconds (local time).
export function toLocalInput(seconds) {
  const d = new Date(seconds * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

// RFC 6265 token rules, loosely: what Chrome will accept.
export function isValidName(name) {
  return !/[\x00-\x1f\x7f;=]/.test(name) && name.trim() === name;
}
export function isValidValue(value) {
  return !/[\x00-\x1f\x7f;]/.test(value);
}
