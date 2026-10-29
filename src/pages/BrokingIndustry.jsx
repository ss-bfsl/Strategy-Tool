import { useMemo, useState } from 'react';
import { useDataset } from '../lib/useDataset';
import FetchBar from '../components/FetchBar';
import DetailModal from '../components/DetailModal';
import { Search, Radio, Layers3 } from 'lucide-react';

export default function BrokingIndustry() {
  const { data, ...fetchMeta } = useDataset('industryParams', 'monthly');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

  const categories = useMemo(() => {
    if (!data) return ['All'];
    return ['All', ...new Set(data.map((d) => d.category))];
  }, [data]);

  const filtered = data
    ? data.filter((d) => (activeCategory === 'All' || d.category === activeCategory)
      && `${d.param} ${d.category} ${d.source}`.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const sourceCount = data ? new Set(data.map((item) => item.source).filter(Boolean)).size : '—';

  return (
    <div className="content product-page">
      <div className="page-head product-page-head">
        <div>
          <div className="eyebrow">MARKET INDICATORS · MONTHLY</div>
          <h1 className="page-title">Broking industry data</h1>
          <div className="page-sub">
            Industry benchmarks across flows, demat accounts, turnover and trading activity. Select a measure to view its history.
          </div>
        </div>
      </div>

      <FetchBar {...fetchMeta} onRefresh={fetchMeta.refresh} />

      <div className="page-metrics two-up">
        <div className="page-metric panel"><span><Layers3 size={15} /> Tracked parameters</span><strong>{data?.length ?? '—'}</strong><small>{categories.length - 1} indicator groups</small></div>
        <div className="page-metric panel"><span><Radio size={15} /> Sources tracked</span><strong>{sourceCount}</strong><small>Distinct publishers represented in this view</small></div>
      </div>

      <div className="industry-controls">
        <label className="table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parameters or source" aria-label="Search industry parameters" /></label>
        <div className="category-tabs" aria-label="Filter by category">
        {categories.map((c) => (
          <button
            key={c}
            className={`category-tab${activeCategory === c ? ' active' : ''}`}
            onClick={() => setActiveCategory(c)}
          >
            {c}
          </button>
        ))}
        </div>
      </div>

      <div className="panel data-table-panel">
        <div className="table-toolbar"><div><h2>Industry indicators</h2><span>{filtered.length} results</span></div><span className="asof-chip">{activeCategory}</span></div>
        {fetchMeta.loading ? (
          <div className="table-loading"><div className="skeleton-lines" /></div>
        ) : (
          <div className="responsive-table-scroll"><table className="hairline-table product-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Current</th>
                <th>Previous</th>
                <th>Change</th>
                <th>As of</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.param} onClick={() => setSelected(p)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setSelected(p)}>
                  <td>
                    {p.param}
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.category}</div>
                  </td>
                  <td className="mono">{p.value}</td>
                  <td className="mono" style={{ color: 'var(--text-faint)' }}>{p.prevValue}</td>
                  <td className={p.change >= 0 ? 'delta-up mono' : 'delta-down mono'}>
                    {p.change >= 0 ? '▲' : '▼'} {Math.abs(p.change)}%
                  </td>
                  <td className="mono" style={{ color: 'var(--text-faint)', fontSize: 12 }}>{p.asOf}</td>
                  <td>
                    <a
                      className="source-link"
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.source} ↗
                    </a>
                  </td>
                </tr>
              ))}
              {!fetchMeta.loading && filtered.length === 0 && <tr><td colSpan={6} className="table-empty">No parameters match this search and category.</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      {selected && (
        <DetailModal
          title={selected.param}
          subtitle={`${selected.category} · Source: ${selected.source}`}
          history={selected.history}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
