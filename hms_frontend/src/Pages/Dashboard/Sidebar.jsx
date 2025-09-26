import { CalendarDaysIcon, ChartBarIcon, RectangleStackIcon, UsersIcon } from '@heroicons/react/24/outline';
import React from 'react';
import { Link, NavLink } from 'react-router';

const Sidebar = () => {

    const navLinkClass = ({ isActive }) =>
        `flex items-center px-4 py-2 hover:bg-gray-100 rounded-lg
     ${isActive ? "text-gray-700 bg-gray-200" : "text-gray-600"}`;
    return (
        <div>
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white flex flex-col">
                <NavLink to={"/"} className="p-6 text-2xl font-bold text-indigo-600 border-b">
                    Hospital MS
                </NavLink>
                <nav className="flex-1 p-4 space-y-2">
                    <NavLink to={'/dashboard'} className={navLinkClass}>
                        <ChartBarIcon className="h-5 w-5 mr-3" /> Dashboard
                    </NavLink>
                    <NavLink to={'/patients'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <UsersIcon className="h-5 w-5 mr-3" /> Patients
                    </NavLink>
                    <NavLink to={'/prescription'} className={navLinkClass}>
                        <UsersIcon className="h-5 w-5 mr-3" /> prescription
                    </NavLink>
                    <Link to={'/appointments'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <CalendarDaysIcon className="h-5 w-5 mr-3" /> Appointments
                    </Link>
                    <Link to={'/departments'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Departments
                    </Link>
                    <Link to={'/users/doctors'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Doctors
                    </Link>
                    <Link to={'/adduser'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Add User
                    </Link>
                </nav>
            </aside>
        </div>
    );
};

export default Sidebar;