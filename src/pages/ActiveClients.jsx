import { useMemo, useState } from 'react';
import { useDataset } from '../lib/useDataset';
import FetchBar from '../components/FetchBar';
import DetailModal from '../components/DetailModal';

export default function ActiveClients() {
  const { data, ...fetchMeta } = useDataset('brokerLeaderboard', 'monthly');
  const [sortKey, setSortKey] = useState('rank');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const rows = data
      .filter((broker) => broker.broker.toLowerCase() !== 'others')
      .sort((a, b) => a.rank - b.rank)
      .map((broker, index) => ({ ...broker, rank: index + 1 }));
    return [...rows].sort((a, b) => {
      if (sortKey === 'rank') return a.rank - b.rank;
      const aValid = Number.isFinite(a[sortKey]);
      const bValid = Number.isFinite(b[sortKey]);
      if (!aValid || !bValid) return aValid ? -1 : bValid ? 1 : 0;
      return sortDirection === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey];
    });
  }, [data, sortKey, sortDirection]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === 'desc' ? 'asc' : 'desc');
      return;
    }
    setSortKey(key);
    setSortDirection('desc');
  };

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">NSE active clients — competition view</h1>
          <div className="page-sub">
            All {data?.length ?? '—'} trading members with active clients, ranked by active client count
            and market share. Click a row for its month-by-month history. Auto-refreshes in the first
            week of every month.
          </div>
        </div>
        <a className="source-link" href="https://www.nseindia.com/invest/arbitration-status" target="_blank" rel="noreferrer">
          Source: NSE — Active Clients Report ↗
        </a>
      </div>

      <FetchBar {...fetchMeta} onRefresh={fetchMeta.refresh} />

      <div className="panel" style={{ maxHeight: 640, overflow: 'auto' }}>
        {fetchMeta.loading ? (
          <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>Loading dataset…</div>
        ) : (
          <table className="hairline-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Broker</th>
                <th onClick={() => toggleSort('activeClients')} style={{ cursor: 'pointer' }}>
                  Active clients {sortKey === 'activeClients' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                </th>
                <th onClick={() => toggleSort('marketShare')} style={{ cursor: 'pointer' }}>
                  Market share {sortKey === 'marketShare' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                </th>
                <th onClick={() => toggleSort('change')} style={{ cursor: 'pointer' }}>
                  MoM change {sortKey === 'change' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.rank} onClick={() => setSelected(b)} style={{ cursor: 'pointer' }}>
                  <td className="mono" style={{ color: 'var(--text-faint)' }}>{b.rank}</td>
                  <td>{b.broker}</td>
                  <td className="mono">{b.activeClients.toLocaleString('en-IN')}</td>
                  <td className="mono">{Number.isFinite(b.marketShare) ? `${b.marketShare}%` : '—'}</td>
                  <td className={`${Number.isFinite(b.change) && b.change < 0 ? 'delta-down' : 'delta-up'} mono`}>
                    {Number.isFinite(b.change) ? `${b.change >= 0 ? '▲' : '▼'} ${Math.abs(b.change)}%` : '—'}
                  </td>
                </tr>
              ))}
              {!fetchMeta.loading && filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 18, color: 'var(--text-dim)' }}>No broker data available.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <DetailModal
          title={selected.broker}
          subtitle={`Rank #${selected.rank} · ${selected.marketShare}% market share`}
          history={selected.history}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}