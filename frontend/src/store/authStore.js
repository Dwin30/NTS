import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      unreadCount: 0,
      
      login: async (email, password) => {
        try {
          const res = await api.post('/auth/login', { email, password });
          const { token, user } = res.data;
          set({ user, token, isAuthenticated: true });
          localStorage.setItem('token', token);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.response?.data?.error || 'Login failed' };
        }
      },
      
      register: async (data) => {
        try {
          const res = await api.post('/auth/register', data);
          return { success: true, email: res.data.email };
        } catch (error) {
          return { success: false, error: error.response?.data?.error || 'Registration failed' };
        }
      },
      
      verifyOTP: async (email, otp) => {
        try {
          const res = await api.post('/auth/verify-otp', { email, otp });
          const { token, user } = res.data;
          set({ user, token, isAuthenticated: true });
          localStorage.setItem('token', token);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.response?.data?.error || 'Verification failed' };
        }
      },
      
      updateProfile: async (data) => {
        try {
          const res = await api.put('/users/profile', data);
          set({ user: { ...get().user, ...res.data } });
          return { success: true };
        } catch (error) {
          return { success: false, error: error.response?.data?.error || 'Update failed' };
        }
      },
      
      setUnreadCount: (count) => set({ unreadCount: count }),
      
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, unreadCount: 0 });
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }),
    { name: 'nts-auth' }
  )
);