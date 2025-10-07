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
                <button onClick={logout}>Logout</button>
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
                            <span className="sr-only">Open user menu</span>
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
                            className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 z-10"
                        >
                            <a href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Your Profile</a>
                            <a href="/logout" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Sign out</a>
                        </div>
                    )}
                </div>





            </div>
        </div>
    );
};

export default DashboardHeader;