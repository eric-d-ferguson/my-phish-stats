#!/usr/bin/env node
// Pulls every show fergatron3030 attended from the phish.net v5 API, then
// fetches the setlist for each show and writes it all to data/shows.json.
//
// Run locally with:
//   PHISHNET_API_KEY=xxxx node scripts/fetch-data.js
//
// NOTE: /setlists/showid/{id} returns one row per song played (with
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

// The API isn't consistent about types (flags may be 1/0, "1"/"0", or booleans;
// numbers may be strings), so normalize everything we keep.
function toBool(v) {
  return v === true || v === 1 || v === '1';
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// position is show-wide (it keeps increasing across sets), so it alone gives
// the running order.
function songsInOrder(setlistRows) {
  return [...setlistRows]
    .filter((row) => row.song)
    .sort((a, b) => toNum(a.position) - toNum(b.position))
    .map((row) => ({
      song: row.song,
      songid: toNum(row.songid),
      slug: toStr(row.slug),
      set: toStr(row.set),
      position: toNum(row.position),
      transMark: toStr(row.trans_mark),
      isReprise: toBool(row.isreprise),
      isJam: toBool(row.isjam),
      isJamchart: toBool(row.isjamchart),
      jamchartDescription: toStr(row.jamchart_description),
      tracktime: toStr(row.tracktime),
      gap: toNum(row.gap),
      isOriginal: toBool(row.is_original),
      footnote: toStr(row.footnote),
    }));
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
      // Fetch by showid rather than showdate: a showdate can match setlists from
      // other artists (side projects) playing the same night.
      const setlist = await getJSON(`/setlists/showid/${record.showid}.json`);
      const entry = setlist[0] ?? {};
      if (DEBUG && i === 0) console.log('\nDEBUG raw setlist entry:\n', JSON.stringify(entry, null, 2));

      shows.push({
        showid: record.showid,
        showdate,
        artist: entry.artist_name || record.artist_name || null,
        venue: entry.venue || record.venue || null,
        city: entry.city || record.city || null,
        state: entry.state || record.state || null,
        country: entry.country || record.country || null,
        tour: toStr(entry.tourname) || toStr(record.tour_name),
        permalink: toStr(entry.permalink) || toStr(record.permalink),
        setlistNotes: toStr(entry.setlistnotes) || toStr(record.setlist_notes),
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
