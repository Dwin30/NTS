import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../App';
import { io } from 'socket.io-client';
import { FaCode, FaHome, FaNewspaper, FaComment, FaBriefcase, FaUser, FaSignOutAlt, FaCrown, FaBars, FaTimes, FaBook, FaMoon, FaSun } from 'react-icons/fa';

// Use the new backend URL
const SOCKET_URL = 'https://nts-backend-new.onrender.com';

const Navbar = () => {
  const { user, logout, unreadCount, setUnreadCount, token } = useAuthStore();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  useEffect(() => {
    if (!user || !token) return;
    
    const newSocket = io(SOCKET_URL, { 
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    
    newSocket.on('connect', () => {
      console.log('Navbar Socket connected');
    });
    
    newSocket.on('message:received', () => {
      fetchUnreadCount();
    });
    
    newSocket.on('message:read', () => {
      fetchUnreadCount();
    });
    
    return () => {
      newSocket.disconnect();
    };
  }, [user, token]);
  
  const fetchUnreadCount = async () => {
    if (!user) return;
    try {
      const api = (await import('../services/api')).default;
      const res = await api.get('/chat');
      const chats = res.data || [];
      const totalUnread = chats.reduce((total, chat) => {
        const unread = (chat.messages || []).filter(msg => 
          msg.isRead === false && msg.senderId !== user?.id
        ).length;
        return total + unread;
      }, 0);
      setUnreadCount(totalUnread);
    } catch (error) {
      console.error('Failed to fetch unread count', error.message);
    }
  };
  
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user, setUnreadCount]);
  
  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsMenuOpen(false);
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
            <Link to="/" className={isActive('/') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400'}>
              <FaHome size={20} />
            </Link>
            <Link to="/feed" className={isActive('/feed') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400'}>
              <FaNewspaper size={20} />
            </Link>
            <Link to="/messages" className={`relative ${isActive('/messages') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400'}`}>
              <FaComment size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-3 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <Link to="/internships" className={isActive('/internships') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400'}>
              <FaBriefcase size={20} />
            </Link>
            <Link to="/courses" className={isActive('/courses') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400'}>
              <FaBook size={20} />
            </Link>
            <Link to="/profile" className={isActive('/profile') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400'}>
              <FaUser size={20} />
            </Link>
            {user?.role === 'ADMIN' && (
              <Link to="/admin" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-700">
                <FaCrown size={20} />
              </Link>
            )}
            <button onClick={toggleDarkMode} className="text-gray-600 dark:text-gray-300 hover:text-yellow-500 dark:hover:text-yellow-400">
              {darkMode ? <FaSun size={20} /> : <FaMoon size={20} />}
            </button>
            <button onClick={handleLogout} className="text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400">
              <FaSignOutAlt size={20} />
            </button>
          </div>
          
          {/* Mobile Menu Button */}
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            {isMenuOpen ? <FaTimes size={20} className="text-gray-800 dark:text-white" /> : <FaBars size={20} className="text-gray-800 dark:text-white" />}
          </button>
        </div>
        
        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col space-y-3">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                <FaHome size={18} /><span>Home</span>
              </Link>
              <Link to="/feed" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                <FaNewspaper size={18} /><span>Feed</span>
              </Link>
              <Link to="/messages" onClick={() => setIsMenuOpen(false)} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                <div className="flex items-center space-x-3"><FaComment size={18} className="text-gray-800 dark:text-white" /><span className="text-gray-800 dark:text-white">Messages</span></div>
                {unreadCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unreadCount}</span>}
              </Link>
              <Link to="/internships" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                <FaBriefcase size={18} /><span>Internships</span>
              </Link>
              <Link to="/courses" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                <FaBook size={18} /><span>Courses</span>
              </Link>
              <Link to="/profile" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                <FaUser size={18} /><span>Profile</span>
              </Link>
              {user?.role === 'ADMIN' && (
                <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900">
                  <FaCrown size={18} /><span>Admin Panel</span>
                </Link>
              )}
              <button onClick={toggleDarkMode} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white">
                {darkMode ? <FaSun size={18} /> : <FaMoon size={18} />}<span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              <button onClick={handleLogout} className="flex items-center space-x-3 px-2 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900">
                <FaSignOutAlt size={18} /><span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;