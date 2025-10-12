import React from 'react';
import {
  UsersIcon,
  UserPlusIcon,
  CalendarDaysIcon,
  DocumentPlusIcon,
  RectangleStackIcon,
  ChartBarIcon,
  BellIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router';
import { useAuth } from '../../Provider/AuthContexProvider';




// --- Reusable Sub-Components ---

// Header Component

// Stat Card Component
const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white p-6 rounded-lg shadow-md flex items-center">
    <div className={`p-3 rounded-full ${color}`}>
      {icon}
    </div>
    <div className="ml-4">
      <p className="text-gray-500 text-sm font-medium">{title}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  </div>
);

// Quick Action Button Component
const QuickActionButton = ({ to, text, icon }) => (
  <Link
    to={to}
    className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-md hover:bg-gray-50 transition" >
    {icon}
    <span className="mt-2 text-sm font-medium text-gray-700">{text}</span>

  </Link>
);

// Table Row Component for Upcoming Appointments
const AppointmentRow = ({ patientName, doctor, time, status }) => {
  const statusColor = status === 'Confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
  return (
    <tr className="hover:bg-gray-50">
      <td className="p-3 text-sm text-gray-700">{patientName}</td>
      <td className="p-3 text-sm text-gray-500">{doctor}</td>
      <td className="p-3 text-sm text-gray-500">{time}</td>
      <td className="p-3">
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColor}`}>{status}</span>
      </td>
    </tr>
  );
};

// --- Main Dashboard Component ---

const Dashboard = () => {
  return (
    <div className="h-screen bg-gray-50">
      {/* Sidebar Navigation */}
      {/* move to sidebar.jsx */}

      {/* Main Content */}
      <main className="flex flex-col overflow-hidden">
        {/* <Header /> */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Patients"
              value="1,250"
              icon={<UsersIcon className="h-6 w-6 text-blue-500" />}
              color="bg-blue-100"
            />
            <StatCard
              title="Doctors on Duty"
              value="34"
              icon={<UserPlusIcon className="h-6 w-6 text-green-500" />}
              color="bg-green-100"
            />
            <StatCard
              title="Today's Appointments"
              value="12"
              icon={<CalendarDaysIcon className="h-6 w-6 text-indigo-500" />}
              color="bg-indigo-100"
            />
            <StatCard
              title="Open Beds"
              value="78"
              icon={<RectangleStackIcon className="h-6 w-6 text-yellow-500" />}
              color="bg-yellow-100"
            />
          </div>

          {/* Quick Actions */}
          {/* <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <QuickActionButton
                to="/addpatient"
                text="Add New Patient"
                icon={<UserPlusIcon className="h-8 w-8 text-indigo-500" />}
              />
              <QuickActionButton
                text="Schedule Appointment"
                icon={<CalendarDaysIcon className="h-8 w-8 text-green-500" />}
              />
              <QuickActionButton
                text="Create New Record"
                icon={<DocumentPlusIcon className="h-8 w-8 text-blue-500" />}
              />
              <QuickActionButton
                text="View Reports"
                icon={<ChartBarIcon className="h-8 w-8 text-red-500" />}
              />
            </div>
          </div> */}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <QuickActionButton
              to='/addpatient'
              text="Add New Patient"
              icon={<UserPlusIcon className="h-8 w-8 text-indigo-500" />}
            />
            <QuickActionButton
              to="/appointments"
              text="Schedule Appointment"
              icon={<CalendarDaysIcon className="h-8 w-8 text-green-500" />}
            />
            <QuickActionButton
              to="/records"
              text="Create New Record"
              icon={<DocumentPlusIcon className="h-8 w-8 text-blue-500" />}
            />
            <QuickActionButton
              to="/reports"
              text="View Reports"
              icon={<ChartBarIcon className="h-8 w-8 text-red-500" />}
            />
          </div>


          {/* Upcoming Appointments Table */}
          <div className='mt-10'>
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Upcoming Appointments</h2>
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Patient Name</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Assigned Doctor</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Time</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <AppointmentRow patientName="John Doe" doctor="Dr. Smith" time="10:30 AM" status="Confirmed" />
                  <AppointmentRow patientName="Jane Smith" doctor="Dr. Adams" time="11:00 AM" status="Pending" />
                  <AppointmentRow patientName="Michael Johnson" doctor="Dr. White" time="11:30 AM" status="Confirmed" />
                  <AppointmentRow patientName="Emily Brown" doctor="Dr. Carter" time="12:00 PM" status="Confirmed" />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;