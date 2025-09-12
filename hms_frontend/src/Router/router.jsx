import { createBrowserRouter } from "react-router";
<<<<<<< HEAD
=======
import HomeLayout from "../Layout/HomeLayout";
>>>>>>> 981aff40e508eaf7b7f7d62501fc600894f06dee
import Home from "../Pages/Home/Home";
import LogIn from "../Pages/LogIn/LogIn";
import Register from "../Pages/Register/Register";
import HomeLayout from "../Layout/HomeLayout";

const router = createBrowserRouter([
  {
    path: "/",
<<<<<<< HEAD
    element: <HomeLayout />,
=======
    Component: HomeLayout,
>>>>>>> 981aff40e508eaf7b7f7d62501fc600894f06dee
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
]);

export default router;