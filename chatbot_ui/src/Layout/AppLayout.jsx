import Sidebar from '../Components/Sidebar';
import TopBar from '../Components/TopBar';
import { useLayout } from '../Provider/LayoutContext';

export default function AppLayout({ children }) {
  const { collapsed, isInbox } = useLayout();

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''} ${isInbox ? 'inbox-mode' : ''}`}>
      <Sidebar />
      <div className="main-content">
        {!isInbox && <TopBar />}
        <div className="page-wrapper" style={{ height: isInbox ? '100vh' : 'auto', overflow: isInbox ? 'hidden' : 'visible' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
