import React from 'react';

const Register = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="relative flex flex-col m-6 space-y-8 bg-white shadow-2xl rounded-2xl md:flex-row md:space-y-0">
        {/* Left Side */}
        <form className="flex flex-col justify-center p-8 md:p-14">
          <span className="mb-3 text-4xl font-bold">Welcome Back!</span>
          <span className="font-light text-gray-400 mb-8">
            Access Your Hospital Portal
          </span>
          <div className="py-2">
            <span className="mb-2 text-md">Email</span>
            <input
              type="text"
              className="w-full p-2 border border-gray-300 rounded-md placeholder:font-light placeholder:text-gray-500"
              name="email"
              id="email"
              placeholder="Email@example.com"
            />
          </div>
          <div className="py-2">
            <span className="mb-2 text-md">Password</span>
            <input
              type="password"
              name="pass"
              id="pass"
              className="w-full p-2 border border-gray-300 rounded-md placeholder:font-light placeholder:text-gray-500"
              placeholder="Password"
            />
          </div>
          {/* <div className="flex justify-between w-full py-4">
                        <div className="mr-24">
                            <input type="checkbox" name="ch" id="ch" className="mr-2" />
                            <span className="text-md">Remember for 30 days</span>
                        </div>
                        <span className="font-bold text-md cursor-pointer">Forgot Password?</span>
                    </div> */}
          <input
            className="w-full my-2 bg-blue-500 text-white p-2 rounded-lg mb-6 hover:bg-white hover:text-black hover:border hover:border-gray-300"
            type="submit"
            value="Log In" />
        </form>
        {/* Right Side */}
        <div className="relative">
          <img
            src="https://images.unsplash.com/photo-1527613426441-4da17471b66d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1170&q=80"
            alt="img"
            className="w-[400px] h-full hidden rounded-r-2xl md:block object-cover"
          />
        </div>
      </div>
    </div>
  );
};

export default Register;