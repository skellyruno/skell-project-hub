'use strict';

function snapshotFreshness(seedVersion, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(seedVersion || ''));
  if (!match) {
    return {
      state: 'unknown',
      ageDays: null,
      text: 'SNAPSHOT DATE UNKNOWN · GitHub results are not live until refreshed',
      title: 'The seeded GitHub snapshot date is unavailable.'
    };
  }

  const [year, month, day] = match.slice(1).map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const snapshot = new Date(timestamp);
  if (!Number.isFinite(timestamp) ||
      snapshot.getUTCFullYear() !== year ||
      snapshot.getUTCMonth() !== month - 1 ||
      snapshot.getUTCDate() !== day) {
    return {
      state: 'unknown',
      ageDays: null,
      text: 'SNAPSHOT DATE UNKNOWN · GitHub results are not live until refreshed',
      title: 'The seeded GitHub snapshot date is invalid.'
    };
  }

  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) {
    return {
      state: 'unknown',
      ageDays: null,
      text: 'SNAPSHOT DATE UNKNOWN · GitHub results are not live until refreshed',
      title: 'The current date could not be read.'
    };
  }

  const today = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
  const ageDays = Math.floor((today - timestamp) / 86400000);
  const ageLabel = ageDays < 0
    ? `DATE ${Math.abs(ageDays)} DAYS AHEAD`
    : ageDays === 0
      ? 'UPDATED TODAY'
      : ageDays === 1
        ? '1 DAY OLD'
        : `${ageDays} DAYS OLD`;
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(snapshot).toUpperCase();

  return {
    state: ageDays < 0 ? 'future' : ageDays === 0 ? 'current' : 'stale',
    ageDays,
    text: `SNAPSHOT: ${dateLabel} · ${ageLabel} · GitHub results are not live until refreshed`,
    title: `Seeded GitHub metadata snapshot from ${seedVersion}. Refresh individual projects to check current public GitHub metadata.`
  };
}

function renderSnapshotFreshness() {
  const node = document.getElementById('footerDate');
  if (!node) return;
  const version = typeof SEED_VERSION === 'string' ? SEED_VERSION : '';
  const result = snapshotFreshness(version);
  node.textContent = result.text;
  node.dataset.freshness = result.state;
  if (result.ageDays === null) delete node.dataset.ageDays;
  else node.dataset.ageDays = String(result.ageDays);
  node.title = result.title;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.skellSnapshotFreshness = snapshotFreshness;
  renderSnapshotFreshness();
}
