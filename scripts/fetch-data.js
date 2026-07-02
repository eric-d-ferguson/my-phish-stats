#!/usr/bin/env node
// Pulls every show fergatron3030 attended from the phish.net v5 API, then
// fetches the setlist for each show date and writes it all to data/shows.json.
//
// Run locally with:
//   PHISHNET_API_KEY=xxxx node scripts/fetch-data.js
//
// NOTE: /setlists/showdate/{date} returns one row per song played (with
// `song`, `set`, `position`, `trans_mark`, etc.) rather than a single show
// object — confirmed via a live DEBUG=1 run.

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

function songsInOrder(setlistRows) {
  return [...setlistRows]
    .sort((a, b) => String(a.set).localeCompare(String(b.set)) || a.position - b.position)
    .map((row) => row.song)
    .filter(Boolean);
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
        songs: songsInOrder(setlist),
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
