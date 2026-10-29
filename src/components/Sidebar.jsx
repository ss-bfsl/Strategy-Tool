import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Users, Newspaper, PiggyBank, GitCompareArrows } from 'lucide-react';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/active-clients', label: 'NSE Active Clients', icon: Users },
  { to: '/broking-industry', label: 'Broking Industry Data', icon: BarChart3 },
  { to: '/competition', label: 'Competition', icon: GitCompareArrows },
  { to: '/news', label: 'Competitor News', icon: Newspaper },
  { to: '/mutual-funds', label: 'MF & SIF Data', icon: PiggyBank },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        background: 'var(--panel)',
        borderRight: '1px solid var(--steel-soft)',
        padding: '22px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ padding: '4px 10px 26px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
          Benchmark<span style={{ color: 'var(--amber)' }}>.</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
          Broking competitor tracker
        </div>
      </div>

      {LINKS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 12px',
            borderRadius: 3,
            fontSize: 13.5,
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--text)' : 'var(--text-dim)',
            background: isActive ? 'var(--panel-raised)' : 'transparent',
            borderLeft: isActive ? '2px solid var(--amber)' : '2px solid transparent',
            textDecoration: 'none',
          })}
        >
          <Icon size={16} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}

      <div style={{ marginTop: 'auto', padding: '14px 12px 4px', fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Data refreshes automatically in the first week of each month. Use
        "Refresh now" on any page to pull the latest ahead of schedule.
      </div>
    </aside>
  );
}
