import React from 'react';
import NavBar from '../Components/Common/NavBar';
import { Outlet } from 'react-router';

const HomeLayout = () => {
    return (
        <div>
            <NavBar></NavBar>
            <Outlet></Outlet>
        </div>
    );
};

export default HomeLayout;