import { Outlet } from 'react-router';
import Sidebar from '../Pages/Dashboard/Sidebar';
import DashboardHeader from '../Pages/Dashboard/DashboardHeader';

const DashboardLayout = () => {
    return (
        <div className='flex'>
            <Sidebar></Sidebar>
            <div className='flex-1 bg-gray-100 min-h-dvh'>
                <DashboardHeader></DashboardHeader>
                <div>
                    <Outlet></Outlet>
                </div>
            </div>
        </div>
    );
};

export default DashboardLayout;