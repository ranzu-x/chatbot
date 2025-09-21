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

      // {
      //   path: "/dashboard",
      //   Component: () => {
      //     return (
      //       <PrivateRoute><Dashboard></Dashboard></PrivateRoute>
      //     );
      //   }
      // },
    ]
  },
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
    ]

  },
]);

export default router;