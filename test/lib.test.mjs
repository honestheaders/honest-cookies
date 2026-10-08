import assert from "node:assert/strict";
import { siteOf, originPatternFor, cookieUrl, toSetDetails, toNetscape, toHeader, toJson, parseImport, isValidName, isValidValue } from "../lib/cookies.js";

assert.equal(siteOf("www.example.com"), "example.com");
assert.equal(siteOf("a.b.example.co.jp"), "example.co.jp");
assert.equal(siteOf("shop.example.co.uk"), "example.co.uk");
assert.equal(siteOf("example.jp"), "example.jp");
assert.equal(siteOf("localhost"), "localhost");
assert.equal(siteOf("127.0.0.1"), "127.0.0.1");
assert.equal(originPatternFor("www.example.com"), "*://*.example.com/*");
assert.equal(originPatternFor("127.0.0.1"), "*://127.0.0.1/*");

assert.equal(cookieUrl({ domain: ".example.com", path: "/a", secure: true }), "https://example.com/a");

// EditThisCookie export row
const etc = { domain: ".example.com", expirationDate: 1893456000.5, hostOnly: false, httpOnly: true, name: "sid", path: "/", sameSite: "lax", secure: true, session: false, storeId: "0", value: "abc", id: 1 };
assert.deepEqual(toSetDetails(etc, "1"), { url: "https://example.com/", name: "sid", value: "abc", path: "/", secure: true, httpOnly: true, sameSite: "lax", domain: ".example.com", expirationDate: 1893456000.5, storeId: "1" });
// Cookie-Editor style: sameSite null, host-only, session
const ce = { domain: "www.example.com", hostOnly: true, httpOnly: false, name: "a", path: "/", sameSite: null, secure: false, session: true, value: "1" };
assert.deepEqual(toSetDetails(ce), { url: "http://www.example.com/", name: "a", value: "1", path: "/", secure: false, httpOnly: false, sameSite: "unspecified" });

const list = [etc, { ...ce, expirationDate: undefined }];
const txt = toNetscape(list);
assert.match(txt, /#HttpOnly_\.example\.com\tTRUE\t\/\tTRUE\t1893456000\tsid\tabc/);
assert.match(txt, /www\.example\.com\tFALSE\t\/\tFALSE\t0\ta\t1/);
assert.equal(toHeader(list), "sid=abc; a=1");

// round trips
const back = parseImport(txt);
assert.equal(back.errors.length, 0);
assert.equal(back.cookies.length, 2);
assert.equal(back.cookies[0].httpOnly, true);
assert.equal(back.cookies[0].hostOnly, false);
assert.equal(back.cookies[1].session, true);
const j = parseImport(toJson(list));
assert.equal(j.cookies.length, 2);
assert.equal(j.cookies[1].expirationDate, undefined);
assert.equal(parseImport(JSON.stringify({ cookies: [etc] })).cookies.length, 1);
assert.deepEqual(parseImport("[{\"name\":\"x\"}]").errors, ["#1"]);
assert.deepEqual(parseImport("{bad").errors, ["json"]);
assert.deepEqual(parseImport("hello").errors, ["line 1"]);

assert.ok(isValidName("__Host-sid"));
assert.ok(!isValidName("a;b"));
assert.ok(!isValidName(" a"));
assert.ok(isValidValue("a b=c"));
assert.ok(!isValidValue("a;b"));
console.log("lib tests passed");
