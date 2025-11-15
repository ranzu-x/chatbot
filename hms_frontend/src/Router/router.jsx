import { createBrowserRouter } from "react-router";
import HomeLayout from "../Layout/HomeLayout";
import Home from "../Pages/Home/Home";
import LogIn from "../Pages/LogIn/LogIn";
import Register from "../Pages/Register/Register";
import Dashboard from "../Pages/Dashboard/Dashboard";
import PrivateRoute from "./PrivateRoute";
import PatientsList from "../Pages/Patients/PaitentsList";
import DashboardLayout from "../Layout/DashboardLayout";
import Prescription from "../Pages/Prescription/Prescription";
import AddUserForm from "../Pages/Add User/AddUser";
import AddPrescription from "../Pages/Prescription/Prescription";
import HospitalStaffs from "../Pages/Hospital Staffs/HospitalStaffs";
import AppointmentForm from "../Pages/Appointment/AppointmentForm";
import BillingForm from "../Pages/Billing/BillingForm";
import AppointmentList from "../Pages/Appointment/AppointmentList";
import BillingList from "../Pages/Billing/BillingList";
import Home2 from "../Components/Common/Home2/Home2";
import RouterGuard from "../Components/Common/RouteGuard";
import Unauthorized from "../Pages/Unauthorized";
import PatientsForm from "../Pages/Patients/PatientsForm";
import ProfilePage from "../Pages/Profile/ProfilePage";
import SlotManager from "../Pages/Appointment/SlotManager";


const router = createBrowserRouter([
  {
    path: "/",
    Component: HomeLayout,
    children: [
      {
        path: "/",
        Component: Home,
      },
      {
        path: "/login",
        Component: LogIn,
      },
      {
        path: "/register",
        Component: Register,
      },

    ]
  },
  // Dashboard layout
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      {
        path: "/unauthorized",
        Component: () => {
          return (
            <Unauthorized></Unauthorized>
          );
        }
      },
      {
        path: "/dashboard",
        Component: () => {
          return (
            <PrivateRoute><Dashboard></Dashboard></PrivateRoute>
          );
        }
      },
      {
        path: "user/profile",
        Component: () => {
          return (
            <PrivateRoute><ProfilePage></ProfilePage></PrivateRoute>
          );
        }
      },
      {
        path: "/patients",
        Component: () => {
          return (
            <PrivateRoute><PatientsList></PatientsList></PrivateRoute>
          );
        }
      },
      {
        path: "/patients/add",
        Component: () => {
          return (
            <PrivateRoute><PatientsForm></PatientsForm></PrivateRoute>
          );
        }
      },

      {
        path: "/patients/edit/:id",
        Component: () => (
          <PrivateRoute>
            <PatientsForm />
          </PrivateRoute>
        )
      },
      {
        path: "/prescription",
        Component: () => {
          return (
            <PrivateRoute><AddPrescription></AddPrescription></PrivateRoute>
          );
        }
      },
      {
        path: "/adduser",
        Component: () => {
          return (
            <PrivateRoute><AddUserForm></AddUserForm></PrivateRoute>
          );
        }
      },
      {
        path: "/users",
        Component: () => {
          return (
            <PrivateRoute><HospitalStaffs></HospitalStaffs></PrivateRoute>
          );
        }
      },
      {
        path: "/appointments",
        Component: () => {
          return (
            <PrivateRoute>
              <RouterGuard
                // Multiple roles - user needs at least one
                requiredRole={["hospital_admin", "receptionist", "doctor"]}
                // Single permission
                requiredPermission={{ resource: 'appointments', action: 'view' }}
                fallbackPath="/unauthorized"
              >
                <AppointmentList></AppointmentList>
              </RouterGuard>
            </PrivateRoute>
          );
        }
      },
      {
        path: "/appointments/new",
        Component: () => {
          return (
            <PrivateRoute><AppointmentForm></AppointmentForm></PrivateRoute>
          );
        }
      },
      {
        path: "/appointments/walk-in",
        Component: () => (
          <PrivateRoute>
            <WalkInAppointment />
          </PrivateRoute>
        )
      },
      {
        path: "/slots/manage",
        Component: () => (
          <PrivateRoute>
            <RouterGuard requiredRole={['hospital_admin', 'doctor']}>
              <SlotManager />
            </RouterGuard>
          </PrivateRoute>
        )
      },
      {
        path: "/billing",
        Component: () => {
          return (
            <PrivateRoute><BillingList></BillingList></PrivateRoute>
          );
        }
      },
      {
        path: "/billing/new",
        Component: () => {
          return (
            <PrivateRoute><BillingForm></BillingForm></PrivateRoute>
          );
        }
      },

    ]

  },
]);

export default router;