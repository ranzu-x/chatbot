import React from 'react';
import { Outlet } from 'react-router';
import Sidebar from '../Pages/Dashboard/Sidebar';
import DashboardHeader from '../Pages/Dashboard/DashboardHeader';

const DashboardLayout = () => {
    return (
        <div className='flex'>
            <Sidebar></Sidebar>
            <div className='flex-1 bg-gray-100'>
                <DashboardHeader></DashboardHeader>
                <Outlet></Outlet>
            </div>
        </div>
    );
};

export default DashboardLayout;