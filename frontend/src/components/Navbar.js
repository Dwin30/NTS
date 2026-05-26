// ============================================
// components/Navbar.js - Enhanced Navbar
// ============================================
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../App';
import { io } from 'socket.io-client';
import { FaCode, FaHome, FaNewspaper, FaComment, FaBriefcase, FaUser, FaSignOutAlt, FaCrown, FaBars, FaTimes, FaBook, FaMoon, FaSun, FaBell, FaSearch, FaUserPlus } from 'react-icons/fa';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://nts-backend.onrender.com';

const Navbar = () => {
  const { user, logout, unreadCount, notificationCount, setNotificationCount, token } = useAuthStore();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [socket, setSocket] = useState(null);
  
  useEffect(() => {
    if (!user || !token) return;
    
    const newSocket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    setSocket(newSocket);
    
    newSocket.on('connect', () => console.log('Navbar Socket connected'));
    newSocket.on('notification:new', (notification) => {
      setNotificationCount(notificationCount + 1);
    });
    
    return () => newSocket.disconnect();
  }, [user, token]);
  
  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsMenuOpen(false);
  };
  
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  
  const isActive = (path) => location.pathname === path;
  
  return (
    <nav className="bg-white dark:bg-gray-800 shadow-md fixed top-0 left-0 right-0 z-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2" onClick={() => setIsMenuOpen(false)}>
            <FaCode className="text-2xl text-green-600 dark:text-green-400" />
            <span className="font-bold text-xl text-gray-800 dark:text-white">NTS</span>
          </Link>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
            <NavLink to="/" icon={<FaHome size={20} />} isActive={isActive('/')} />
            <NavLink to="/feed" icon={<FaNewspaper size={20} />} isActive={isActive('/feed')} />
            <NavLink to="/messages" icon={<FaComment size={20} />} isActive={isActive('/messages')} badge={unreadCount} />
            <NavLink to="/internships" icon={<FaBriefcase size={20} />} isActive={isActive('/internships')} />
            <NavLink to="/courses" icon={<FaBook size={20} />} isActive={isActive('/courses')} />
            <NavLink to="/notifications" icon={<FaBell size={20} />} isActive={isActive('/notifications')} badge={notificationCount} />
            <NavLink to="/profile" icon={<FaUser size={20} />} isActive={isActive('/profile')} />
            {user?.role === 'ADMIN' && (
              <Link to="/admin" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-700">
                <FaCrown size={20} />
              </Link>
            )}
            <button onClick={toggleDarkMode} className="text-gray-600 dark:text-gray-300 hover:text-yellow-500">
              {darkMode ? <FaSun size={20} /> : <FaMoon size={20} />}
            </button>
            <div className="relative group">
              <button className="flex items-center space-x-2 focus:outline-none">
                <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-sm font-bold">
                  {getInitials(user?.fullName)}
                </div>
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-2 hidden group-hover:block">
                <Link to="/profile" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Profile</Link>
                <Link to="/settings" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Settings</Link>
                <hr className="my-1" />
                <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700">Logout</button>
              </div>
            </div>
          </div>
          
          {/* Mobile Menu Button */}
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {isMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
          </button>
        </div>
        
        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col space-y-3">
              <MobileNavLink to="/" icon={<FaHome />} label="Home" onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/feed" icon={<FaNewspaper />} label="Feed" onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/messages" icon={<FaComment />} label="Messages" badge={unreadCount} onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/internships" icon={<FaBriefcase />} label="Internships" onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/courses" icon={<FaBook />} label="Courses" onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/notifications" icon={<FaBell />} label="Notifications" badge={notificationCount} onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/search" icon={<FaSearch />} label="Search" onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/profile" icon={<FaUser />} label="Profile" onClick={() => setIsMenuOpen(false)} />
              <MobileNavLink to="/settings" icon={<FaUserPlus />} label="Settings" onClick={() => setIsMenuOpen(false)} />
              {user?.role === 'ADMIN' && (
                <MobileNavLink to="/admin" icon={<FaCrown />} label="Admin Panel" textColor="text-yellow-600" onClick={() => setIsMenuOpen(false)} />
              )}
              <button onClick={toggleDarkMode} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                {darkMode ? <FaSun size={18} /> : <FaMoon size={18} />}<span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              <button onClick={handleLogout} className="flex items-center space-x-3 px-2 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900">
                <FaSignOutAlt size={18} /><span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

const NavLink = ({ to, icon, isActive, badge }) => (
  <Link to={to} className={`relative ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:text-green-600'}`}>
    {icon}
    {badge > 0 && (
      <span className="absolute -top-2 -right-3 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </Link>
);

const MobileNavLink = ({ to, icon, label, badge, textColor, onClick }) => (
  <Link to={to} onClick={onClick} className={`flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 ${textColor || 'text-gray-800 dark:text-white'}`}>
    <div className="flex items-center space-x-3"><span className="text-lg">{icon}</span><span>{label}</span></div>
    {badge > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{badge}</span>}
  </Link>
);

export default Navbar;