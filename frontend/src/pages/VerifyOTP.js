 import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { FaCode, FaArrowLeft } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../services/api';

const VerifyOTP = () => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { verifyOTP } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;

  useEffect(() => {
    if (!email) {
      navigate('/register');
    }
  }, [email, navigate]);

  const startCountdown = () => {
    setResendDisabled(true);
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setResendDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    const result = await verifyOTP(email, otp);
    if (result.success) {
      toast.success('Email verified! Welcome to NTS');
      navigate('/');
    } else {
      toast.error(result.error || 'Verification failed');
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (resendDisabled) return;

    setLoading(true);
    try {
      await api.post('/auth/register', { email });
      toast.success('New OTP sent!');
      startCountdown();
    } catch (error) {
      toast.error('Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-nts-green-50 to-nts-green-100">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <FaCode className="text-5xl text-nts-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Verify Your Email</h1>
          <p className="text-gray-500 mt-2">Enter the 6-digit code sent to</p>
          <p className="text-nts-green-600 font-medium mt-1">{email}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <input type="text" placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength="6" className="w-full px-3 py-2 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-nts-green-500 focus:border-transparent outline-none" required />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-nts-green-600 text-white py-2 rounded-lg font-semibold hover:bg-nts-green-700 disabled:opacity-50 transition">
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <div className="text-center mt-6">
          <button onClick={handleResend} disabled={resendDisabled || loading} className="text-sm text-nts-green-600 hover:underline disabled:opacity-50">
            {resendDisabled ? `Resend in ${countdown}s` : 'Resend Code'}
          </button>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          <button onClick={() => navigate('/login')} className="text-nts-green-600 font-semibold hover:underline flex items-center justify-center">
            <FaArrowLeft className="mr-1" size={12} /> Back to Login
          </button>
        </p>
      </div>
    </div>
  );
};

export default VerifyOTP;
