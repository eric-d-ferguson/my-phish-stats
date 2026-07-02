# my-phish-stats

Static site showing my phish.net attendance stats — shows attended, venues,
cities/states visited, and most-played songs. No backend: a GitHub Action
fetches data from the [phish.net API](https://phish.net/api) on a schedule
and commits it as JSON; the page itself is plain HTML/CSS/JS reading that
file, hosted on GitHub Pages.

## How it works

- [`scripts/fetch-data.js`](scripts/fetch-data.js) — Node script that calls
  the phish.net v5 API for everything `fergatron3030` attended, pulls the
  setlist for each show date, and writes [`data/shows.json`](data/shows.json).
- [`.github/workflows/update-data.yml`](.github/workflows/update-data.yml) —
  runs the fetch script weekly (and on manual trigger), commits
  `data/shows.json` if it changed.
- [`index.html`](index.html) / [`app.js`](app.js) / [`style.css`](style.css) —
  static page that fetches `data/shows.json` client-side and renders the
  stats. No build step.

## Setup

1. Get an API key at [phish.net/api](https://phish.net/api).
2. Add it as a repo secret named `PHISHNET_API_KEY`
   (Settings → Secrets and variables → Actions).
3. Run the `Update Phish show data` workflow manually once
   (Actions tab → select workflow → Run workflow) to populate
   `data/shows.json`.
4. Enable GitHub Pages: Settings → Pages → Deploy from branch → `main` / `/root`.

## Local development

```sh
PHISHNET_API_KEY=xxxx node scripts/fetch-data.js
# then just open index.html, or serve the folder:
python3 -m http.server 8000
```

Set `DEBUG=1` on the first real fetch run to dump a raw setlist API response
to the console — useful for confirming field names match what
`scripts/fetch-data.js` expects, since they were assembled from third-party
API docs rather than a live response.
