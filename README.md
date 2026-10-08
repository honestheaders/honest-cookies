# Honest Cookies

A small, private Chrome extension to view, edit, add, delete, export and import cookies.
Built as an open-source, Manifest V3 replacement for the cookie editors that disappeared from the Chrome Web Store.

- Cookie list for **this page** or the **whole site**, with search
- Edit every field: name, value, domain, path, expiry or session, Secure, HttpOnly, SameSite, host-only
- Add, delete one, or delete all (two clicks)
- Export: copy as JSON (EditThisCookie / Cookie-Editor format), as Netscape `cookies.txt` (for curl, wget, yt-dlp), or as a `Cookie:` header; save a JSON file
- Import: paste JSON (EditThisCookie / Cookie-Editor exports) or `cookies.txt`
- Partitioned (CHIPS) cookies and incognito windows are handled
- English and Japanese

## Asks for access one site at a time

Most cookie editors ask to "read and change all your data on all websites" when you install them.
Honest Cookies installs with **no site access at all**. When you open it on a site, it asks for that site only
(`*.example.com`). You can also choose "all sites" if you prefer. You can take access back at any time in Chrome's extension settings.

- **No data collection, no analytics, no ads, no remote code.** The extension makes no network requests of its own.

## Files

| File | What it does |
|---|---|
| `popup.*` | The whole user interface |
| `lib/cookies.js` | Import/export formats and field rules (no Chrome APIs; tested in `test/lib.test.mjs`) |

## Permissions

- `cookies` – to read and change cookies
- `activeTab` – to know which page you opened the popup on
- optional site access – asked for one site at a time, only when you click "Allow"

## Privacy

See [PRIVACY.md](PRIVACY.md).

## Tests

```
node test/lib.test.mjs
node test/e2e.mjs <unpacked copy with host_permissions> <unpacked copy as shipped>   # needs Playwright
```

## License

MIT
