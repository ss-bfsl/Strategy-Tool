import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ActiveClients from './pages/ActiveClients';
import BrokingIndustry from './pages/BrokingIndustry';
import News from './pages/News';
import MutualFunds from './pages/MutualFunds';
import Competition from './pages/Competition';

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-col">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/active-clients" element={<ActiveClients />} />
          <Route path="/broking-industry" element={<BrokingIndustry />} />
          <Route path="/news" element={<News />} />
          <Route path="/mutual-funds" element={<MutualFunds />} />
          <Route path="/competition" element={<Competition />} />
        </Routes>
      </div>
    </div>
  );
}
