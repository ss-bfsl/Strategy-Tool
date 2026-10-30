import { useMemo, useState } from 'react';
import { useDataset } from '../lib/useDataset';
import FetchBar from '../components/FetchBar';
import SectionPreviewCard from '../components/SectionPreviewCard';
import DetailModal from '../components/DetailModal';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { Sparkles } from 'lucide-react';

const shortName = (name = '') => {
  const aliases = [
    [/groww/i, 'Groww'], [/zerodha/i, 'Zerodha'], [/angel one/i, 'Angel One'],
    [/icici/i, 'ICICI Sec.'], [/upstox/i, 'Upstox'], [/kotak/i, 'Kotak Sec.'],
    [/hdfc/i, 'HDFC Sec.'], [/raise securities|dhan/i, 'Dhan'], [/sbicap/i, 'SBI Cap.'],
    [/motilal/i, 'Motilal Oswal'], [/paytm/i, 'Paytm Money'],
  ];
  return aliases.find(([pattern]) => pattern.test(name))?.[1] ?? name.replace(/(Private Limited|Limited|Ltd\.?)/ig, '').trim();
};

const inr = (value) => Number(value || 0).toLocaleString('en-IN');

function Stat({ label, value, note, tone = '' }) {
  return <div className="dashboard-stat panel"><span className="dashboard-stat-label">{label}</span><strong className={tone}>{value}</strong><span className="dashboard-stat-note">{note}</span></div>;
}

export default function Dashboard() {
  const brokers = useDataset('brokerLeaderboard', 'monthly');
  const industry = useDataset('industryParams', 'monthly');
  const news = useDataset('news', 'hourly');
  const mf = useDataset('mfSif', 'monthly');
  const [selected, setSelected] = useState(null);

  const brokerSummary = useMemo(() => {
    const all = (brokers.data ?? []).filter((b) => b.broker?.toLowerCase() !== 'total');
    const named = all.filter((b) => b.broker?.toLowerCase() !== 'others').sort((a, b) => b.activeClients - a.activeClients);
    const leaders = named.slice(0, 9);
    const rest = all.filter((b) => !leaders.includes(b));
    const monthNames = [...new Set(rest.flatMap((b) => (b.history ?? []).map((p) => p.month)))];
    const remainingHistory = monthNames.map((month) => ({
      month,
      value: rest.reduce((sum, b) => sum + ((b.history ?? []).find((p) => p.month === month)?.value ?? 0), 0),
    }));
    const remainingValue = rest.reduce((sum, b) => sum + Number(b.activeClients || 0), 0);
    const total = all.reduce((sum, b) => sum + Number(b.activeClients || 0), 0);
    const remaining = {
      rank: 10,
      broker: 'Others (Remaining)',
      activeClients: remainingValue,
      marketShare: total ? Number((remainingValue / total * 100).toFixed(2)) : 0,
      change: remainingHistory.length > 1 && remainingHistory.at(-2).value
        ? Number(((remainingHistory.at(-1).value - remainingHistory.at(-2).value) / remainingHistory.at(-2).value * 100).toFixed(2)) : 0,
      history: remainingHistory,
    };
    const leadersWithShare = leaders.map((broker, index) => ({ ...broker, rank: index + 1 }));
    const latestMonth = all.flatMap((b) => b.history ?? []).map((p) => p.month).at(-1) ?? null;
    const gainers = [...named.slice(0, 50)].sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
    const topThreeShare = leadersWithShare.slice(0, 3).reduce((sum, b) => sum + Number(b.marketShare || 0), 0);
    const threeMonthMomentum = named.slice(0, 50)
      .map((broker) => {
        const points = broker.history ?? [];
        if (points.length < 4) return null;
        const start = points.at(-4);
        const end = points.at(-1);
        if (!start.value || !end.value) return null;
        return { broker, start, end, change: (end.value - start.value) / start.value * 100 };
      })
      .filter(Boolean)
      .sort((a, b) => b.change - a.change)[0] ?? null;
    return { rows: [...leadersWithShare, remaining], total, topThreeShare, gainer: gainers[0], loser: gainers.at(-1), latestMonth, threeMonthMomentum };
  }, [brokers.data]);

  const demat = useMemo(() => {
    const rows = (industry.data ?? []).filter((p) => /demat account/i.test(p.param) && /\b(NSDL|CDSL)\b/i.test(p.param));
    if (!rows.length) return null;
    const values = rows.map((row) => Number(String(row.value).replace(/[^\d.]/g, ''))).filter(Number.isFinite);
    const unit = rows[0].value.match(/(Cr|Lakh Cr)/)?.[1] ?? '';
    return values.length ? `${values.reduce((a, b) => a + b, 0).toFixed(2)} ${unit}` : null;
  }, [industry.data]);

  const latestMonth = brokerSummary.latestMonth;
  const dashboardRows = brokerSummary.rows;

  return (
    <div className="content dashboard-content">
      <div className="page-head dashboard-head">
        <div>
          <div className="eyebrow">BROKING INDUSTRY · INDIA</div>
          <h1 className="page-title dashboard-title">Market pulse<span>.</span></h1>
          <div className="page-sub">A clear view of broker momentum, industry benchmarks and competitor moves.</div>
        </div>
        <div className="data-as-of"><span className="data-dot" /> Data as of <strong>{latestMonth ?? '—'}</strong></div>
      </div>

      <FetchBar {...brokers} onRefresh={brokers.refresh} />

      <section className="dashboard-stats" aria-label="Market summary">
        <Stat label="ACTIVE CLIENTS" value={inr(brokerSummary.total)} note="Across reporting members" />
        <Stat label="TOP 3 SHARE" value={`${brokerSummary.topThreeShare.toFixed(2)}%`} note="Of reported active clients" />
        <Stat label="BIGGEST GAINER · MOM" value={brokerSummary.gainer ? shortName(brokerSummary.gainer.broker) : '—'} note={brokerSummary.gainer ? `▲ ${Math.abs(brokerSummary.gainer.change ?? 0)}% month on month` : 'No comparison available'} tone="delta-up" />
        <Stat label="BIGGEST LOSER · MOM" value={brokerSummary.loser ? shortName(brokerSummary.loser.broker) : '—'} note={brokerSummary.loser ? `▼ ${Math.abs(brokerSummary.loser.change ?? 0)}% month on month` : 'No comparison available'} tone="delta-down" />
        <Stat label="DEMAT ACCOUNTS" value={demat ?? '—'} note="NSDL + CDSL" />
      </section>

      {brokerSummary.threeMonthMomentum && <section className="dashboard-insight panel" aria-label="Three month momentum insight">
        <div className="insight-icon"><Sparkles size={18} /></div>
        <div className="insight-copy">
          <span className="insight-kicker">THE 3-MONTH SIGNAL <i /></span>
          <h2>{shortName(brokerSummary.threeMonthMomentum.broker.broker)} has the strongest client momentum</h2>
          <p>Its active base {brokerSummary.threeMonthMomentum.change >= 0 ? 'grew' : 'declined'} <strong>{Math.abs(brokerSummary.threeMonthMomentum.change).toFixed(1)}%</strong> between {brokerSummary.threeMonthMomentum.start.month} and {brokerSummary.threeMonthMomentum.end.month}, {brokerSummary.threeMonthMomentum.change >= 0 ? 'adding' : 'losing'} <strong>{inr(Math.abs(brokerSummary.threeMonthMomentum.end.value - brokerSummary.threeMonthMomentum.start.value))}</strong> clients. Strongest three-month move among the top 50.</p>
        </div>
        <div className={`insight-value${brokerSummary.threeMonthMomentum.change < 0 ? ' negative' : ''}`}><strong>{brokerSummary.threeMonthMomentum.change >= 0 ? '+' : '−'}{Math.abs(brokerSummary.threeMonthMomentum.change).toFixed(1)}%</strong><span>3M MOVE</span></div>
      </section>}

      <section className="panel dashboard-chart-panel">
        <div className="dashboard-section-head">
          <div><div className="eyebrow">MARKET SHARE · LEADERBOARD</div><h2>Top brokers</h2><p>Top 9 brokers shown individually; all remaining members are grouped below.</p></div>
          <span className="asof-chip">{latestMonth ?? 'No month data'}</span>
        </div>
        {brokers.loading ? <div className="skeleton-chart" aria-label="Loading broker chart" /> : dashboardRows.length ? (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardRows} layout="vertical" margin={{ top: 4, right: 42, left: 2, bottom: 0 }} barCategoryGap={7}>
                <CartesianGrid stroke="#202a3c" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8993ab', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 'dataMax + 3']} />
                <YAxis type="category" dataKey="broker" width={128} tick={{ fill: '#c3cada', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={shortName} />
                <Tooltip cursor={{ fill: '#1b2435' }} contentStyle={{ background: '#171f31', border: '1px solid #29334a', borderRadius: 6, color: '#e6e9f0' }} formatter={(value, _name, item) => [`${value}% · ${inr(item.payload.activeClients)} clients`, 'Market share']} labelFormatter={(label) => dashboardRows.find((row) => row.broker === label)?.broker ?? label} />
                <Bar dataKey="marketShare" name="Market share" fill="#d5a451" radius={[0, 4, 4, 0]} barSize={17} onClick={(item) => setSelected(item?.payload ?? item)} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="dashboard-empty">No broker data is available. Upload an industry workbook to get started.</div>}
      </section>

      <section className="dashboard-lower-grid">
        <div className="panel dashboard-share-panel">
          <div className="dashboard-section-head compact"><div><div className="eyebrow">MARKET STRUCTURE</div><h2>Share of active clients</h2></div></div>
          <div className="share-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboardRows} dataKey="marketShare" nameKey="broker" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none" onClick={(item) => setSelected(item?.payload ?? item)} cursor="pointer">
                  {dashboardRows.map((row, index) => <Cell key={row.broker} fill={index === 9 ? '#59647a' : index === 0 ? '#e0a94e' : `hsl(${38 + index * 8} 42% ${57 - index * 1.4}%)`} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#171f31', border: '1px solid #29334a', borderRadius: 6, color: '#e6e9f0' }} formatter={(v) => [`${v}%`, 'Market share']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="share-chart-center"><strong>{brokerSummary.topThreeShare.toFixed(1)}%</strong><span>TOP 3 SHARE</span></div>
          </div>
          <div className="share-legend">{dashboardRows.slice(0, 5).map((row) => <div key={row.broker}><i />{shortName(row.broker)} <b>{row.marketShare}%</b></div>)}</div>
        </div>
        <div className="panel dashboard-rank-panel">
          <div className="dashboard-section-head compact"><div><div className="eyebrow">RANKED LEADERS</div><h2>Broker leaderboard</h2></div><span className="asof-chip">{latestMonth ?? 'No month data'}</span></div>
          <div className="dashboard-table-scroll"><table className="hairline-table dashboard-rank-table"><thead><tr><th>#</th><th>Broker</th><th>Active clients</th><th>Share</th><th>MoM</th></tr></thead><tbody>{dashboardRows.map((row) => <tr key={row.rank} onClick={() => setSelected(row)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setSelected(row)}><td className="mono">{row.rank}</td><td title={row.broker}>{shortName(row.broker)}</td><td className="mono">{inr(row.activeClients)}</td><td className="mono">{row.marketShare}%</td><td className={`${row.change >= 0 ? 'delta-up' : 'delta-down'} mono`}>{row.change >= 0 ? '▲' : '▼'} {Math.abs(row.change)}%</td></tr>)}</tbody></table></div>
        </div>
      </section>

      <div className="dashboard-previews">
        <SectionPreviewCard title="Broking industry data" to="/broking-industry" footnote={`${industry.data?.length ?? '—'} tracked parameters`}>
          {industry.loading ? <div className="skeleton-lines" /> : <div className="preview-list">{industry.data?.slice(0, 4).map((p) => <div key={p.param}><span>{p.param}</span><b className="mono">{p.value}</b></div>)}</div>}
        </SectionPreviewCard>
        <SectionPreviewCard title="NSE active clients" to="/active-clients" footnote="Full broker-wise breakdown">
          {brokers.loading ? <div className="skeleton-lines" /> : <div className="preview-list">{dashboardRows.slice(0, 4).map((b) => <div key={b.rank}><span>{shortName(b.broker)}</span><b className="mono">{b.marketShare}%</b></div>)}</div>}
        </SectionPreviewCard>
        <SectionPreviewCard title="Competitor news" to="/news" footnote="Latest relevant coverage">
          {news.loading ? <div className="skeleton-lines" /> : <div className="preview-news">{news.data?.slice(0, 3).map((n) => <div key={n.id}><span className="tag">{n.tag}</span>{n.title}</div>)}</div>}
        </SectionPreviewCard>
        <SectionPreviewCard title="MF & SIF data" to="/mutual-funds" footnote="Industry AUM & category flows">
          {mf.loading ? <div className="skeleton-lines" /> : <div className="preview-list">{(Array.isArray(mf.data?.headline) ? mf.data.headline : []).slice(0, 4).map((h) => <div key={h.label}><span>{h.label}</span><b className="mono">{h.value}</b></div>)}</div>}
        </SectionPreviewCard>
      </div>

      {selected && <DetailModal title={selected.broker} subtitle={`${selected.marketShare}% market share · ${inr(selected.activeClients)} active clients`} history={selected.history} onClose={() => setSelected(null)} />}
    </div>
  );
}
