import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { io } from 'socket.io-client';
import { FaCode, FaHome, FaNewspaper, FaComment, FaBriefcase, FaUser, FaSignOutAlt, FaCrown, FaBars, FaTimes, FaBook } from 'react-icons/fa';

const SOCKET_URL = 'https://nts-backend-409a.onrender.com';

const Navbar = () => {
  const { user, logout, unreadCount, setUnreadCount, token } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  useEffect(() => {
    if (!user) return;
    
    const newSocket = io(SOCKET_URL, { auth: { token } });
    
    newSocket.on('message:received', () => {
      fetchUnreadCount();
    });
    
    newSocket.on('message:read', () => {
      fetchUnreadCount();
    });
    
    return () => newSocket.disconnect();
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
    <nav className="bg-white shadow-md fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2" onClick={() => setIsMenuOpen(false)}>
            <FaCode className="text-2xl text-nts-green-600" />
            <span className="font-bold text-xl">NTS</span>
          </Link>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
            <Link to="/" className={isActive('/') ? 'text-nts-green-600' : 'text-gray-600 hover:text-nts-green-600'}>
              <FaHome size={20} />
            </Link>
            <Link to="/feed" className={isActive('/feed') ? 'text-nts-green-600' : 'text-gray-600 hover:text-nts-green-600'}>
              <FaNewspaper size={20} />
            </Link>
            <Link to="/messages" className={`relative ${isActive('/messages') ? 'text-nts-green-600' : 'text-gray-600 hover:text-nts-green-600'}`}>
              <FaComment size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-3 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <Link to="/internships" className={isActive('/internships') ? 'text-nts-green-600' : 'text-gray-600 hover:text-nts-green-600'}>
              <FaBriefcase size={20} />
            </Link>
            {/* Courses link for all users */}
            <Link to="/courses" className={isActive('/courses') ? 'text-nts-green-600' : 'text-gray-600 hover:text-nts-green-600'}>
              <FaBook size={20} />
            </Link>
            <Link to="/profile" className={isActive('/profile') ? 'text-nts-green-600' : 'text-gray-600 hover:text-nts-green-600'}>
              <FaUser size={20} />
            </Link>
            {user?.role === 'ADMIN' && (
              <Link to="/admin" className="text-yellow-600 hover:text-yellow-700">
                <FaCrown size={20} />
              </Link>
            )}
            <button onClick={handleLogout} className="text-gray-600 hover:text-red-500">
              <FaSignOutAlt size={20} />
            </button>
          </div>
          
          {/* Mobile Menu Button */}
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition">
            {isMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
          </button>
        </div>
        
        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <div className="flex flex-col space-y-3">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                <FaHome size={18} /><span>Home</span>
              </Link>
              <Link to="/feed" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                <FaNewspaper size={18} /><span>Feed</span>
              </Link>
              <Link to="/messages" onClick={() => setIsMenuOpen(false)} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-3"><FaComment size={18} /><span>Messages</span></div>
                {unreadCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unreadCount}</span>}
              </Link>
              <Link to="/internships" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                <FaBriefcase size={18} /><span>Internships</span>
              </Link>
              <Link to="/courses" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                <FaBook size={18} /><span>Courses</span>
              </Link>
              <Link to="/profile" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                <FaUser size={18} /><span>Profile</span>
              </Link>
              {user?.role === 'ADMIN' && (
                <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="flex items-center space-x-3 px-2 py-2 rounded-lg text-yellow-600 hover:bg-yellow-50">
                  <FaCrown size={18} /><span>Admin Panel</span>
                </Link>
              )}
              <button onClick={handleLogout} className="flex items-center space-x-3 px-2 py-2 rounded-lg text-red-600 hover:bg-red-50">
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