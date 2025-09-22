import { CalendarDaysIcon, ChartBarIcon, RectangleStackIcon, UsersIcon } from '@heroicons/react/24/outline';
import React from 'react';
import { Link } from 'react-router';

const Sidebar = () => {
    return (
        <div>
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white flex flex-col">
                <Link to={"/"} className="p-6 text-2xl font-bold text-indigo-600 border-b">
                    Hospital MS
                </Link>
                <nav className="flex-1 p-4 space-y-2">
                    <Link to={'/dashboard'} className="flex items-center px-4 py-2 text-gray-700 bg-gray-200 rounded-lg">
                        <ChartBarIcon className="h-5 w-5 mr-3" /> Dashboard
                    </Link>
<<<<<<< HEAD
                    <Link to={'/patients'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
=======
                    <Link to={'/patients/list'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
>>>>>>> de4b7231bfa3dfc6f07b980e08379e878a3959d2
                        <UsersIcon className="h-5 w-5 mr-3" /> Patients
                    </Link>
                    <Link to={'/appointments'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <CalendarDaysIcon className="h-5 w-5 mr-3" /> Appointments
                    </Link>
                    <Link to={'/departments'} className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Departments
                    </Link>
                </nav>
            </aside>
        </div>
    );
};

export default Sidebar;