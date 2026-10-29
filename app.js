const $ = (sel) => document.querySelector(sel);

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// setlist_notes from phish.net contain HTML; show them as plain text.
const stripTags = (html) => new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();

const showLink = (show, text) =>
  /^https?:\/\//.test(show.permalink || '')
    ? `<a href="${esc(show.permalink)}" target="_blank" rel="noopener">${text}</a>`
    : text;

// songs used to be plain strings; normalize to objects so callers don't care.
function songObjs(show) {
  return (show.songs || []).map((s, i) => (typeof s === 'string' ? { song: s, position: i + 1 } : s));
}

// True once shows.json has been regenerated with per-song detail (set, gap, jamchart...).
const hasDetail = (shows) => shows.some((show) => (show.songs || []).some((s) => typeof s === 'object'));

const NEEDS_FETCH = '<p class="muted">Needs a fresh data fetch — run the fetch script to populate setlist detail.</p>';

function setLabel(set) {
  if (!set) return 'Setlist';
  if (/^\d+$/.test(set)) return `Set ${set}`;
  const encore = set.match(/^e(\d*)$/i);
  if (encore) return encore[1] ? `Encore ${encore[1]}` : 'Encore';
  return set;
}

const isEncore = (set) => /^e/i.test(set || '');

// Ordered [setName, songs[]] pairs, in the order sets first appear.
function groupSets(songs) {
  const sets = new Map();
  for (const s of songs) {
    const key = s.set ?? '';
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(s);
  }
  return [...sets.entries()];
}

const place = (show) => [show.city, show.state].filter(Boolean).join(', ');

function computeStats(shows) {
  const venues = new Set();
  const cities = new Set();
  const states = new Set();
  const countries = new Set();
  const songCounts = new Map();
  const showsPerYear = new Map();

  for (const show of shows) {
    if (show.venue) venues.add(show.venue);
    if (show.city) cities.add(show.city);
    if (show.state) states.add(show.state);
    if (show.country) countries.add(show.country);

    const year = show.showdate?.slice(0, 4);
    if (year) showsPerYear.set(year, (showsPerYear.get(year) || 0) + 1);

    for (const entry of show.songs || []) {
      // songs used to be plain strings; now they're objects with a `song` field
      const song = typeof entry === 'string' ? entry : entry.song;
      songCounts.set(song, (songCounts.get(song) || 0) + 1);
    }
  }

  const topSongs = [...songCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const sortedShows = [...shows].sort((a, b) => a.showdate.localeCompare(b.showdate));

  return {
    totalShows: shows.length,
    firstShow: sortedShows[0]?.showdate ?? null,
    lastShow: sortedShows[sortedShows.length - 1]?.showdate ?? null,
    uniqueVenues: venues.size,
    uniqueCities: cities.size,
    uniqueStates: [...states].sort(),
    uniqueCountries: [...countries].sort(),
    uniqueSongs: songCounts.size,
    topSongs,
    showsPerYear: [...showsPerYear.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

function renderStatGrid(stats) {
  const items = [
    ['Shows attended', stats.totalShows],
    ['First show', fmtDate(stats.firstShow), 'date'],
    ['Most recent', fmtDate(stats.lastShow), 'date'],
    ['Unique venues', stats.uniqueVenues],
    ['Unique cities', stats.uniqueCities],
    ['States/provinces', stats.uniqueStates.length],
    ['Unique songs heard', stats.uniqueSongs],
  ];

  $('#stat-grid').innerHTML = items
    .map(([label, value, kind]) => `
      <div class="stat-card">
        <div class="stat-value${kind === 'date' ? ' stat-value--date' : ''}">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    `)
    .join('');
}

function renderStatesList(stats) {
  $('#states-list').innerHTML = stats.uniqueStates.length
    ? stats.uniqueStates.map((s) => `<li>${s}</li>`).join('')
    : '<li class="muted">No state data yet.</li>';
}

function renderTopSongs(stats) {
  const max = stats.topSongs[0]?.[1] ?? 1;
  $('#top-songs').innerHTML = stats.topSongs.length
    ? stats.topSongs
        .map(
          ([song, count]) => `
        <div class="song-row">
          <span class="song-name">${song}</span>
          <div class="song-bar-track">
            <div class="song-bar" style="width:${(count / max) * 100}%"></div>
          </div>
          <span class="song-count">${count}</span>
        </div>
      `
        )
        .join('')
    : '<p class="muted">No setlist data yet.</p>';
}

function renderShowsPerYear(stats) {
  const max = Math.max(1, ...stats.showsPerYear.map(([, c]) => c));
  $('#shows-per-year').innerHTML = stats.showsPerYear.length
    ? stats.showsPerYear
        .map(
          ([year, count]) => `
        <div class="year-col">
          <div class="year-bar" style="height:${(count / max) * 100}%"></div>
          <div class="year-count">${count}</div>
          <div class="year-label">${year}</div>
        </div>
      `
        )
        .join('')
    : '<p class="muted">No show data yet.</p>';
}

function renderJamcharts(shows) {
  if (!hasDetail(shows)) return ($('#jamcharts').innerHTML = NEEDS_FETCH);

  const items = shows.flatMap((show) =>
    songObjs(show).filter((s) => s.isJamchart).map((s) => ({ show, s }))
  );
  if (!items.length) return ($('#jamcharts').innerHTML = '<p class="muted">No jam-chart versions yet.</p>');

  const showCount = new Set(items.map(({ show }) => show.showid)).size;
  $('#jamcharts').innerHTML = `
    <p class="section-note">${items.length} jam-chart version${items.length === 1 ? '' : 's'} across ${showCount} show${showCount === 1 ? '' : 's'}.</p>
    ${items
      .map(
        ({ show, s }) => `
      <div class="jam-row">
        <div class="jam-head">
          <span class="jam-song">${esc(s.song)}</span>
          <span class="jam-meta">${showLink(show, fmtDate(show.showdate))} · ${esc(show.venue)}${s.tracktime ? ` · ${esc(s.tracktime)}` : ''}</span>
        </div>
        ${s.jamchartDescription ? `<p class="jam-desc">${esc(s.jamchartDescription)}</p>` : ''}
      </div>
    `
      )
      .join('')}
  `;
}

function renderBustouts(shows) {
  if (!hasDetail(shows)) return ($('#bustouts').innerHTML = NEEDS_FETCH);

  const items = shows
    .flatMap((show) => songObjs(show).filter((s) => s.gap > 0).map((s) => ({ show, s })))
    .sort((a, b) => b.s.gap - a.s.gap)
    .slice(0, 10);
  if (!items.length) return ($('#bustouts').innerHTML = '<p class="muted">No gap data yet.</p>');

  $('#bustouts').innerHTML = `
    <p class="section-note">The longest gaps — Phish shows since the song was last played — of anything you caught.</p>
    ${items
      .map(
        ({ show, s }) => `
      <div class="bustout-row">
        <span class="bustout-song">${esc(s.song)}</span>
        <span class="bustout-meta">${showLink(show, fmtDate(show.showdate))} · ${esc(show.venue)}</span>
        <span class="bustout-gap"><strong>${s.gap}</strong> shows</span>
      </div>
    `
      )
      .join('')}
  `;
}

function renderRotation(shows) {
  if (!hasDetail(shows)) return ($('#rotation').innerHTML = NEEDS_FETCH);

  const openers = new Map();
  const closers = new Map();
  const encores = new Map();
  const bump = (map, song) => map.set(song, (map.get(song) || 0) + 1);

  for (const show of shows) {
    const sets = groupSets(songObjs(show));
    const mainSets = sets.filter(([set]) => !isEncore(set));
    if (mainSets.length) bump(openers, mainSets[0][1][0].song);
    for (const [, songs] of mainSets) bump(closers, songs[songs.length - 1].song);
    for (const [set, songs] of sets) if (isEncore(set)) songs.forEach((s) => bump(encores, s.song));
  }

  const card = (title, map) => {
    const top = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
    return `
      <div class="rotation-card">
        <h3>${title}</h3>
        ${
          top.length
            ? `<ol>${top.map(([song, n]) => `<li><span>${esc(song)}</span><span class="song-count">${n}</span></li>`).join('')}</ol>`
            : '<p class="muted">None yet.</p>'
        }
      </div>
    `;
  };

  $('#rotation').innerHTML = card('Show openers', openers) + card('Set closers', closers) + card('Encores', encores);
}

function renderSetlists(shows) {
  if (!shows.length) return ($('#setlists').innerHTML = '<p class="muted">No show data yet.</p>');

  const detail = hasDetail(shows);
  const songHTML = (s, isLast) => {
    const name = `<span class="${s.isJamchart ? 'is-jamchart' : ''}">${esc(s.song)}</span>`;
    if (isLast) return name;
    const mark = s.transMark === '>' || s.transMark === '->' ? s.transMark : null;
    return mark ? `${name} <span class="segue">${esc(mark)}</span> ` : `${name}, `;
  };

  const sorted = [...shows].sort((a, b) => b.showdate.localeCompare(a.showdate));
  $('#setlists').innerHTML = `
    ${detail ? '<p class="section-note">Highlighted songs are jam-chart versions.</p>' : ''}
    ${sorted
      .map((show) => {
        const sets = groupSets(songObjs(show));
        return `
      <details class="show">
        <summary>
          <span class="show-date">${fmtDate(show.showdate)}</span>
          <span class="show-venue">${esc(show.venue || 'Unknown venue')}</span>
          <span class="show-place">${esc(place(show))}</span>
        </summary>
        <div class="setlist">
          ${
            sets.length
              ? sets
                  .map(
                    ([set, songs]) => `
            <p><span class="set-label">${esc(setLabel(set))}</span>${songs.map((s, i) => songHTML(s, i === songs.length - 1)).join('')}</p>
          `
                  )
                  .join('')
              : '<p class="muted">No setlist available.</p>'
          }
          ${show.setlistNotes ? `<p class="setlist-notes">${esc(stripTags(show.setlistNotes))}</p>` : ''}
          ${show.permalink ? `<p class="setlist-link">${showLink(show, 'View on phish.net ↗')}</p>` : ''}
        </div>
      </details>
    `;
      })
      .join('')}
  `;
}

async function init() {
  const res = await fetch('data/shows.json');
  const data = await res.json();

  $('#generated-at').textContent = data.generatedAt
    ? `Data as of ${new Date(data.generatedAt).toLocaleDateString()}`
    : 'No data yet — run the fetch script to populate data/shows.json';

  const stats = computeStats(data.shows || []);
  renderStatGrid(stats);
  renderStatesList(stats);
  renderTopSongs(stats);
  renderShowsPerYear(stats);

  const shows = data.shows || [];
  renderJamcharts(shows);
  renderBustouts(shows);
  renderRotation(shows);
  renderSetlists(shows);
}

init();
