import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { FaCode } from 'react-icons/fa';

const Register = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'STUDENT',
    phone: '',
    school: ''
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const result = await register({
      fullName: formData.fullName,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      phone: formData.phone,
      school: formData.school
    });

    if (result.success) {
      toast.success('OTP sent to your email!');
      navigate('/verify-otp', { state: { email: result.email } });
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-nts-green-50 to-nts-green-100 py-12">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <FaCode className="text-5xl text-nts-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Create Account</h1>
          <p className="text-gray-500 mt-2">Join NTS community</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <input type="text" name="fullName" placeholder="Full Name" value={formData.fullName} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg focus:ring-nts-green-500" required />
          </div>
          <div className="mb-3">
            <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg focus:ring-nts-green-500" required />
          </div>
          <div className="mb-3">
            <input type="tel" name="phone" placeholder="Phone Number (optional)" value={formData.phone} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="mb-3">
            <input type="text" name="school" placeholder="School/University (optional)" value={formData.school} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="mb-3">
            <select name="role" value={formData.role} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
              <option value="STUDENT">Student</option>
              <option value="TRAINER">Trainer/Teacher</option>
            </select>
          </div>
          <div className="mb-3">
            <input type="password" name="password" placeholder="Password (min 6 characters)" value={formData.password} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" required />
          </div>
          <div className="mb-6">
            <input type="password" name="confirmPassword" placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" required />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-nts-green-600 text-white py-2 rounded-lg font-semibold hover:bg-nts-green-700 disabled:opacity-50 transition">
            {loading ? 'Sending OTP...' : 'Register'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-nts-green-600 font-semibold hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
