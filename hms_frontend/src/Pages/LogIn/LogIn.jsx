import React from 'react';
import { useNavigate } from 'react-router';

const LogIn = () => {
    const navigate = useNavigate();
    const handleLogin = (e) => {
        e.preventDefault();
        const form = e.target;
        const email = form.email.value;
        const password = form.password.value;
        const userData = { email, password }
        console.log('Form Submited');
        fetch("http://192.168.0.100:5000/api/v1/superadmin/login",
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify(userData)
            })
            .then(res => res.json())
            .then(result => {
                console.log(result);
                navigate(location.state?.from || '/dashboard');
            }
            
        )
    }
    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Left Side: Branding and Welcome Message */}
            <div className="hidden lg:flex w-1/2 items-center justify-center bg-blue-500 text-white p-12">
                <div className="max-w-md text-center">
                    <svg className="mx-auto h-16 w-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <h1 className="text-4xl font-bold mt-4">Hospital Management System</h1>
                    <p className="mt-4 text-lg">Your trusted partner in healthcare.</p>
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
                    <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">Welcome Back!</h2>
                    <form onSubmit={handleLogin}>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" name="email" htmlFor="email">
                                Email Address
                            </label>
                            <input
                                className="shadow-sm appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" name="email" htmlFor="password">
                                Password
                            </label>
                            <input
                                className="shadow-sm appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                id="password"
                                type="password"
                                placeholder="******************"
                            />
                        </div>
                        <div className="flex items-center justify-between mb-6">
                            <label className="flex items-center text-sm text-gray-600">
                                <input className="form-checkbox h-4 w-4 text-blue-600" type="checkbox" />
                                <span className="ml-2">Remember me</span>
                            </label>
                            <a href="#" className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800">
                                Forgot Password?
                            </a>
                        </div>
                        <div className="flex items-center justify-center">

                            <input
                                className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline"
                                type="submit"
                                value="Log In" />
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LogIn;