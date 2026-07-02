const $ = (sel) => document.querySelector(sel);

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

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

    for (const song of show.songs || []) {
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
    ['First show', fmtDate(stats.firstShow)],
    ['Most recent', fmtDate(stats.lastShow)],
    ['Unique venues', stats.uniqueVenues],
    ['Unique cities', stats.uniqueCities],
    ['States/provinces', stats.uniqueStates.length],
    ['Unique songs heard', stats.uniqueSongs],
  ];

  $('#stat-grid').innerHTML = items
    .map(([label, value]) => `
      <div class="stat-card">
        <div class="stat-value">${value}</div>
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
}

init();
