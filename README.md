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

1. **Prices**: the `#pricing` section in `index.html`.
2. **Hours**: the hours table in `index.html`, the footer hours, **and** the `HOURS` object at the top of `js/main.js`. The "Open now" badge reads from `HOURS`.
3. **Payment**: the store currently says quarters plus a change machine. Change it if the store takes cards or app payment.
4. **Wash & fold details**: the price per pound, minimum, and turnaround.
5. **Phone number / email**: none is listed yet. Add one to the footer and the "Visit us" section if you'd like.

## Publishing

Any static host works. For free options:

- **GitHub Pages**: Repo Settings → Pages → deploy from this branch, root folder.
- **Netlify / Cloudflare Pages**: connect the repo with no build command, and set the publish directory to `/`.
