# Brownsburg Laundry Website

A simple, fast, mobile-friendly website for **Brownsburg Laundry**, 812 E Main St, Brownsburg, IN 46112.

It is plain HTML, CSS, and JavaScript with no build step. Open `index.html` in a browser to preview it.

## Files

- `index.html`: all page content (services, pricing, hours, map, FAQ)
- `css/styles.css`: styling
- `js/main.js`: mobile menu and the live "Open now / Closed" badge
- `assets/favicon.svg`: logo and browser-tab icon

## Before going live: fill in the real details

Some information below is **placeholder** text. Update it to match the store:

1. **Washer prices**: 20 lb ($3.50), 30 lb ($5.75), and 60 lb ($7.75) are confirmed. The 40 lb and 50 lb prices still need to be added (see the TODO in the `#pricing` section of `index.html`).
2. **Wash & fold details**: confirm the store offers it. If it does, check the price per pound, minimum, and turnaround.
3. **Phone number / email**: none is listed yet. Add one to the footer and the "Visit us" section if you'd like.

Confirmed: hours (7 AM – 10 PM daily), dryers ($0.25 per 4 minutes), and payment (quarters, with a Flex card system on select washers). If the hours ever change, update the hours table in `index.html`, the footer, **and** the `HOURS` object at the top of `js/main.js`, which the "Open now" badge reads from.

## Publishing

Any static host works. For free options:

- **GitHub Pages**: Repo Settings → Pages → deploy from this branch, root folder.
- **Netlify / Cloudflare Pages**: connect the repo with no build command, and set the publish directory to `/`.

## Brush Coach

`brush/` holds a separate, unrelated app: Brush Coach, which gives real-time feedback on how you brush your teeth. See [`brush/README.md`](brush/README.md). It's served at `/brush/` alongside the site and isn't linked from it.
