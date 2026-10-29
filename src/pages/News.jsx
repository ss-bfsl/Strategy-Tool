import { useMemo, useState } from 'react';
import { useNewsApi } from '../lib/useNewsSocket';
import { Check, RefreshCw, Circle } from 'lucide-react';

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

export default function News() {
  const { items, status, reconnect } = useNewsApi();
  const [readIds, setReadIds] = useState(loadReadIds);

  const visibleItems = useMemo(
    () => items
      .filter((item) => !readIds.has(item.id))
      .sort((first, second) => newsTimestamp(second) - newsTimestamp(first)),
    [items, readIds],
  );

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
          <div className="eyebrow">COMPETITOR INTELLIGENCE · LAST 24 HOURS</div>
          <h1 className="page-title">Competitor news</h1>
          <div className="page-sub">
            Recent updates on broker products, performance and strategic moves, filtered by your keyword rules.
          </div>
        </div>
      </div>

      <div
        className="panel news-status-panel"
      >
        <div className="news-status-copy"><div className="fetch-status">
          <Circle size={10} fill={STATUS_COLOR[status]} stroke="none" />
          {STATUS_LABEL[status]}
        </div><span>{visibleItems.length} unread {visibleItems.length === 1 ? 'story' : 'stories'} · previous 24 hours retained when no new story arrives</span></div>
        <button className="btn news-reconnect" onClick={reconnect} disabled={status === 'unavailable'}>
          <RefreshCw size={13} />
          Reconnect
        </button>
      </div>

      {visibleItems.length === 0 ? (
        <div className="panel news-empty">
          <span className="news-empty-mark"><Circle size={12} /></span>
          <strong>
          {status === 'open'
            ? readIds.size > 0 ? 'You’re caught up.' : 'No matching stories in the last 24 hours.'
            : 'News data could not be loaded.'}
          </strong>
          <span>{status === 'open' ? 'New qualifying coverage will appear here as it is collected.' : 'Reconnect the feed or start the news service to try again.'}</span>
        </div>
      ) : (
        <div className="news-story-list">
          {visibleItems.map((n) => (
            <article
              key={n.id}
              className="panel news-story"
            >
              <div className="news-story-meta">
                <span className="tag">{n.company || 'News'}</span>
                <div className="news-story-actions">
                  <span className="mono news-story-date">
                    {new Date(n.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <button className="btn news-read-button" onClick={() => markAsRead(n.id)}>
                    <Check size={13} />
                    Read
                  </button>
                </div>
              </div>
              <a className="news-story-title" href={n.sourceUrl} target="_blank" rel="noreferrer">
                {n.title}
              </a>
              {n.summary && (
                <div
                  className="news-story-summary"
                  dangerouslySetInnerHTML={{ __html: n.summary }}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
