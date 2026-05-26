// ============================================
// store/authStore.js - Enhanced Auth Store
// ============================================
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
      notificationCount: 0,
      onlineUsers: [],
      
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
      
      updateAvatar: async (file) => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await api.post('/upload/avatar', formData);
          const user = { ...get().user, avatar: res.data.url };
          set({ user });
          return { success: true, url: res.data.url };
        } catch (error) {
          return { success: false, error: 'Failed to update avatar' };
        }
      },
      
      followUser: async (userId) => {
        try {
          const res = await api.post(`/users/${userId}/follow`);
          return { success: true, isFollowing: res.data.isFollowing };
        } catch (error) {
          return { success: false };
        }
      },
      
      setUnreadCount: (count) => set({ unreadCount: count }),
      setNotificationCount: (count) => set({ notificationCount: count }),
      setOnlineUsers: (users) => set({ onlineUsers: users }),
      
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, unreadCount: 0, notificationCount: 0 });
        localStorage.removeItem('token');
      }
    }),
    { name: 'nts-auth' }
  )
);