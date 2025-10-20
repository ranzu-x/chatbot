import { useAuth } from '../Provider/AuthContexProvider';
import { Navigate } from 'react-router';

const PrivateRoute = ({children}) => {
    const {user, loading} = useAuth();

    if (loading) {
        return <p>Checking authentication...</p>
    }
    if (user){
        return children;
    }
    return <Navigate to = "/login" state = {location.pathname}></Navigate>
};

export default PrivateRoute;