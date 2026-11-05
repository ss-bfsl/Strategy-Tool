import { useEffect, useState } from 'react';

const API_URL = import.meta.env.DEV
  ? 'http://localhost:8765/api/news'
  : `${import.meta.env.BASE_URL}news.json`;
const STATIC_NEWS_URL = `${import.meta.env.BASE_URL}news.json`;

function inferredClusterKey(title, company) {
  const text = String(title || '').toLowerCase();
  const entity = String(company || '').toLowerCase();
  if ((entity.includes('razorpay') || text.includes('razorpay'))
    && /\b(ipo|public issue|listing|draft papers|sebi nod)\b/.test(text)) {
    return 'razorpay:ipo';
  }
  return null;
}

function normalize(raw) {
  // "initial" items look like {source, title, link, published_at, seen_at, eligible}
  // "new_item" items look like {source, title, link, summary}
  const source = raw.source || '';
  const company = raw.company || (source.startsWith('Industry:')
    ? '' : source.replace(/^News:\s*/, '').replace(/\s*Blog$/, ''));
  const category = raw.category || (/bajaj financial securities/i.test(company)
    ? 'bfsl'
    : source.startsWith('Industry: Markets')
      ? 'markets'
      : source.startsWith('Industry:') || /razorpay/i.test(company) ? 'fintech' : 'competition');
  const title = raw.title || '(no title)';
  const clusterKey = raw.cluster_key || inferredClusterKey(title, company);
  return {
    id: clusterKey || raw.link || `${source}:${title}`,
    clusterKey,
    title,
    company,
    category,
    sourceName: source.startsWith('Industry:') ? source.slice('Industry:'.length).trim() : '',
    summary: raw.summary || '',
    date: raw.published_at || raw.seen_at || new Date().toISOString(),
    sourceUrl: raw.link || '#',
  };
}

export function useNewsApi() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('connecting'); // connecting | open | closed
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('connecting');
    fetch(API_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`News API returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setItems((data.items || []).map(normalize));
        setStatus('open');
      })
      .catch(() => fetch(STATIC_NEWS_URL)
        .then((response) => {
          if (!response.ok) throw new Error(`Saved news returned ${response.status}`);
          return response.json();
        })
        .then((data) => {
          if (cancelled) return;
          setItems((data.items || []).map(normalize));
          setStatus('static');
        })
        .catch((error) => {
          if (!cancelled) {
            console.error('News data could not be loaded:', error);
            setStatus('closed');
          }
        }));

    return () => {
      cancelled = true;
    };
  }, [reconnectNonce]);

  const reconnect = () => setReconnectNonce((n) => n + 1);

  return { items, status, reconnect };
}
