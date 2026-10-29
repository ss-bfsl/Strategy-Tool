import { useMemo, useState } from 'react';
import { useDataset } from '../lib/useDataset';
import FetchBar from '../components/FetchBar';
import StatCard from '../components/StatCard';
import DetailModal from '../components/DetailModal';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

export default function MutualFunds() {
  const { data, ...fetchMeta } = useDataset('mfSif', 'monthly');
  const [selected, setSelected] = useState(null);

  const combinedTrend = useMemo(() => {
    if (Array.isArray(data?.aumTrend)) return data.aumTrend;
    const headline = Array.isArray(data?.headline) ? data.headline : [];
    const total = headline.find((item) => item.label === 'Total AUM');
    const equity = headline.find((item) => item.label === 'Equity AUM');
    if (!Array.isArray(total?.history)) return [];
    return total.history.map((point, index) => ({
      month: point.month,
      totalAum: point.value,
      equityAum: equity?.history?.find((entry) => entry.month === point.month)?.value ?? null,
    }));
  }, [data]);

  const headline = Array.isArray(data?.headline) ? data.headline : [];
  const historyFor = (item) => item.history ?? combinedTrend.map(({ month, totalAum, equityAum }) => ({
    month,
    value: item.label === 'Total AUM' ? totalAum : equityAum,
  }));

  return (
    <div className="content product-page mf-page">
      <div className="page-head product-page-head">
        <div>
          <div className="eyebrow">FUND INDUSTRY · MONTHLY</div>
          <h1 className="page-title">MF &amp; SIF data</h1>
          <div className="page-sub">Track assets, investor participation and monthly flows across mutual funds and Specialized Investment Funds.</div>
        </div>
      </div>

      <FetchBar {...fetchMeta} onRefresh={fetchMeta.refresh} />

      {fetchMeta.loading ? (
        <div className="mf-stat-grid">{Array.from({ length: 6 }, (_, index) => <div key={index} className="panel mf-skeleton" />)}</div>
      ) : (
        <>
          {headline.length > 0 ? <div className="mf-stat-grid">
            {headline.map((item) => (
              <div role="button" tabIndex={0} className="mf-stat-button" key={item.label} onClick={() => setSelected({ ...item, history: historyFor(item) })} onKeyDown={(event) => event.key === 'Enter' && setSelected({ ...item, history: historyFor(item) })} aria-label={`View ${item.label} history`}>
                <StatCard label={item.label} value={item.value} change={item.change} />
              </div>
            ))}
          </div> : <div className="panel news-empty"><strong>No MF or SIF data found</strong><span>Add MF &amp; SIF metrics and month columns to the workbook to populate this view.</span></div>}

          {combinedTrend.length > 0 && <div className="panel mf-trend-panel">
            <div className="dashboard-section-head"><div><div className="eyebrow">ASSETS UNDER MANAGEMENT</div><h2>Total vs equity AUM</h2><p>₹ lakh crore · full available history</p></div><span className="asof-chip">{combinedTrend.at(-1)?.month ?? '—'}</span></div>
            <div className="mf-trend-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={combinedTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#202a3c" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#8993ab', fontSize: 10.5 }} axisLine={{ stroke: '#29334a' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#8993ab', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#171f31', border: '1px solid #29334a', borderRadius: 6, color: '#e6e9f0' }} labelStyle={{ color: '#e6e9f0' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#8993ab' }} />
                  <Line type="monotone" dataKey="totalAum" name="Total AUM" stroke="#e0a94e" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="equityAum" name="Equity AUM" stroke="#4fb0a5" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>}
        </>
      )}

      {selected && <DetailModal title={selected.label} subtitle={`MF & SIF data · ${selected.change >= 0 ? '▲' : '▼'} ${Math.abs(selected.change ?? 0)}% MoM`} history={selected.history} onClose={() => setSelected(null)} />}
    </div>
  );
}
