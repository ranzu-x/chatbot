import React, { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../Provider/AuthContexProvider';

const NavBar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { user } = useAuth();

    return (
        <nav className="bg-white shadow-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center py-4">
               
                {/* Left Side - Logo */}
                <div className="text-blue-700 text-2xl font-bold">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-xl">H</span>
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">
                            CareSync
                        </span>
                    </Link>
                </div>

                {/* Center - Menu Items (Hidden on small screens) */}
                <div className="hidden md:flex space-x-8">
                    <Link to="/" className="text-gray-600 hover:text-indigo-600 font-medium transition duration-300">Home</Link>
                    <a href="#services" className="text-gray-600 hover:text-indigo-600 font-medium transition duration-300">Services</a>
                    <a href="#about" className="text-gray-600 hover:text-indigo-600 font-medium transition duration-300">About</a>
                </div>

                {/* Right Side - Buttons (Hidden on small screens) */}
                <div className="hidden md:flex space-x-4 items-center">
                    {user ? (
                        <Link to="/dashboard" className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-indigo-700 transition shadow-md shadow-indigo-100">
                            Dashboard
                        </Link>
                    ) : (
                        <>
                            <Link to="/register" className="text-gray-600 hover:text-indigo-600 font-medium transition duration-300">Register</Link>
                            <Link to='/login' className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-indigo-700 transition shadow-md shadow-indigo-100">
                                Login
                            </Link>
                        </>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <div className="md:hidden">
                    <button onClick={() => setIsOpen(!isOpen)} className="text-gray-600 hover:text-indigo-600 font-medium focus:outline-none">
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            {isOpen ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M6 18L18 6M6 6l12 12"
                                ></path>
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M4 6h16M4 12h16M4 18h16"
                                ></path>
                            )}
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Menu (Toggles based on isOpen state) */}
            {isOpen && (
                <div className="md:hidden bg-white mt-2 space-y-3 p-4 rounded-xl shadow-lg border border-slate-50">
                    <Link to="/" className="block text-gray-600 hover:text-indigo-600 font-medium p-2">Home</Link>
                    <a href="#services" className="block text-gray-600 hover:text-indigo-600 font-medium p-2">Services</a>
                    <a href="#about" className="block text-gray-600 hover:text-indigo-600 font-medium p-2">About</a>
                    
                    <div className="pt-2 border-t border-slate-50">
                        {user ? (
                            <Link 
                                to="/dashboard" 
                                className="block w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-indigo-700 transition"
                                onClick={() => setIsOpen(false)}
                            >
                                Dashboard
                            </Link>
                        ) : (
                            <div className="space-y-3">
                                <Link 
                                    to="/register" 
                                    className="block text-gray-600 hover:text-indigo-600 font-medium p-2"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Register
                                </Link>
                                <Link 
                                    to="/login" 
                                    className="block w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg text-center hover:bg-indigo-700 transition"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Login
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
};

export default NavBar;