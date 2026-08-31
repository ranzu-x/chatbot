import { createBrowserRouter } from "react-router";
import HomeLayout from "../Layout/HomeLayout";
import Home from "../Pages/Home/Home";
import LandingPage from "../Pages/Landing/LandingPage";
import PrivacyPolicy from "../Pages/Landing/PrivacyPolicy";
import TermsOfService from "../Pages/Landing/TermsOfService";
import LogIn from "../Pages/LogIn/Login";
import Register from "../Pages/Register/Register";
import Dashboard from "../Pages/Dashboard/Dashboard";
import PrivateRoute from "./PrivateRoute";
import PatientsList from "../Pages/Patients/PaitentsList";
import DashboardLayout from "../Layout/DashboardLayout";
import Prescription from "../Pages/Prescription/Prescription";
import AddUserForm from "../Pages/Add User/AddUser";
import AddPrescription from "../Pages/Prescription/Prescription";
import PrescriptionList from "../Pages/Prescription/PrescriptionList";
import PrescriptionView from "../Pages/Prescription/PrescriptionView";
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
import BillingPrint from "../Pages/Billing/BillingPrint";
import Departments from "../Pages/Departments/Departments";
import HospitalManagement from "../Pages/SuperAdmin/HospitalManagement";
import ServicesList from "../Pages/Services/ServicesList";
import LabDashboard from "../Pages/Lab/LabDashboard";


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
  // Standalone public pages (no layout wrapper)
  {
    path: "/landing",
    Component: LandingPage,
  },
  {
    path: "/privacy-policy",
    Component: PrivacyPolicy,
  },
  {
    path: "/terms-of-service",
    Component: TermsOfService,
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
        Component: () => (
          <PrivateRoute><PrescriptionList /></PrivateRoute>
        )
      },
      {
        path: "/prescription/new",
        Component: () => (
          <PrivateRoute><AddPrescription /></PrivateRoute>
        )
      },
      {
        path: "/prescription/view/:id",
        Component: () => (
          <PrivateRoute><PrescriptionView /></PrivateRoute>
        )
      },
      {
        path: "/prescription/print/:id",
        Component: () => (
          <PrivateRoute><PrescriptionView /></PrivateRoute>
        )
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
        path: "/users/edit/:id",
        Component: () => (
          <PrivateRoute><AddUserForm /></PrivateRoute>
        )
      },
      {
        path: "/users/view/:id",
        Component: () => (
          <PrivateRoute><AddUserForm isReadOnly={true} /></PrivateRoute>
        )
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
        path: "/billing/print/:id",
        Component: () => {
          return (
            <PrivateRoute><BillingPrint></BillingPrint></PrivateRoute>
          );
        }
      },
      {
        path: "/billing/view/:id",
        Component: () => {
          return (
            <PrivateRoute><BillingPrint /></PrivateRoute>
          );
        }
      },
      {
        path: "/billing/edit/:id",
        Component: () => {
          return (
            <PrivateRoute><BillingForm></BillingForm></PrivateRoute>
          );
        }
      },
      {
        path: "/billing/new",
        Component: () => {
          return (
            <PrivateRoute><BillingForm /></PrivateRoute>
          );
        }
      },
      {
        path: "/departments",
        Component: () => {
          return (
            <PrivateRoute><Departments /></PrivateRoute>
          );
        }
      },
      {
        path: "/superadmin/hospitals",
        Component: () => (
          <PrivateRoute>
            <RouterGuard requiredRole={['super_admin']}>
              <HospitalManagement />
            </RouterGuard>
          </PrivateRoute>
        )
      },
      {
        path: "/services",
        Component: () => (
          <PrivateRoute>
            <RouterGuard requiredRole={['hospital_admin']}>
              <ServicesList />
            </RouterGuard>
          </PrivateRoute>
        )
      },
      {
        path: "/lab-dashboard",
        Component: () => (
          <PrivateRoute>
            <RouterGuard requiredRole={['lab technician', 'hospital_admin']}>
              <LabDashboard />
            </RouterGuard>
          </PrivateRoute>
        )
      },

    ]

  },
]);

export default router;