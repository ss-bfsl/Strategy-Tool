import { useMemo, useState } from 'react';
import { ArrowUpRight, Building2, Landmark, Percent, Wallet } from 'lucide-react';
import { useDataset } from '../lib/useDataset';
import FetchBar from '../components/FetchBar';

function asPercent(value) {
  const number = Number(value);
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function formatValue(value, format) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (format === 'currency') return `₹${number.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
  if (format === 'percent') return `${asPercent(number).toFixed(1)}%`;
  return number.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function CompanyTable({ group, rows, variant = 'financial' }) {
  const metrics = rows.filter((row) => group.companies.some((company) => row.values?.[company] != null));
  return (
    <section className="panel competition-group-card">
      <div className="competition-group-head"><span>{group.label}</span><b>{group.companies.length} firms</b></div>
      <div className="competition-table-wrap">
        <table className="competition-table">
          <thead><tr><th>{variant === 'financial' ? 'Metric' : 'Revenue stream'}</th>{group.companies.map((company) => <th key={company}>{company}</th>)}</tr></thead>
          <tbody>
            {metrics.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {group.companies.map((company) => {
                  const value = row.values?.[company];
                  const percent = row.format === 'percent' && value != null ? Math.max(0, Math.min(asPercent(value), 100)) : 0;
                  return <td key={company} className={variant === 'mix' ? 'mix-value-cell' : 'mono'}>
                    {variant === 'mix' && value != null && <span className="mix-track"><i style={{ width: `${percent}%` }} /></span>}
                    <span>{formatValue(value, row.format)}</span>
                  </td>;
                })}
              </tr>
            ))}
            {!metrics.length && <tr><td colSpan={group.companies.length + 1} className="competition-empty-cell">No comparison data for this group yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function findMetric(period, key) {
  return period?.financials?.find((metric) => metric.label.toLowerCase() === key.toLowerCase());
}

function InsightCard({ icon: Icon, label, value, note, tone = '' }) {
  return <div className="competition-kpi panel"><div className="competition-kpi-label"><Icon size={14} />{label}</div><strong className={tone}>{value}</strong><span>{note}</span></div>;
}

export default function Competition() {
  const { data, ...fetchMeta } = useDataset('competition', 'monthly');
  const periods = data?.periods ?? [];
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const period = periods.find((item) => item.id === selectedPeriod) ?? periods[0];

  const insights = useMemo(() => {
    if (!period) return null;
    const revenue = findMetric(period, 'Total Revenue')?.values ?? {};
    const pat = findMetric(period, 'PAT')?.values ?? {};
    const roe = findMetric(period, 'ROE')?.values ?? {};
    const mtf = findMetric(period, 'MTF book')?.values ?? {};
    const companies = period.groups.flatMap((group) => group.companies);
    const leader = (values) => companies
      .map((company) => ({ company, value: Number(values[company]) }))
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => b.value - a.value)[0];
    const marginLeader = companies
      .map((company) => ({ company, value: Number(revenue[company]) ? Number(pat[company]) / Number(revenue[company]) : null }))
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => b.value - a.value)[0];
    return { revenue: leader(revenue), roe: leader(roe), mtf: leader(mtf), marginLeader };
  }, [period]);

  return (
    <div className="content product-page competition-page">
      <div className="page-head product-page-head competition-page-head">
        <div>
          <div className="eyebrow">BROKER COMPARISON · FINANCIALS</div>
          <h1 className="page-title">Competition</h1>
          <div className="page-sub">A side-by-side look at broker scale, returns and where revenue comes from.</div>
        </div>
        <div className="period-control"><span>REPORTING PERIOD</span><div className="period-toggle" role="group" aria-label="Select reporting period">
          {periods.map((item) => <button key={item.id} className={period?.id === item.id ? 'active' : ''} onClick={() => setSelectedPeriod(item.id)} aria-pressed={period?.id === item.id}>{item.label}</button>)}
          {!periods.length && <span className="period-empty">No periods</span>}
        </div></div>
      </div>

      <FetchBar {...fetchMeta} onRefresh={fetchMeta.refresh} />

      {!fetchMeta.loading && !period ? (
        <div className="panel news-empty competition-empty"><Building2 size={22} /><strong>Competition data isn’t available</strong><span>Add a Competition worksheet with a fiscal period label such as FY26, then regenerate the workbook data.</span></div>
      ) : period && <>
        <div className="competition-period-note"><span className="period-live-dot" /> Showing {period.label} comparison <span>·</span> values in ₹ crore unless marked %</div>

        {insights && <section className="competition-kpis">
          <InsightCard icon={Landmark} label="REVENUE LEADER" value={insights.revenue?.company ?? '—'} note={formatValue(insights.revenue?.value, 'currency') + ' total revenue'} />
          <InsightCard icon={Percent} label="TOP PAT MARGIN" value={insights.marginLeader ? `${(insights.marginLeader.value * 100).toFixed(1)}%` : '—'} note={insights.marginLeader?.company ?? 'Not available'} tone="mint" />
          <InsightCard icon={ArrowUpRight} label="TOP ROE" value={insights.roe?.company ?? '—'} note={formatValue(insights.roe?.value, 'percent') + ' return on equity'} tone="violet" />
          <InsightCard icon={Wallet} label="LARGEST MTF BOOK" value={insights.mtf?.company ?? '—'} note={formatValue(insights.mtf?.value, 'currency') + ' MTF book'} />
        </section>}

        <section className="competition-section">
          <div className="competition-section-title"><div><div className="eyebrow">SCALE &amp; RETURNS</div><h2>Financials and key ratios</h2></div><span>{period.groups.reduce((sum, group) => sum + group.companies.length, 0)} brokers</span></div>
          <div className="competition-group-grid">{period.groups.map((group) => <CompanyTable key={group.label} group={group} rows={period.financials ?? []} />)}</div>
        </section>

        <section className="competition-section">
          <div className="competition-section-title"><div><div className="eyebrow">REVENUE ENGINE</div><h2>Revenue mix</h2></div><span>Share of company revenue</span></div>
          <div className="competition-group-grid">{period.groups.map((group) => <CompanyTable key={group.label} group={group} rows={period.revenueMix ?? []} variant="mix" />)}</div>
        </section>
      </>}
    </div>
  );
}
