import React, { useState } from 'react';
import { User, Mail, Lock, Users, Building, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../Provider/AuthContexProvider';




const Register = () => {
  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };


  // Signup form validation

  const validate = () => {
    let tempErrors = {};
    if (!formData.firstname) tempErrors.firstname = 'First Name is required.';
    if (!formData.lastname) tempErrors.lastname = 'Last Name is required.';
    if (!formData.email) {
      tempErrors.email = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      tempErrors.email = 'Email is not valid.';
    }
    if (!formData.password) {
      tempErrors.password = 'Password is required.';
    } else if (formData.password.length < 8) {
      tempErrors.password = 'Password must be at least 8 characters long.';
    } else if (!/(?=.*[A-Z])/.test(formData.password)) {
      tempErrors.password = 'Password must contain at least one uppercase letter.';
    } else if (!/(?=.*[a-z])/.test(formData.password)) {
      tempErrors.password = 'Password must contain at least one lowercase letter.';
    } else if (!/(?=.*\d)/.test(formData.password)) {
      tempErrors.password = 'Password must contain at least one number.';
    } else if (!/(?=.*[!@#$%^&*])/.test(formData.password)) {
      tempErrors.password = 'Password must contain at least one special character (!@#$%^&*).';
    }
    if (formData.password !== formData.confirmPassword) {
      tempErrors.confirmPassword = 'Passwords do not match.';
    }
    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  // Signup form submit fundtion
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch("http://localhost:5000/api/v1/hospital-admin/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ crucial
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        alert("User Registered Successfully!");
        console.log("Form submitted successfully:", data);

        // ✅ Save logged-in user
        setUser(data.user);

        // ✅ Go to dashboard
        navigate("/dashboard");

        // ✅ Reset form
        setFormData({
          firstname: "",
          lastname: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
        setErrors({});
      } else {
        alert(data.message || "Registration failed");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Something went wrong, please try again later.");
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center p-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Create an Account</h1>
          <p className="text-gray-500 mt-2">Join our hospital management system</p>
        </div>
        <div>
          {/* First Name Input */}
          <div className="mb-4 relative">
            <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              className={`pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.firstname ? 'border-red-500' : 'border-gray-300'}`}
              id="firstname"
              type="text"
              name="firstname"
              value={formData.firstname}
              onChange={handleChange}
              placeholder="First Name"
            />
            {errors.firstname && <p className="text-red-500 text-xs italic mt-1">{errors.firstname}</p>}
          </div>

          {/* Last Name Input */}
          <div className="mb-4 relative">
            <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              className={`pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.lastname ? 'border-red-500' : 'border-gray-300'}`}
              id="lastname"
              type="text"
              name="lastname"
              value={formData.lastname}
              onChange={handleChange}
              placeholder="Last Name"
            />
            {errors.lastname && <p className="text-red-500 text-xs italic mt-1">{errors.lastname}</p>}
          </div>

          {/* Email Address Input */}
          <div className="mb-4 relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
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
          <div className="mb-4">
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                className={`pl-10 pr-12 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs italic mt-1">{errors.password}</p>}
            {formData.password && !errors.password && (
              <div className="mt-2 text-xs space-y-1">
                <div className={`${formData.password.length >= 8 ? 'text-green-600' : 'text-gray-500'}`}>
                  ✓ At least 8 characters
                </div>
                <div className={`${/(?=.*[A-Z])/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                  ✓ One uppercase letter
                </div>
                <div className={`${/(?=.*[a-z])/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                  ✓ One lowercase letter
                </div>
                <div className={`${/(?=.*\d)/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                  ✓ One number
                </div>
                <div className={`${/(?=.*[!@#$%^&*])/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                  ✓ One special character (!@#$%^&*)
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="mb-6">
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                className={`pl-10 pr-12 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm Password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-red-500 text-xs italic mt-1">{errors.confirmPassword}</p>}
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-center">
            <button
              className="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transform transition-all duration-300 ease-in-out hover:scale-105"
              type="submit"
              onClick={handleSubmit}
            >
              Register Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;