import { useMemo, useState } from 'react';
import { useDataset } from '../lib/useDataset';
import FetchBar from '../components/FetchBar';
import DetailModal from '../components/DetailModal';
import { Search, Users, TrendingUp, Trophy } from 'lucide-react';

export default function ActiveClients() {
  const { data, ...fetchMeta } = useDataset('brokerLeaderboard', 'monthly');
  const [sortKey, setSortKey] = useState('rank');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const rows = data
      .filter((broker) => broker.broker.toLowerCase() !== 'others')
      .sort((a, b) => a.rank - b.rank)
      .map((broker, index) => ({ ...broker, rank: index + 1 }));
    return rows.filter((broker) => broker.broker.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
      if (sortKey === 'rank') return a.rank - b.rank;
      const aValid = Number.isFinite(a[sortKey]);
      const bValid = Number.isFinite(b[sortKey]);
      if (!aValid || !bValid) return aValid ? -1 : bValid ? 1 : 0;
      return sortDirection === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey];
    });
  }, [data, sortKey, sortDirection, query]);

  const ranked = useMemo(() => (data ?? []).filter((broker) => broker.broker.toLowerCase() !== 'others').sort((a, b) => a.rank - b.rank), [data]);
  const totalClients = ranked.reduce((sum, broker) => sum + Number(broker.activeClients || 0), 0);
  const topThreeShare = ranked.slice(0, 3).reduce((sum, broker) => sum + Number(broker.marketShare || 0), 0);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === 'desc' ? 'asc' : 'desc');
      return;
    }
    setSortKey(key);
    setSortDirection('desc');
  };

  return (
    <div className="content product-page">
      <div className="page-head product-page-head">
        <div>
          <div className="eyebrow">NSE · MEMBER DATA</div>
          <h1 className="page-title">NSE active clients — competition view</h1>
          <div className="page-sub">
            Compare member scale and momentum. Select a broker to inspect its monthly trend.
          </div>
        </div>
        <a className="source-link" href="https://www.nseindia.com/invest/arbitration-status" target="_blank" rel="noreferrer">
          Source: NSE — Active Clients Report ↗
        </a>
      </div>

      <FetchBar {...fetchMeta} onRefresh={fetchMeta.refresh} />

      <div className="page-metrics">
        <div className="page-metric panel"><span><Users size={15} /> Reporting members</span><strong>{ranked.length.toLocaleString('en-IN')}</strong><small>excluding the aggregate Others row</small></div>
        <div className="page-metric panel"><span><TrendingUp size={15} /> Active clients</span><strong>{totalClients.toLocaleString('en-IN')}</strong><small>total across named members</small></div>
        <div className="page-metric panel"><span><Trophy size={15} /> Top 3 share</span><strong>{topThreeShare.toFixed(2)}%</strong><small>of the reported market</small></div>
      </div>

      <div className="panel data-table-panel">
        <div className="table-toolbar"><div><h2>Broker ranking</h2><span>{filtered.length.toLocaleString('en-IN')} members</span></div><label className="table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search brokers" aria-label="Search brokers" /></label></div>
        {fetchMeta.loading ? (
          <div className="table-loading"><div className="skeleton-lines" /></div>
        ) : (
          <div className="responsive-table-scroll"><table className="hairline-table product-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Broker</th>
                <th onClick={() => toggleSort('activeClients')} className="sortable-heading">
                  Active clients {sortKey === 'activeClients' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                </th>
                <th onClick={() => toggleSort('marketShare')} className="sortable-heading">
                  Market share {sortKey === 'marketShare' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                </th>
                <th onClick={() => toggleSort('change')} className="sortable-heading">
                  MoM change {sortKey === 'change' ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.broker} onClick={() => setSelected(b)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setSelected(b)}>
                  <td className="mono" style={{ color: 'var(--text-faint)' }}>{b.rank}</td>
                  <td><span className="broker-name">{b.broker}</span></td>
                  <td className="mono">{b.activeClients.toLocaleString('en-IN')}</td>
                  <td className="mono">{Number.isFinite(b.marketShare) ? `${b.marketShare}%` : '—'}</td>
                  <td className={`${Number.isFinite(b.change) && b.change < 0 ? 'delta-down' : 'delta-up'} mono`}>
                    {Number.isFinite(b.change) ? `${b.change >= 0 ? '▲' : '▼'} ${Math.abs(b.change)}%` : '—'}
                  </td>
                </tr>
              ))}
              {!fetchMeta.loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="table-empty">{query ? `No brokers match “${query}”.` : 'No broker data available.'}</td></tr>
              )}
            </tbody>
          </table></div>
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
