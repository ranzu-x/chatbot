import React, { useState, useEffect } from 'react'; // Added useEffect
import { Eye, EyeOff, Check, X, User, Mail, Phone, Calendar, Briefcase, GraduationCap, Stethoscope, MapPin, Camera } from 'lucide-react';
import { useAuth } from '../../Provider/AuthContexProvider';

const UserCreationForm = () => {
  const { user } = useAuth();

  // State for all possible billable services fetched from the backend
  const [availableServices, setAvailableServices] = useState([]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
    age: '',
    role: '', // This represents the Role (Doctor, Nurse, etc.)
    qualification: '',
    specialization: '',
    address: '',
    emergencyContact: '',
    profileImage: null,
    services: [] // This will hold the fees: [{ service_id: 1, fee: 150 }]
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [] });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Your static data arrays (unchanged)
  const departments = [
    'Emergency Medicine', 'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics',
    'General Medicine', 'Surgery', 'Radiology', 'Laboratory', 'Pharmacy',
    'Administration', 'ICU', 'Oncology', 'Dermatology', 'Psychiatry'
  ];
  const roles = ['Doctor', 'Junior Nurse', 'Senior Nurse', 'Receptionist', 'Lab Technician', 'Pharmacist'];
  const specializations = {
    'Doctor': ['General Practitioner', 'Cardiologist', 'Neurologist', 'Orthopedic Surgeon', 'Pediatrician', 'Radiologist', 'Anesthesiologist', 'Emergency Medicine', 'Internal Medicine'],
    'Nurse': ['Registered Nurse', 'ICU Nurse', 'Emergency Nurse', 'Pediatric Nurse', 'Surgical Nurse', 'Oncology Nurse'],
    'Lab Technician': ['Clinical Laboratory Technician', 'Medical Laboratory Technician', 'Pathology Technician', 'Radiology Technician'],
    'Pharmacist': ['Clinical Pharmacist', 'Hospital Pharmacist', 'Retail Pharmacist', 'Pharmaceutical Researcher'],
    'Receptionist': ['Front Desk', 'Patient Coordinator', 'Medical Secretary', 'Appointment Scheduler']
  };

  // Fetch available services when the component mounts
  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/v1/services', {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to fetch services');
        const data = await response.json();
        setAvailableServices(data);
      } catch (error) {
        console.error("Error fetching services:", error);
      }
    };
    fetchServices();
  }, []);

  // Helper functions (unchanged)
  const calculateAge = (dateOfBirth) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  const calculateDateOfBirth = (age) => {
    const today = new Date();
    const birthYear = today.getFullYear() - parseInt(age);
    const birthDate = new Date(birthYear, today.getMonth(), today.getDate());
    return birthDate.toISOString().split('T')[0];
  };
  const checkPasswordStrength = (password) => {
    const feedback = [];
    let score = 0;
    if (password.length >= 8) { score++; } else { feedback.push('At least 8 characters'); }
    if (password.length <= 50) { score++; } else { feedback.push('Maximum 50 characters'); }
    if (/[A-Z]/.test(password)) { score++; } else { feedback.push('One uppercase letter'); }
    if (/[a-z]/.test(password)) { score++; } else { feedback.push('One lowercase letter'); }
    if (/\d/.test(password)) { score++; } else { feedback.push('One number'); }
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) { score++; } else { feedback.push('One special character'); }
    return { score, feedback };
  };
  const validateForm = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) { newErrors.email = 'Email is required'; }
    else if (!emailRegex.test(formData.email)) { newErrors.email = 'Please enter a valid email'; }
    const passwordCheck = checkPasswordStrength(formData.password);
    if (passwordCheck.score < 6) { newErrors.password = `Password must meet all requirements`; }
    if (formData.password !== formData.confirmPassword) { newErrors.confirmPassword = 'Passwords do not match'; }
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    if (!formData.phone.trim()) { newErrors.phone = 'Phone number is required'; }
    else if (!phoneRegex.test(formData.phone)) { newErrors.phone = 'Please enter a valid phone number'; }
    if (!formData.gender) newErrors.gender = 'Gender is required';
    if (!formData.dateOfBirth && !formData.age) newErrors.dateOfBirth = 'Date of birth or age is required';
    if (!formData.role) newErrors.role = 'Role is required';
    if (!formData.qualification.trim()) newErrors.qualification = 'Qualification is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle input changes (with added logic for services)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'password') {
      setPasswordStrength(checkPasswordStrength(value));
    }
    // Clear fees if the role is changed to something other than "Doctor"
    if (name === 'role' && value !== 'Doctor') {
        setFormData(prev => ({ ...prev, services: [] }));
    }
    if (name === 'age' && value) {
      const dob = calculateDateOfBirth(value);
      setFormData(prev => ({ ...prev, [name]: value, dateOfBirth: dob }));
    } else if (name === 'dateOfBirth' && value) {
      const age = calculateAge(value);
      setFormData(prev => ({ ...prev, [name]: value, age: age.toString() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Handle file upload (unchanged)
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, profileImage: file }));
    }
  };

  // Handle form submission (with added logic for services)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const submitData = new FormData();
      Object.keys(formData).forEach(key => {
        // Handle the services array specially
        if (key === 'services') {
          if (formData.services.length > 0) {
            submitData.append('services', JSON.stringify(formData.services));
          }
        } else if (formData[key] !== null && formData[key] !== '') {
          submitData.append(key, formData[key]);
        }
      });
      submitData.append('hospital_id', user?.hospital_id);
      console.log("submitted Data", submitData);

      const response = await fetch('http://localhost:5000/api/v1/users/create-users', {
        method: 'POST',
        body: submitData,
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create user');
      }
      const data = await response.json();
      console.log(data);
      alert('User created successfully!');

      setFormData({
        firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
        phone: '', gender: '', dateOfBirth: '', age: '', role: '',
        qualification: '', specialization: '', address: '', emergencyContact: '',
        profileImage: null,
        services: [] // Reset services
      });
      setPasswordStrength({ score: 0, feedback: [] });

    } catch (error) {
      alert(error.message);
      console.log(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Password helpers (unchanged)
  const getPasswordStrengthColor = () => {
    if (passwordStrength.score <= 2) return 'bg-red-500';
    if (passwordStrength.score <= 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  const getPasswordStrengthText = () => {
    if (passwordStrength.score <= 2) return 'Weak';
    if (passwordStrength.score <= 4) return 'Medium';
    return 'Strong';
  };

  // New handlers for dynamic fee inputs
  const handleServiceFeeChange = (serviceId, fee) => {
    setFormData(prevData => {
      const otherServices = prevData.services.filter(s => s.service_id !== serviceId);
      const newFee = parseFloat(fee);
      if (isNaN(newFee) || newFee < 0 || fee === '') {
        return { ...prevData, services: [...otherServices] };
      }
      const updatedService = { service_id: serviceId, fee: newFee };
      return { ...prevData, services: [...otherServices, updatedService] };
    });
  };
  const getServiceFee = (serviceId) => {
    const service = formData.services.find(s => s.service_id === serviceId);
    return service ? service.fee : '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <User className="w-8 h-8" />
              Create Medical Staff Account
            </h1>
            <p className="text-blue-100 mt-2">Fill in the details to create a new user account</p>
          </div>

          <form className="p-8 space-y-8" onSubmit={handleSubmit}>
            {/* Profile Image */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                  {formData.profileImage ? (
                    <img src={URL.createObjectURL(formData.profileImage)} alt="Profile" className="w-full h-full object-cover" />
                  ) : ( <Camera className="w-8 h-8 text-gray-400" /> )}
                </div>
                <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors">
                  <Camera className="w-4 h-4" />
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            </div>

            {/* Personal Information */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b border-gray-200 pb-2">Personal Information</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                  <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.firstName ? 'border-red-500' : 'border-gray-300'}`} placeholder="Enter first name" />
                  {errors.firstName && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                  <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.lastName ? 'border-red-500' : 'border-gray-300'}`} placeholder="Enter last name" />
                  {errors.lastName && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.lastName}</p>}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2"><Mail className="w-4 h-4 inline mr-2" />Email Address *</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.email ? 'border-red-500' : 'border-gray-300'}`} placeholder="Enter email address" />
                  {errors.email && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2"><Phone className="w-4 h-4 inline mr-2" />Phone Number *</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.phone ? 'border-red-500' : 'border-gray-300'}`} placeholder="Enter phone number" />
                  {errors.phone && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.phone}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2"><MapPin className="w-4 h-4 inline mr-2" />Address</label>
                <textarea name="address" value={formData.address} onChange={handleInputChange} rows="3" className="w-full px-4 py-3 border border-gray-300 rounded-lg" placeholder="Enter full address" />
              </div>
            </div>

            {/* Security Information */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b border-gray-200 pb-2">Security Information</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg pr-12 ${errors.password ? 'border-red-500' : 'border-gray-300'}`} placeholder="Enter password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                  </div>
                  {formData.password && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor()}`} style={{ width: `${(passwordStrength.score / 6) * 100}%` }} /></div>
                        <span className={`text-sm font-medium ${passwordStrength.score <= 2 ? 'text-red-600' : passwordStrength.score <= 4 ? 'text-yellow-600' : 'text-green-600'}`}>{getPasswordStrengthText()}</span>
                      </div>
                      {passwordStrength.feedback.length > 0 && (
                        <div className="text-sm text-gray-600">
                          <p className="mb-1">Password must include:</p>
                          <ul className="space-y-1">{passwordStrength.feedback.map((item, index) => (<li key={index} className="flex items-center gap-2"><X className="w-3 h-3 text-red-500" />{item}</li>))}</ul>
                        </div>
                      )}
                    </div>
                  )}
                  {errors.password && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.password}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password *</label>
                  <div className="relative">
                    <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg pr-12 ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`} placeholder="Confirm password" />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700">{showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                  </div>
                  {formData.confirmPassword && formData.password === formData.confirmPassword && <p className="text-green-500 text-sm mt-1 flex items-center gap-1"><Check className="w-4 h-4" />Passwords match</p>}
                  {errors.confirmPassword && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.confirmPassword}</p>}
                </div>
              </div>
            </div>

            {/* Personal Details */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b border-gray-200 pb-2">Personal Details</h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender *</label>
                  <select name="gender" value={formData.gender} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.gender ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">Select Gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                  {errors.gender && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.gender}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2"><Calendar className="w-4 h-4 inline mr-2" />Date of Birth *</label>
                  <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.dateOfBirth ? 'border-red-500' : 'border-gray-300'}`} />
                  {errors.dateOfBirth && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.dateOfBirth}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Age (Years) *</label>
                  <input type="number" name="age" value={formData.age} onChange={handleInputChange} min="18" max="80" className="w-full px-4 py-3 border border-gray-300 rounded-lg" placeholder="Enter age" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact</label>
                <input type="tel" name="emergencyContact" value={formData.emergencyContact} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" placeholder="Emergency contact number" />
              </div>
            </div>

            {/* Professional Information */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 border-b border-gray-200 pb-2">Professional Information</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2"><Briefcase className="w-4 h-4 inline mr-2" />Role/Position *</label>
                  <select name="role" value={formData.role} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.role ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">Select Role</option>
                    {roles.map(role => (<option key={role} value={role}>{role}</option>))}
                  </select>
                  {errors.role && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.role}</p>}
                </div>
                {formData.role === 'Doctor' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2"><Stethoscope className="w-4 h-4 inline mr-2" />Specialization</label>
                    <select name="specialization" value={formData.specialization} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                      <option value="">Select Specialization</option>
                      {specializations['Doctor']?.map(spec => (<option key={spec} value={spec}>{spec}</option>))}
                    </select>
                  </div>
                )}
              </div>
              
              {/* Conditionally Rendered Doctor's Fees Section */}
              {formData.role === 'Doctor' && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-700">Consultation Fees</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {availableServices.length > 0 ? availableServices.map(service => (
                            <div key={service.id}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{service.service_name} Fee</label>
                                <input type="number" min="0" step="0.01" value={getServiceFee(service.id)} onChange={(e) => handleServiceFeeChange(service.id, e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="e.g. 150.00" />
                            </div>
                        )) : (
                          <p className="text-gray-500 text-sm md:col-span-2">Loading billable services...</p>
                        )}
                    </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2"><GraduationCap className="w-4 h-4 inline mr-2" />Qualification *</label>
                  <input type="text" name="qualification" value={formData.qualification} onChange={handleInputChange} className={`w-full px-4 py-3 border rounded-lg ${errors.qualification ? 'border-red-500' : 'border-gray-300'}`} placeholder="Enter qualification (e.g. MBBS, BSc Nursing)" />
                  {errors.qualification && <p className="text-red-500 text-sm mt-1 flex items-center gap-1"><X className="w-4 h-4" />{errors.qualification}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2"><Briefcase className="w-4 h-4 inline mr-2" />Department</label>
                  <select name="departmentName" value={formData.departmentName || ''} onChange={handleInputChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                    <option value="">Select Department</option>
                    {departments.map(dep => (<option key={dep} value={dep}>{dep}</option>))}
                  </select>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-6">
              <button type="submit" disabled={isSubmitting} className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 transform hover:scale-[1.02] active:scale-[0.98]' } shadow-lg`}>
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserCreationForm;