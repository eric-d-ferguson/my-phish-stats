#!/usr/bin/env node
// Pulls every show fergatron3030 attended from the phish.net v5 API, then
// fetches the setlist for each show date and writes it all to data/shows.json.
//
// Run locally with:
//   PHISHNET_API_KEY=xxxx node scripts/fetch-data.js
//
// NOTE: phish.net's docs site (docs.phish.net) blocks automated fetches, so
// the exact field names in the /setlists response below were pieced together
// from third-party API wrappers and search results, not a live response. Run
// with DEBUG=1 on the first real attempt and check the console output against
// data/shows.json — adjust extractSongs()/field names if they don't match.

import fs from 'node:fs';

const API_KEY = process.env.PHISHNET_API_KEY;
const USERNAME = process.env.PHISHNET_USERNAME || 'fergatron3030';
const DEBUG = !!process.env.DEBUG;
const BASE = 'https://api.phish.net/v5';

if (!API_KEY) {
  console.error('Missing PHISHNET_API_KEY env var.');
  process.exit(1);
}

async function getJSON(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}apikey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`API error for ${url}: ${JSON.stringify(body)}`);
  return body.data ?? [];
}

function extractSongs(setlistHtml) {
  if (!setlistHtml) return [];
  // The API returns setlist text as HTML with each song wrapped in an <a> tag.
  return [...setlistHtml.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1].trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Fetching attendance for ${USERNAME}...`);
  const attended = await getJSON(`/attendance/username/${USERNAME}.json`);
  console.log(`Found ${attended.length} attended show(s).`);

  const shows = [];
  for (const [i, record] of attended.entries()) {
    const showdate = record.showdate;
    process.stdout.write(`  [${i + 1}/${attended.length}] ${showdate}... `);
    try {
      const setlist = await getJSON(`/setlists/showdate/${showdate}.json`);
      const entry = setlist[0] ?? {};
      if (DEBUG && i === 0) console.log('\nDEBUG raw setlist entry:\n', JSON.stringify(entry, null, 2));

      shows.push({
        showid: record.showid,
        showdate,
        venue: entry.venue || record.venue || null,
        city: entry.city || record.city || null,
        state: entry.state || record.state || null,
        country: entry.country || record.country || null,
        songs: extractSongs(entry.setlistdata),
      });
      console.log('ok');
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      shows.push({ showid: record.showid, showdate, error: err.message, songs: [] });
    }
    await sleep(250); // be polite to the API
  }

  shows.sort((a, b) => a.showdate.localeCompare(b.showdate));

  const output = {
    username: USERNAME,
    generatedAt: new Date().toISOString(),
    totalShows: shows.length,
    shows,
  };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/shows.json', JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote data/shows.json with ${shows.length} show(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
