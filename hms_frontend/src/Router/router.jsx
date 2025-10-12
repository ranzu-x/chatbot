import { createBrowserRouter } from "react-router";
import HomeLayout from "../Layout/HomeLayout";
import Home from "../Pages/Home/Home";
import LogIn from "../Pages/LogIn/LogIn";
import Register from "../Pages/Register/Register";
import AddPatient from "../Pages/AddPatient/AddPatient";
import Dashboard from "../Pages/Dashboard/Dashboard";
import PrivateRoute from "./PrivateRoute";
import PatientsList from "../Pages/PatientsList/PatientsList";
import DashboardLayout from "../Layout/DashboardLayout";
import Prescription from "../Pages/Prescription/Prescription";
import AddUserForm from "../Pages/Add User/AddUser";
import AddPrescription from "../Pages/Prescription/Prescription";
import HospitalStaffs from "../Pages/Hospital Staffs/HospitalStaffs";
import AppointmentForm from "../Pages/Appointment/AppointmentForm";
import BillingForm from "../Pages/Billing/BillingForm";
import AppointmentList from "../Pages/Appointment/AppointmentList";
import BillingList from "../Pages/Billing/BillingList";

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
        path: "/dashboard",
        Component: () => {
          return (
            <PrivateRoute><Dashboard></Dashboard></PrivateRoute>
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
        path: "/addpatient",
        Component: () => {
          return (
            <PrivateRoute><AddPatient></AddPatient></PrivateRoute>
          );
        }
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
            <PrivateRoute><AppointmentList></AppointmentList></PrivateRoute>
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