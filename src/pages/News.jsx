import { useMemo, useState } from 'react';
import { useNewsApi } from '../lib/useNewsSocket';
import { Check, RefreshCw, Circle, Search } from 'lucide-react';

const READ_NEWS_STORAGE_KEY = 'cbt:read-news';

function loadReadIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(READ_NEWS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function newsTimestamp(item) {
  const timestamp = Date.parse(item.date);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

const STATUS_LABEL = {
  connecting: 'Connecting…',
  open: 'Live',
  static: 'Saved feed · live service offline',
  closed: 'Disconnected — is main.py running?',
  unavailable: 'Live feed unavailable on this deployment',
};

const STATUS_COLOR = {
  connecting: 'var(--amber)',
  open: 'var(--teal)',
  static: 'var(--amber)',
  closed: 'var(--rose)',
  unavailable: 'var(--text-faint)',
};

const CATEGORIES = [
  { id: 'all', label: 'All intelligence' },
  { id: 'bfsl', label: 'BFSL' },
  { id: 'competition', label: 'Broker competition' },
  { id: 'markets', label: 'Markets & regulation' },
  { id: 'fintech', label: 'Fintech ecosystem' },
];

const CATEGORY_LABEL = {
  bfsl: 'BFSL',
  competition: 'Broker competition',
  markets: 'Markets & regulation',
  fintech: 'Fintech ecosystem',
};

const PRIORITY_COMPETITORS = ['Zerodha', 'Sahi', 'Groww', 'Angel One', 'Upstox', 'Dhan'];

function uniqueStories(items) {
  const byStory = new Map();
  items.forEach((item) => {
    const key = item.clusterKey || item.id;
    const current = byStory.get(key);
    if (!current) {
      byStory.set(key, { ...item, coverageCount: 1 });
      return;
    }
    current.coverageCount += 1;
    if (newsTimestamp(item) > newsTimestamp(current)) {
      byStory.set(key, { ...item, coverageCount: current.coverageCount });
    }
  });
  return [...byStory.values()];
}

export default function News() {
  const { items, status, reconnect } = useNewsApi();
  const [readIds, setReadIds] = useState(loadReadIds);
  const [category, setCategory] = useState('all');
  const [company, setCompany] = useState('all');
  const [query, setQuery] = useState('');

  const allStories = useMemo(
    () => uniqueStories(items).sort((first, second) => newsTimestamp(second) - newsTimestamp(first)),
    [items],
  );
  const unreadStories = useMemo(() => allStories.filter((item) => !readIds.has(item.id)), [allStories, readIds]);
  const companies = useMemo(() => {
    const observed = new Set(allStories
      .filter((item) => item.category === 'competition' && item.company)
      .map((item) => item.company));
    const priority = PRIORITY_COMPETITORS.filter((name) => observed.has(name));
    const remaining = [...observed].filter((name) => !PRIORITY_COMPETITORS.includes(name)).sort((a, b) => a.localeCompare(b));
    return [...new Set([...PRIORITY_COMPETITORS, ...priority, ...remaining])];
  }, [allStories]);
  const categoryCounts = useMemo(() => Object.fromEntries(CATEGORIES.map(({ id }) => [
    id,
    unreadStories.filter((item) => id === 'all' || item.category === id).length,
  ])), [unreadStories]);
  const visibleItems = useMemo(() => unreadStories.filter((item) => {
    const matchesCategory = category === 'all' || item.category === category;
    const matchesCompany = category !== 'competition' || company === 'all' || item.company === company;
    const haystack = `${item.title} ${item.company} ${item.summary}`.toLowerCase();
    return matchesCategory && matchesCompany && haystack.includes(query.trim().toLowerCase());
  }), [unreadStories, category, company, query]);

  const markAsRead = (id) => {
    setReadIds((current) => {
      const next = new Set(current);
      next.add(id);
      localStorage.setItem(READ_NEWS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <div className="content product-page news-page">
      <div className="page-head product-page-head">
        <div>
          <div className="eyebrow">STRATEGY INTELLIGENCE · LAST 3 DAYS</div>
          <h1 className="page-title">Industry & competitor news</h1>
          <div className="page-sub">
            Broker moves, Indian market policy and adjacent fintech developments, grouped for a faster leadership scan.
          </div>
        </div>
      </div>

      <div
        className="panel news-status-panel"
      >
        <div className="news-status-copy"><div className="fetch-status">
          <Circle size={10} fill={STATUS_COLOR[status]} stroke="none" />
          {STATUS_LABEL[status]}
        </div><span>Showing {visibleItems.length} of {unreadStories.length} unread · {allStories.length} distinct stories in the last 3 days</span></div>
        <button className="btn news-reconnect" onClick={reconnect} disabled={status === 'unavailable'}>
          <RefreshCw size={13} />
          Reconnect
        </button>
      </div>

      <section className="news-controls" aria-label="News filters">
        <div className="news-category-tabs" role="group" aria-label="Filter news by topic">
          {CATEGORIES.map((item) => <button
            key={item.id}
            type="button"
            className={`news-category-tab${category === item.id ? ' active' : ''}`}
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
          >{item.label}<span>{categoryCounts[item.id]}</span></button>)}
        </div>
        <div className="news-filter-fields">
          {category === 'competition' && <label className="news-company-filter">Competitor
            <select value={company} onChange={(event) => setCompany(event.target.value)}>
              <option value="all">All competitors</option>
              {companies.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>}
          <label className="news-search"><Search size={15} /><input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stories"
            aria-label="Search news stories"
          /></label>
        </div>
      </section>

      {visibleItems.length === 0 ? (
        <div className="panel news-empty">
          <span className="news-empty-mark"><Circle size={12} /></span>
          <strong>
          {status === 'open' || status === 'static'
            ? unreadStories.length > 0 ? 'No unread stories match these filters.' : 'You’re caught up.'
            : 'News data could not be loaded.'}
          </strong>
          <span>{status === 'open' || status === 'static' ? 'Change the topic or competitor filter to scan other coverage.' : 'Reconnect the feed or start the news service to try again.'}</span>
        </div>
      ) : (
        <div className="news-story-list">
          {visibleItems.map((n) => (
            <article
              key={n.id}
              className="panel news-story"
            >
              <div className="news-story-meta">
                <div className="news-story-labels">
                  <span className={`tag news-category-label ${n.category}`}>{CATEGORY_LABEL[n.category] || 'Industry news'}</span>
                  {n.company && <span className="news-company-label">{n.company}</span>}
                </div>
                <div className="news-story-actions">
                  <span className="mono news-story-date">
                    {new Date(n.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <button className="btn news-read-button" onClick={() => markAsRead(n.id)}>
                    <Check size={13} />
                    Mark read
                  </button>
                </div>
              </div>
              <a className="news-story-title" href={n.sourceUrl} target="_blank" rel="noreferrer">
                {n.title}
              </a>
              {n.coverageCount > 1 && <div className="news-coverage-note">{n.coverageCount} reports on the same development · showing one lead story</div>}
              {n.summary && (
                <div className="news-story-summary">{n.summary.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}</div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
