import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../Provider/AuthContexProvider';
import { BellIcon, UserCircleIcon } from '@heroicons/react/24/outline';

const DashboardHeader = () => {
    const { user, logout, loading } = useAuth(); // ✅ get user and logout from context

    // ======================= Profile Dropdown =========================
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const trigger = useRef(null);
    const dropdown = useRef(null);

    // close on click outside
    useEffect(() => {
        const clickHandler = ({ target }) => {
            if (!dropdown.current) return;
            if (
                !dropdownOpen ||
                dropdown.current.contains(target) ||
                trigger.current.contains(target)
            )
                return;
            setDropdownOpen(false);
        };
        document.addEventListener('click', clickHandler);
        return () => document.removeEventListener('click', clickHandler);
    });

    // close if the esc key is pressed
    useEffect(() => {
        const keyHandler = ({ keyCode }) => {
            if (!dropdownOpen || keyCode !== 27) return;
            setDropdownOpen(false);
        };
        document.addEventListener('keydown', keyHandler);
        return () => document.removeEventListener('keydown', keyHandler);
    });




    if (loading) return null;
    return (
        <div className="flex justify-between items-center p-6 bg-white border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            <div className="flex items-center space-x-4">
                {user ? <h1>Welcome {user?.email} Your Hospital Name:<b> {user?.hospital_name}</b></h1> : <h1>Please login</h1>}
                <BellIcon className="h-6 w-6 text-gray-500 hover:text-gray-700 cursor-pointer" />
                <UserCircleIcon className="h-8 w-8 text-gray-500 hover:text-gray-700 cursor-pointer" />

                {/* <!-- Profile dropdown --> */}
                <div className="ml-3 relative">
                    <div>
                        <button
                            ref={trigger}
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="max-w-xs bg-gray-800 rounded-full flex items-center text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                            id="user-menu"
                            aria-label="User menu"
                            aria-haspopup="true"
                        >
                            {/* <span className="sr-only">Open user menu</span> */}
                            <img
                                className="h-8 w-8 rounded-full"
                                src="https://via.placeholder.com/150"
                                alt="User profile"
                            />
                        </button>
                    </div>
                    {dropdownOpen && (
                        <div
    ref={dropdown}
    className="origin-top-right absolute right-0 mt-3 w-56 rounded-xl shadow-xl py-2 bg-white border border-gray-100 backdrop-blur-sm bg-white/95 z-50"
    style={{
        boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.1), 0 0 1px 1px rgba(0, 0, 0, 0.02)'
    }}
>
    {/* Header with hospital info */}
    <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Hospital</p>
        <p className="text-sm font-semibold text-gray-900 truncate">
            {user?.hospital_name}
        </p>
        <p className="text-xs text-gray-500 mt-1 truncate">{user?.email}</p>
    </div>

    {/* Menu Items */}
    <div className="py-2">
        <a 
            href="/profile" 
            className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 group"
        >
            <svg className="w-4 h-4 mr-3 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Your Profile
        </a>
        
        <a 
            onClick={logout}
            className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group cursor-pointer"
        >
            <svg className="w-4 h-4 mr-3 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log Out
        </a>
    </div>

    {/* Footer with role info */}
    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Role</span>
            <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                {user?.roles?.[0] || 'User'}
            </span>
        </div>
    </div>
</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardHeader;