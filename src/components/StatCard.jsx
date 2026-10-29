export default function StatCard({ label, value, change }) {
  const hasChange = typeof change === 'number';
  const positive = hasChange && change >= 0;
  return (
    <div className="panel stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-content">
        <span className="mono stat-card-value">{value}</span>
        {hasChange && (
          <span className={positive ? 'delta-up' : 'delta-down'}>
            {positive ? '▲' : '▼'} {Math.abs(change)}%
          </span>
        )}
      </div>
    </div>
  );
}
