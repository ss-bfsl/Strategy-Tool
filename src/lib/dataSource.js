// ─────────────────────────────────────────────────────────────────────────
// dataSource.js
//
// This is the layer you will replace piece-by-piece with real fetching.
// Right now every "fetcher" below returns bundled mock data after a fake
// delay, so the frontend behaves exactly like it will once real fetching
// (via a small Node backend — browsers can't hit NSE/AMFI directly because
// of CORS) is wired in.
//
// The scheduling rule implemented here matches what you described:
//   - Each dataset only "auto refreshes" once, during the first 7 days of
//     a calendar month.
//   - Outside that window, the last stored snapshot is served instantly.
//   - A manual "Refresh now" button can force a re-fetch at any time.
//
// Storage is localStorage for now (per-browser, resets if you clear site
// data). When you move to a real backend, swap STORAGE.get/set for a
// fetch() to your API and the rest of the app doesn't need to change.
// ─────────────────────────────────────────────────────────────────────────

import { BROKER_LEADERBOARD, INDUSTRY_PARAMS, NEWS_ITEMS, MF_SIF_DATA } from '../data/mockData';

const STORAGE_PREFIX = 'cbt:'; // competitor-benchmark-tool
const DATA_VERSION = 4;
const SOURCE_DATA = {
  brokerLeaderboard: BROKER_LEADERBOARD,
  industryParams: INDUSTRY_PARAMS,
  news: NEWS_ITEMS,
  mfSif: MF_SIF_DATA,
};

const STORAGE = {
  get(key) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable — fail silently, app still works */
    }
  },
};

function isWithinFirstWeekOfMonth(date = new Date()) {
  return date.getDate() <= 7;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMonthValue(rawValue) {
  if (!rawValue) return null;

  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue;
  }

  const value = String(rawValue).trim();
  if (!value || value === '—') return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;

  const parsed = new Date(`${match[1]} 1, ${match[2]}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLatestSourceTimestamp(data) {
  if (!data) return null;

  const candidates = [];

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      candidates.push(item.asOf, item.date, item.month, item.fetchedAt);
      if (Array.isArray(item.history)) {
        item.history.forEach((entry) => candidates.push(entry.month));
      }
    });
  } else if (typeof data === 'object') {
    const rows = Array.isArray(data.headline) ? data.headline : [];
    rows.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      candidates.push(item.date, item.month);
      if (Array.isArray(item.history)) {
        item.history.forEach((entry) => candidates.push(entry.month));
      }
    });
  }

  let latest = null;
  for (const candidate of candidates) {
    const parsed = parseMonthValue(candidate);
    if (!parsed) continue;
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  }

  return latest ? latest.getTime() : null;
}

function shouldRefreshFromSource(datasetKey, cached) {
  const sourceData = SOURCE_DATA[datasetKey];
  if (!cached || !sourceData) return false;

  const cachedTime = new Date(cached.fetchedAt || 0).getTime();
  const latestSourceTime = getLatestSourceTimestamp(sourceData);
  if (!latestSourceTime) return false;

  return latestSourceTime > cachedTime;
}

// Simulated network fetchers. Replace the inside of each of these with a
// real call to your backend once it exists, e.g.:
//   const res = await fetch('/api/broking-industry-data');
//   return res.json();
async function fetchBrokerLeaderboardRemote() {
  await delay(700);
  return BROKER_LEADERBOARD;
}

async function fetchIndustryParamsRemote() {
  await delay(900);
  return INDUSTRY_PARAMS;
}

async function fetchNewsRemote() {
  await delay(500);
  return NEWS_ITEMS;
}

async function fetchMfSifRemote() {
  await delay(800);
  return MF_SIF_DATA;
}

const REMOTE_FETCHERS = {
  brokerLeaderboard: fetchBrokerLeaderboardRemote,
  industryParams: fetchIndustryParamsRemote,
  news: fetchNewsRemote,
  mfSif: fetchMfSifRemote,
};

/**
 * Core loader used by every page.
 *
 * @param {string} datasetKey - one of REMOTE_FETCHERS keys
 * @param {object} opts
 * @param {boolean} opts.autoRefreshMonthly - if true, obeys the "first week
 *        of month, once per month" rule. News uses this = false and instead
 *        checks an hourly cadence.
 * @param {number} opts.hourlyIntervalMs - for datasets refreshed hourly
 *        instead of monthly (news).
 */
export async function loadDataset(datasetKey, { cadence = 'monthly' } = {}) {
  const cached = STORAGE.get(datasetKey);
  const now = new Date();
  const dataHasNewerSourceValues = shouldRefreshFromSource(datasetKey, cached);

  if (cadence === 'monthly') {
    const dueForAutoFetch =
      isWithinFirstWeekOfMonth(now) && (!cached || cached.fetchedForMonth !== monthKey(now));

    if (!cached || cached.dataVersion !== DATA_VERSION || dueForAutoFetch || dataHasNewerSourceValues) {
      const data = await REMOTE_FETCHERS[datasetKey]();
      const record = {
        data,
        dataVersion: DATA_VERSION,
        fetchedAt: now.toISOString(),
        fetchedForMonth: monthKey(now),
        trigger: cached ? (dataHasNewerSourceValues ? 'source-update' : 'auto-monthly') : 'initial',
      };
      STORAGE.set(datasetKey, record);
      return record;
    }
    return cached;
  }

  if (cadence === 'hourly') {
    const HOUR = 60 * 60 * 1000;
    const stale = !cached || cached.dataVersion !== DATA_VERSION || now.getTime() - new Date(cached.fetchedAt).getTime() > HOUR || dataHasNewerSourceValues;
    if (stale) {
      const data = await REMOTE_FETCHERS[datasetKey]();
      const record = { data, dataVersion: DATA_VERSION, fetchedAt: now.toISOString(), trigger: cached ? (dataHasNewerSourceValues ? 'source-update' : 'auto-hourly') : 'initial' };
      STORAGE.set(datasetKey, record);
      return record;
    }
    return cached;
  }

  // Fallback: no cadence rule, just fetch fresh once and cache it.
  if (cached && !dataHasNewerSourceValues) return cached;
  const data = await REMOTE_FETCHERS[datasetKey]();
  const record = { data, dataVersion: DATA_VERSION, fetchedAt: now.toISOString(), trigger: dataHasNewerSourceValues ? 'source-update' : 'initial' };
  STORAGE.set(datasetKey, record);
  return record;
}

/** Force a re-fetch regardless of schedule — wired to every "Refresh now" button. */
export async function forceRefresh(datasetKey) {
  const data = await REMOTE_FETCHERS[datasetKey]();
  const record = {
    data,
    dataVersion: DATA_VERSION,
    fetchedAt: new Date().toISOString(),
    fetchedForMonth: monthKey(),
    trigger: 'manual',
  };
  STORAGE.set(datasetKey, record);
  return record;
}

export function clearAllCaches() {
  Object.keys(REMOTE_FETCHERS).forEach((k) => localStorage.removeItem(STORAGE_PREFIX + k));
}
