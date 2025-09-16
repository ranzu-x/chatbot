import React from 'react';
import { useAuth } from '../Provider/AuthContexProvider';
import { Navigate } from 'react-router';

const PrivateRoute = ({children}) => {
    const {user, loading} = useAuth();

    console.log("Hello", user, loading);

    if (loading) {
        return <p>Checking authentication...</p>
    }
    if (user){
        return children;
    }
    return <Navigate to = "/login" state = {location.pathname}></Navigate>
};

export default PrivateRoute;