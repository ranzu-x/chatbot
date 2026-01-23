import { useAuth } from '../Provider/AuthContexProvider';
import { Navigate } from 'react-router';

const PrivateRoute = ({children}) => {
    const {user, loading} = useAuth();

    if (loading) {
        return (
        <div className='flex items-center justify-center h-[calc(100vh-64px)]'>
                        <div className='text-center'>
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            <p className='mt-4 text-gray-600 font-medium'>Loading...</p>
                        </div>
                    </div>)
    }
    if (user){
        return children;
    }
    return <Navigate to = "/login" state = {location.pathname}></Navigate>
};

export default PrivateRoute;