import { Building2 } from 'lucide-react';
import { useDataset } from '../lib/useDataset';

function asPercent(value) {
  const number = Number(value);
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function formatValue(value, format, decimalPlaces = 1) {
  if (value == null) return '';
  if (typeof value === 'string' && value.trim().toUpperCase() === 'NA') return 'NA';
  if (!Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (format === 'currency') return `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
  if (format === 'percent') return `${asPercent(number).toFixed(decimalPlaces)}%`;
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
                  const numericValue = Number(value);
                  const percent = row.format === 'percent' && Number.isFinite(numericValue) ? Math.max(0, Math.min(asPercent(numericValue), 100)) : 0;
                  return <td key={company} className={variant === 'mix' ? 'mix-value-cell' : 'mono'}>
                    {variant === 'mix' && value != null && <span className="mix-track"><i style={{ width: `${percent}%` }} /></span>}
                    <span>{formatValue(value, row.format, row.decimalPlaces)}</span>
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

export default function Competition() {
  const { data, loading } = useDataset('competition', 'monthly');
  const periods = data?.periods ?? [];
  const period = periods.find((item) => item.id === 'FY26');

  return (
    <div className="content product-page competition-page">
      <div className="page-head product-page-head competition-page-head">
        <div>
          <div className="eyebrow">FY26 · BROKER COMPARISON</div>
          <h1 className="page-title">Competition</h1>
        </div>
      </div>

      {!loading && !period ? (
        <div className="panel news-empty competition-empty"><Building2 size={22} /><strong>FY26 competition data isn’t available</strong><span>Check the FY26 comparison in the Competiton workbook tab and regenerate the data.</span></div>
      ) : period && <>

        <section className="competition-section">
          <div className="competition-section-title"><h2>FY26 financials</h2></div>
          <div className="competition-group-grid">{period.groups.map((group) => <CompanyTable key={group.label} group={group} rows={period.financials ?? []} />)}</div>
        </section>

        <section className="competition-section">
          <div className="competition-section-title"><h2>FY26 revenue mix</h2></div>
          <div className="competition-group-grid">{period.groups.map((group) => <CompanyTable key={group.label} group={group} rows={period.revenueMix ?? []} variant="mix" />)}</div>
        </section>
      </>}
    </div>
  );
}
