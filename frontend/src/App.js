import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
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

export const ThemeContext = createContext({ darkMode: false, toggleDarkMode: () => {} });

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

function App() {
  const { isAuthenticated, user } = useAuthStore();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <Router>
        <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
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
              <Route path="/internships" element={isAuthenticated ? <Internships /> : <Navigate to="/login" />} />
              <Route path="/courses" element={isAuthenticated ? <Courses /> : <Navigate to="/login" />} />
              <Route path="/profile/:userId?" element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} />
              <Route path="/admin" element={isAuthenticated && user?.role === 'ADMIN' ? <AdminPanel /> : <Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeContext.Provider>
  );
}

export default App;