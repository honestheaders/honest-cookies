# Chrome Web Store listing – Honest Cookies 1.0.0

## Name
Honest Cookies – Cookie Editor

## Description
View, edit, add, delete, export and import cookies – without giving an extension access to every website.

Honest Cookies installs with no site access at all. When you open it on a site, it asks for that site only. Nothing is sent anywhere: no analytics, no tracking, no remote code. The source code is public.

Features
- Cookie list for this page or the whole site, with search
- Edit name, value, domain, path, expiry or session, Secure, HttpOnly, SameSite, host-only
- Add, delete one, or delete all
- Export as JSON (EditThisCookie / Cookie-Editor format), Netscape cookies.txt (curl, wget, yt-dlp) or a Cookie header
- Import EditThisCookie / Cookie-Editor JSON or cookies.txt
- Partitioned (CHIPS) cookies and incognito windows
- English and Japanese

Honest Cookies is not made by or connected to the authors of EditThisCookie or Cookie-Editor. It can read their export files.

## Permission justifications
- cookies: to show and change the cookies the user chooses
- activeTab: to know which page the popup was opened on
- optional host access: requested for one site at a time when the user clicks "Allow", required by Chrome to read that site's cookies

## Privacy policy URL
https://github.com/honestheaders/honest-cookies/blob/main/PRIVACY.md
