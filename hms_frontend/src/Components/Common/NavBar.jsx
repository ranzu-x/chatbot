import React, { useState } from 'react';
import { Link } from 'react-router';

const NavBar = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <nav className="bg-gray-800 p-4">
            <div className="max-w-7xl container mx-auto flex justify-between items-center">
                {/* Left Side - Logo */}
                <div className="text-white text-2xl font-bold">
                    <Link to="/">HMS</Link> {/* Replaced <a> with <Link> */}
                </div>

                {/* Center - Menu Items (Hidden on small screens) */}
                <div className="hidden md:flex space-x-8">
                    <Link to="/" className="text-gray-300 hover:text-white transition duration-300">Home</Link>
                    <Link to="/about" className="text-gray-300 hover:text-white transition duration-300">About</Link>
                    <Link to="/contact" className="text-gray-300 hover:text-white transition duration-300">Contact</Link>
                    <Link to="/menu" className="text-gray-300 hover:text-white transition duration-300">Menu</Link>
                </div>

                {/* Right Side - Buttons (Hidden on small screens) */}
                <div className="hidden md:flex space-x-4 items-center">
                    <Link to="/register" className="text-gray-300 hover:text-white transition duration-300">Register</Link>
                    <Link to='/login' className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-300">
                        Login
                    </Link>
                </div>

                {/* Mobile Menu Button */}
                <div className="md:hidden">
                    <button onClick={() => setIsOpen(!isOpen)} className="text-gray-300 hover:text-white focus:outline-none">
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
                <div className="md:hidden bg-gray-700 mt-2 space-y-2 p-4 rounded-md">
                    <Link to="/" className="block text-gray-300 hover:text-white transition duration-300">Home</Link>
                    <Link to="/about" className="block text-gray-300 hover:text-white transition duration-300">About</Link>
                    <Link to="/contact" className="block text-gray-300 hover:text-white transition duration-300">Contact</Link>
                    <Link to="/menu" className="block text-gray-300 hover:text-white transition duration-300">Menu</Link>
                    <Link to="/register" className="block text-gray-300 hover:text-white transition duration-300">Register</Link>
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-300 mt-2">
                        Login
                    </button>
                </div>
            )}
        </nav>
    );
};

export default NavBar;