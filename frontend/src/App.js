// ============================================
// App.js - Main Application Entry
// ============================================
import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyOTP from './pages/VerifyOTP';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Feed from './pages/Feed';
import Messages from './pages/Messages';
import Internships from './pages/Internships';
import Profile from './pages/Profile';
import AdminPanel from './pages/AdminPanel';
import Courses from './pages/Courses';
import Notifications from './pages/Notifications';
import Search from './pages/Search';
import Settings from './pages/Settings';
import GroupChat from './pages/GroupChat';
import VideoCall from './pages/VideoCall';

export const ThemeContext = createContext({ darkMode: false, toggleDarkMode: () => {} });
export const useTheme = () => useContext(ThemeContext);

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function App() {
  const { isAuthenticated, user } = useAuthStore();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      setShowInstallPrompt(true);
    });
  }, []);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const installPWA = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        setShowInstallPrompt(false);
      });
    }
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <Router>
        <div className={`min-h-screen pb-16 transition-colors duration-300 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
          {isAuthenticated && <Navbar />}
          <div className={isAuthenticated ? 'pt-16' : ''}>
            <Routes>
              <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
              <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/" />} />
              <Route path="/verify-otp" element={!isAuthenticated ? <VerifyOTP /> : <Navigate to="/" />} />
              <Route path="/forgot-password" element={!isAuthenticated ? <ForgotPassword /> : <Navigate to="/" />} />
              <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
              <Route path="/feed" element={isAuthenticated ? <Feed /> : <Navigate to="/login" />} />
              <Route path="/messages" element={isAuthenticated ? <Messages /> : <Navigate to="/login" />} />
              <Route path="/messages/group/:groupId" element={isAuthenticated ? <GroupChat /> : <Navigate to="/login" />} />
              <Route path="/call/:userId" element={isAuthenticated ? <VideoCall /> : <Navigate to="/login" />} />
              <Route path="/internships" element={isAuthenticated ? <Internships /> : <Navigate to="/login" />} />
              <Route path="/courses" element={isAuthenticated ? <Courses /> : <Navigate to="/login" />} />
              <Route path="/profile/:userId?" element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} />
              <Route path="/notifications" element={isAuthenticated ? <Notifications /> : <Navigate to="/login" />} />
              <Route path="/search" element={isAuthenticated ? <Search /> : <Navigate to="/login" />} />
              <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/login" />} />
              <Route path="/admin" element={isAuthenticated && user?.role === 'ADMIN' ? <AdminPanel /> : <Navigate to="/" />} />
            </Routes>
          </div>
          {isAuthenticated && <BottomNav />}
          {showInstallPrompt && (
            <button onClick={installPWA} className="fixed bottom-20 right-4 bg-green-600 text-white rounded-full px-4 py-2 shadow-lg z-50 text-sm font-medium animate-bounce">
              📱 Install App
            </button>
          )}
        </div>
      </Router>
    </ThemeContext.Provider>
  );
}

export default App;