import { useMemo, useState } from 'react';
import { useDataset } from '../lib/useDataset';
import FetchBar from '../components/FetchBar';
import DetailModal from '../components/DetailModal';

export default function ActiveClients() {
  const { data, ...fetchMeta } = useDataset('brokerLeaderboard', 'monthly');
  const [sortKey, setSortKey] = useState('rank');
  const [filters, setFilters] = useState({ broker: '', activeClients: '', marketShare: '', change: '' });
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const rows = data
      .filter((broker) => broker.broker.toLowerCase() !== 'others')
      .sort((a, b) => a.rank - b.rank)
      .map((broker, index) => ({ ...broker, rank: index + 1 }));
    const matches = (value, filter) => String(value ?? '').toLowerCase().includes(filter.trim().toLowerCase());
    const visibleRows = rows.filter((broker) =>
      matches(broker.broker, filters.broker) &&
      matches(broker.activeClients?.toLocaleString('en-IN'), filters.activeClients) &&
      matches(Number.isFinite(broker.marketShare) ? `${broker.marketShare}%` : '', filters.marketShare) &&
      matches(Number.isFinite(broker.change) ? `${broker.change}%` : '', filters.change)
    );
    return [...visibleRows].sort((a, b) => {
      if (sortKey === 'rank') return a.rank - b.rank;
      const aValue = Number.isFinite(a[sortKey]) ? a[sortKey] : Number.NEGATIVE_INFINITY;
      const bValue = Number.isFinite(b[sortKey]) ? b[sortKey] : Number.NEGATIVE_INFINITY;
      return bValue - aValue;
    });
  }, [data, sortKey, filters]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

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
                <th onClick={() => setSortKey('activeClients')} style={{ cursor: 'pointer' }}>
                  Active clients ↕
                </th>
                <th onClick={() => setSortKey('marketShare')} style={{ cursor: 'pointer' }}>
                  Market share ↕
                </th>
                <th onClick={() => setSortKey('change')} style={{ cursor: 'pointer' }}>
                  MoM change ↕
                </th>
              </tr>
              <tr>
                <th />
                {[
                  ['broker', 'Filter broker'],
                  ['activeClients', 'Filter clients'],
                  ['marketShare', 'Filter share'],
                  ['change', 'Filter MoM'],
                ].map(([key, placeholder]) => (
                  <th key={key}>
                    <input
                      aria-label={placeholder}
                      value={filters[key]}
                      onChange={(event) => updateFilter(key, event.target.value)}
                      placeholder={placeholder}
                      style={{
                        boxSizing: 'border-box',
                        width: '100%',
                        minWidth: 90,
                        background: 'var(--panel-raised)',
                        border: '1px solid var(--steel)',
                        borderRadius: 3,
                        padding: '6px 8px',
                        color: 'var(--text)',
                        fontSize: 12,
                      }}
                    />
                  </th>
                ))}
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
                <tr><td colSpan={5} style={{ padding: 18, color: 'var(--text-dim)' }}>No brokers match these filters.</td></tr>
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