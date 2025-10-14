import React from 'react';
import NavBar from '../Components/Common/NavBar';
import { Outlet } from 'react-router';
import TestNav from '../Components/Common/TestNav';

const HomeLayout = () => {
    return (
        <div>
            <NavBar></NavBar>
            <Outlet></Outlet>
        </div>
    );
};

export default HomeLayout;