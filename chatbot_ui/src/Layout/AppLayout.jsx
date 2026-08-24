import Sidebar from '../Components/Sidebar';
import TopBar from '../Components/TopBar';

export default function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
