import React from 'react';
import { useAuth } from '../../Provider/AuthContexProvider';
import { BellIcon, UserCircleIcon } from '@heroicons/react/24/outline';

const DashboardHeader = () => {
    const { user, logout, loading } = useAuth(); // ✅ get user and logout from context
    if (loading) return null;
    return (
        <div className="flex justify-between items-center p-6 bg-white border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            <div className="flex items-center space-x-4">
                {user ? <h1>Welcome {user?.email} Your Hospital Name:<b> {user?.hospital_name}</b></h1> : <h1>Please login</h1>}
                <button onClick={logout}>Logout</button>
                <BellIcon className="h-6 w-6 text-gray-500 hover:text-gray-700 cursor-pointer" />
                <UserCircleIcon className="h-8 w-8 text-gray-500 hover:text-gray-700 cursor-pointer" />
            </div>
        </div>
    );
};

export default DashboardHeader;