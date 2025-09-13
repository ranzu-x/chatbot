import React, { useState } from 'react';
import { UserIcon, EnvelopeIcon, LockClosedIcon, UsersIcon, BuildingOfficeIcon } from '@heroicons/react/24/solid';

const Register = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    department: '',
  });

  const [errors, setErrors] = useState({});

  const roles = ['Super Admin', 'Admin', 'Manager', 'Other Staff'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const validate = () => {
    let tempErrors = {};
    if (!formData.fullName) tempErrors.fullName = 'Full Name is required.';
    if (!formData.email) {
      tempErrors.email = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      tempErrors.email = 'Email is not valid.';
    }
    if (!formData.password) {
      tempErrors.password = 'Password is required.';
    } else if (formData.password.length < 6) {
      tempErrors.password = 'Password must be at least 6 characters long.';
    }
    if (formData.password !== formData.confirmPassword) {
      tempErrors.confirmPassword = 'Passwords do not match.';
    }
    if (!formData.role) tempErrors.role = 'Please select a role.';
    if ((formData.role === 'Manager' || formData.role === 'Other Staff') && !formData.department) {
      tempErrors.department = 'Department is required for this role.';
    }
    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      console.log('Form submitted successfully:', formData);
      // In a real application, you would send this data to your backend API
      alert('User Registered Successfully!');
      // Reset form fields after successful submission
      setFormData({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: '',
        department: '',
      });
      setErrors({});
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center p-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Create an Account</h1>
          <p className="text-gray-500 mt-2">Join our hospital management system</p>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          {/* Full Name Input */}
          <div className="mb-4 relative">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              className={`pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.fullName ? 'border-red-500' : 'border-gray-300'}`}
              id="fullName"
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="Full Name"
            />
            {errors.fullName && <p className="text-red-500 text-xs italic mt-1">{errors.fullName}</p>}
          </div>

          {/* Email Address Input */}
          <div className="mb-4 relative">
            <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              className={`pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email Address"
            />
            {errors.email && <p className="text-red-500 text-xs italic mt-1">{errors.email}</p>}
          </div>

          {/* Password Input */}
          <div className="mb-4 relative">
            <LockClosedIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              className={`pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Password"
            />
            {errors.password && <p className="text-red-500 text-xs italic mt-1">{errors.password}</p>}
          </div>

          {/* Confirm Password Input */}
          <div className="mb-6 relative">
            <LockClosedIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              className={`pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm Password"
            />
            {errors.confirmPassword && <p className="text-red-500 text-xs italic mt-1">{errors.confirmPassword}</p>}
          </div>

          {/* Role Selection */}
          <div className="mb-4 relative">
            <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              className={`pl-10 pr-4 py-2 w-full border rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.role ? 'border-red-500' : 'border-gray-300'}`}
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
            >
              <option value="" disabled>Select a Role</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {errors.role && <p className="text-red-500 text-xs italic mt-1">{errors.role}</p>}
          </div>

          {/* Department Input (Conditional) */}
          {(formData.role === 'Manager' || formData.role === 'Other Staff') && (
            <div className="mb-6 relative transition-opacity duration-500 ease-in-out">
              <BuildingOfficeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                className={`pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.department ? 'border-red-500' : 'border-gray-300'}`}
                id="department"
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder="Department (e.g., Cardiology)"
              />
              {errors.department && <p className="text-red-500 text-xs italic mt-1">{errors.department}</p>}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-center">
            <button
              className="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transform transition-all duration-300 ease-in-out hover:scale-105"
              type="submit"
            >
              Register Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;