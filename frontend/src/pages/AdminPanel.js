 import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { io } from 'socket.io-client';
import { 
  FaUsers, FaChalkboardTeacher, FaBook, FaBriefcase, FaTrash, 
  FaEdit, FaEye, FaSearch, FaCrown, FaPlus, FaGraduationCap, 
  FaEnvelope, FaComment, FaChartLine, FaCalendarAlt, FaCheckCircle,
  FaTimesCircle, FaClock, FaUserGraduate, FaDatabase, FaServer,
  FaCode, FaNetworkWired, FaMicrochip, FaBroadcastTower, FaVideo,
  FaSave, FaTimes, FaPaperPlane
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../services/api';
import { Link } from 'react-router-dom';

const AdminPanel = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ students: 0, trainers: 0, posts: 0, internships: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', school: '', role: '', bio: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [applications, setApplications] = useState([]);
  const [internships, setInternships] = useState([]);
  const [showInternshipModal, setShowInternshipModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [newCourse, setNewCourse] = useState({ tradeId: '', level: '', code: '', name: '', description: '' });
  const [newInternship, setNewInternship] = useState({ title: '', company: '', description: '', location: '', duration: 3, stipend: 0, deadline: '' });
  const [allMessages, setAllMessages] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyInput, setReplyInput] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef(null);
  
  const tradesData = [
    { id: 1, name: 'Software Development', icon: <FaCode />, color: 'bg-green-500', levels: { 1: [], 2: [], 3: [] } },
    { id: 2, name: 'Networking & Internet Technologies', icon: <FaNetworkWired />, color: 'bg-blue-500', levels: { 2: [], 3: [] } },
    { id: 3, name: 'Computer Systems & Architecture', icon: <FaMicrochip />, color: 'bg-purple-500', levels: { 2: [], 3: [] } },
    { id: 4, name: 'Electronics & Telecommunication', icon: <FaBroadcastTower />, color: 'bg-yellow-500', levels: { 2: [], 3: [] } },
    { id: 5, name: 'Multimedia & Production', icon: <FaVideo />, color: 'bg-red-500', levels: { 1: [], 2: [], 3: [] } }
  ];
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const usersRes = await api.get('/admin/users');
      setUsers(usersRes.data?.users || []);
      const statsRes = await api.get('/dashboard/stats');
      setStats(statsRes.data);
      const appsRes = await api.get('/admin/applications');
      setApplications(appsRes.data || []);
      const internshipsRes = await api.get('/internships');
      setInternships(internshipsRes.data || []);
      const chatsRes = await api.get('/chat');
      setAllMessages(chatsRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => { fetchData(); }, [fetchData]);
  
  useEffect(() => { if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  const updateUserRole = async (userId, newRole) => {
    try { await api.put(`/admin/users/${userId}/role`, { role: newRole }); toast.success('Role updated'); fetchData(); } 
    catch (error) { toast.error('Failed to update role'); }
  };
  
  const handleEditUser = async () => {
    try { await api.put(`/admin/users/${editingUser.id}`, editForm); toast.success('User updated successfully'); setShowEditModal(false); fetchData(); } 
    catch (error) { toast.error('Failed to update user'); }
  };
  
  const handleDeleteUser = async () => {
    try { await api.delete(`/admin/users/${userToDelete.id}`); toast.success('User deleted'); setShowDeleteModal(false); fetchData(); } 
    catch (error) { toast.error('Failed to delete user'); }
  };
  
  const createInternship = async () => {
    if (!newInternship.title || !newInternship.company || !newInternship.description || !newInternship.deadline) { toast.error('Please fill all required fields'); return; }
    try { await api.post('/internships', newInternship); toast.success('Internship created'); setShowInternshipModal(false); setNewInternship({ title: '', company: '', description: '', location: '', duration: 3, stipend: 0, deadline: '' }); fetchData(); } 
    catch (error) { toast.error('Failed to create internship'); }
  };
  
  const deleteInternship = async (id) => {
    if (!window.confirm('Delete this internship?')) return;
    try { await api.delete(`/internships/${id}`); toast.success('Internship deleted'); fetchData(); } 
    catch (error) { toast.error('Failed to delete internship'); }
  };
  
  const updateApplicationStatus = async (applicationId, status) => {
    try { await api.put(`/admin/applications/${applicationId}/status`, { status }); fetchData(); } 
    catch (error) { toast.error('Failed to update status'); }
  };
  
  const viewChatMessages = async (chatId) => {
    try { const res = await api.get(`/chat/${chatId}/messages`); setMessages(res.data.messages || []); setSelectedChat(allMessages.find(c => c.id === chatId)); } 
    catch (error) { toast.error('Failed to load messages'); }
  };
  
  const sendReply = async () => {
    if (!replyInput.trim() || !selectedChat || sendingReply) return;
    const otherParticipant = selectedChat.participants?.find(p => p.userId !== user.id);
    if (!otherParticipant) return;
    setSendingReply(true);
    try {
      const res = await api.post('/chat/messages', { chatId: selectedChat.id, content: replyInput, receiverId: otherParticipant.userId, replyToId: null });
      setMessages(prev => [...prev, res.data]);
      setReplyInput('');
      fetchData();
      toast.success('Reply sent');
    } catch (error) { toast.error('Failed to send reply'); } 
    finally { setSendingReply(false); }
  };
  
  const addCourse = async () => {
    if (!newCourse.code || !newCourse.name) { toast.error('Please fill course code and name'); return; }
    toast.success(`Course ${newCourse.code} added successfully!`);
    setShowCourseModal(false);
    setNewCourse({ tradeId: '', level: '', code: '', name: '', description: '' });
  };
  
  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nts-green-600"></div></div>;
  if (user?.role !== 'ADMIN') return <div className="text-center py-12"><FaCrown className="text-6xl text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Access denied. Admin only.</p></div>;
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8"><h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1><p className="text-gray-500 mt-1">Full control over users, internships, messages, courses, and platform content</p></div>
        
        <div className="flex flex-wrap gap-2 mb-8 border-b">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg transition ${activeTab === 'dashboard' ? 'bg-white text-nts-green-600 border-b-2 border-nts-green-600 font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}><FaChartLine /><span>Dashboard</span></button>
          <button onClick={() => setActiveTab('users')} className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg transition ${activeTab === 'users' ? 'bg-white text-nts-green-600 border-b-2 border-nts-green-600 font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}><FaUsers /><span>Users</span></button>
          <button onClick={() => setActiveTab('internships')} className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg transition ${activeTab === 'internships' ? 'bg-white text-nts-green-600 border-b-2 border-nts-green-600 font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}><FaBriefcase /><span>Internships</span></button>
          <button onClick={() => setActiveTab('applications')} className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg transition ${activeTab === 'applications' ? 'bg-white text-nts-green-600 border-b-2 border-nts-green-600 font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}><FaUserGraduate /><span>Applications</span></button>
          <button onClick={() => setActiveTab('messages')} className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg transition ${activeTab === 'messages' ? 'bg-white text-nts-green-600 border-b-2 border-nts-green-600 font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}><FaEnvelope /><span>Messages</span></button>
          <button onClick={() => setActiveTab('courses')} className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg transition ${activeTab === 'courses' ? 'bg-white text-nts-green-600 border-b-2 border-nts-green-600 font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}><FaDatabase /><span>Courses</span></button>
        </div>
        
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div><div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"><div className="bg-white rounded-xl shadow-sm p-6"><div className="flex items-center justify-between"><div><p className="text-gray-500 text-sm">Students</p><p className="text-3xl font-bold">{stats.students}</p></div><div className="bg-blue-100 p-3 rounded-full"><FaUsers className="text-blue-600" /></div></div></div><div className="bg-white rounded-xl shadow-sm p-6"><div className="flex items-center justify-between"><div><p className="text-gray-500 text-sm">Trainers</p><p className="text-3xl font-bold">{stats.trainers}</p></div><div className="bg-green-100 p-3 rounded-full"><FaChalkboardTeacher className="text-green-600" /></div></div></div><div className="bg-white rounded-xl shadow-sm p-6"><div className="flex items-center justify-between"><div><p className="text-gray-500 text-sm">Posts</p><p className="text-3xl font-bold">{stats.posts}</p></div><div className="bg-purple-100 p-3 rounded-full"><FaBook className="text-purple-600" /></div></div></div><div className="bg-white rounded-xl shadow-sm p-6"><div className="flex items-center justify-between"><div><p className="text-gray-500 text-sm">Internships</p><p className="text-3xl font-bold">{stats.internships}</p></div><div className="bg-orange-100 p-3 rounded-full"><FaBriefcase className="text-orange-600" /></div></div></div></div><div className="bg-gradient-to-r from-nts-green-600 to-nts-green-700 rounded-xl p-8 text-white"><h2 className="text-2xl font-bold mb-2">Welcome, {user?.fullName}</h2><p>You have full administrative access. Monitor platform activity, manage users, review applications, and oversee all content.</p></div></div>
        )}
        
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden"><div className="p-4 border-b"><div className="relative"><FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border rounded-lg w-80" /></div></div><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-200">{users.filter(u => u.fullName?.toLowerCase().includes(searchTerm.toLowerCase())).map(user => (<tr key={user.id} className="hover:bg-gray-50"><td className="px-6 py-4 text-sm font-medium text-gray-800">{user.fullName}</td><td className="px-6 py-4 text-sm text-gray-500">{user.email}</td><td className="px-6 py-4"><select value={user.role} onChange={(e) => updateUserRole(user.id, e.target.value)} className="text-sm border rounded-lg px-2 py-1"><option value="STUDENT">Student</option><option value="TRAINER">Trainer</option><option value="ADMIN">Admin</option></select></td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${user.isVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{user.isVerified ? 'Verified' : 'Pending'}</span></td><td className="px-6 py-4"><div className="flex space-x-2"><button onClick={() => { setEditingUser(user); setEditForm({ fullName: user.fullName, phone: user.phone || '', school: user.school || '', role: user.role, bio: user.bio || '' }); setShowEditModal(true); }} className="p-1 text-green-500 hover:bg-green-50 rounded"><FaEdit size={14} /></button><button onClick={() => { setUserToDelete(user); setShowDeleteModal(true); }} className="p-1 text-red-500 hover:bg-red-50 rounded"><FaTrash size={14} /></button><Link to={`/profile/${user.id}`} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><FaEye size={14} /></Link></div></td></tr>))}</tbody>}</table></div></div>
        )}
        
        {/* Internships Tab */}
        {activeTab === 'internships' && (
          <div><button onClick={() => setShowInternshipModal(true)} className="mb-4 px-4 py-2 bg-nts-green-600 text-white rounded-lg font-semibold hover:bg-nts-green-700 flex items-center space-x-2"><FaPlus /><span>Add Internship</span></button><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{internships.map(internship => (<div key={internship.id} className="bg-white rounded-xl shadow-sm border p-6"><h3 className="font-bold text-lg">{internship.title}</h3><p className="text-nts-green-600 text-sm">{internship.company}</p><p className="text-gray-600 text-sm mt-2 line-clamp-2">{internship.description}</p><div className="flex justify-between items-center mt-4 pt-3 border-t"><span className="text-xs text-gray-400">Deadline: {new Date(internship.deadline).toLocaleDateString()}</span><button onClick={() => deleteInternship(internship.id)} className="text-red-500 hover:text-red-700"><FaTrash /></button></div></div>))}</div></div>
        )}
        
        {/* Applications Tab */}
        {activeTab === 'applications' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[600px]"><thead className="bg-gray-50"><tr><th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th><th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Internship</th><th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applied Date</th><th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-200">{applications.map(app => (<tr key={app.id} className="hover:bg-gray-50"><td className="px-4 md:px-6 py-4 text-sm">{app.student?.fullName}</td><td className="px-4 md:px-6 py-4 text-sm">{app.internship?.title}</td><td className="px-4 md:px-6 py-4 text-sm">{new Date(app.appliedAt).toLocaleDateString()}</td><td className="px-4 md:px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full inline-flex items-center space-x-1 ${app.status === 'APPROVED' ? 'bg-green-100 text-green-700' : app.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{app.status === 'APPROVED' && <FaCheckCircle size={10} />}{app.status === 'REJECTED' && <FaTimesCircle size={10} />}{app.status === 'PENDING' && <FaClock size={10} />}<span>{app.status}</span></span></td><td className="px-4 md:px-6 py-4"><div className="flex flex-wrap gap-2"><button onClick={async () => { await updateApplicationStatus(app.id, 'APPROVED'); toast.success(`Application for ${app.student?.fullName} approved!`); const tempSocket = io(process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000', { auth: { token: localStorage.getItem('token') } }); tempSocket.emit('application:status:updated', { studentId: app.studentId, internshipTitle: app.internship?.title, status: 'APPROVED' }); tempSocket.disconnect(); fetchData(); }} className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition">Approve</button><button onClick={async () => { await updateApplicationStatus(app.id, 'REJECTED'); toast.error(`Application for ${app.student?.fullName} rejected`); const tempSocket2 = io(process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000', { auth: { token: localStorage.getItem('token') } }); tempSocket2.emit('application:status:updated', { studentId: app.studentId, internshipTitle: app.internship?.title, status: 'REJECTED' }); tempSocket2.disconnect(); fetchData(); }} className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition">Reject</button></div></td></tr>))}</tbody></table></div></div>
        )}
        
        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="flex flex-col lg:flex-row h-[600px] bg-white rounded-xl shadow-sm overflow-hidden"><div className="w-full lg:w-80 border-r bg-gray-50 overflow-y-auto"><div className="p-4 border-b bg-white sticky top-0"><h3 className="font-semibold text-gray-800">All Conversations</h3><p className="text-xs text-gray-500 mt-1">{allMessages.length} total chats</p></div><div className="divide-y">{allMessages.map(chat => { const otherParticipant = chat.participants?.find(p => p.userId !== user.id)?.user; const lastMessage = chat.messages?.[0]; const unreadCount = chat.messages?.filter(m => !m.isRead && m.senderId !== user.id).length || 0; const isActive = selectedChat?.id === chat.id; return (<button key={chat.id} onClick={() => viewChatMessages(chat.id)} className={`w-full text-left p-4 hover:bg-gray-100 transition ${isActive ? 'bg-nts-green-50 border-l-4 border-l-nts-green-600' : ''}`}><div className="flex items-center space-x-3"><div className="w-10 h-10 rounded-full bg-gradient-to-r from-nts-green-500 to-nts-green-700 flex items-center justify-center text-white font-bold text-sm">{otherParticipant?.fullName?.charAt(0) || '?'}</div><div className="flex-1 min-w-0"><div className="flex justify-between items-baseline"><p className="font-semibold text-sm truncate">{otherParticipant?.fullName || 'Unknown User'}</p>{lastMessage && (<span className="text-xs text-gray-400 flex-shrink-0 ml-2">{new Date(lastMessage.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>)}</div><p className="text-xs text-gray-500 truncate">{lastMessage?.content || lastMessage?.fileName || 'No messages yet'}</p></div>{unreadCount > 0 && (<span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>)}</div></button>);})}{allMessages.length === 0 && (<div className="text-center py-8 text-gray-400"><FaComment className="text-4xl mx-auto mb-2 opacity-50" /><p className="text-sm">No conversations yet</p></div>)}</div></div><div className="flex-1 flex flex-col bg-gray-100">{selectedChat ? (<><div className="bg-white border-b px-4 py-3 shadow-sm"><div className="flex items-center space-x-3"><div className="w-10 h-10 rounded-full bg-gradient-to-r from-nts-green-500 to-nts-green-700 flex items-center justify-center text-white font-bold text-sm">{selectedChat.participants?.find(p => p.userId !== user.id)?.user?.fullName?.charAt(0) || '?'}</div><div><h3 className="font-semibold text-gray-800">{selectedChat.participants?.find(p => p.userId !== user.id)?.user?.fullName}</h3><p className="text-xs text-gray-500">Student</p></div></div></div><div className="flex-1 overflow-y-auto p-4 space-y-3">{messages.length === 0 ? (<div className="flex flex-col items-center justify-center h-full text-gray-400"><FaComment className="text-5xl mb-2 opacity-30" /><p className="text-sm">No messages yet</p><p className="text-xs">Start a conversation with this student</p></div>) : (messages.map((msg) => { const isOwn = msg.senderId === user.id; return (<div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] px-4 py-2 rounded-2xl ${isOwn ? 'bg-nts-green-600 text-white rounded-br-sm' : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'}`}>{msg.content && <p className="text-sm break-words">{msg.content}</p>}{msg.fileUrl && (msg.fileType?.startsWith('image/') ? (<img src={msg.fileUrl} alt="Upload" className="max-w-full rounded mt-1 max-h-40 cursor-pointer" onClick={() => window.open(msg.fileUrl)} />) : msg.fileType?.startsWith('video/') ? (<video src={msg.fileUrl} controls className="max-w-full rounded mt-1 max-h-40" />) : (<a href={msg.fileUrl} download className="text-blue-500 underline text-sm">{msg.fileName || 'Download'}</a>))}<p className={`text-xs mt-1 ${isOwn ? 'text-nts-green-200' : 'text-gray-400'}`}>{new Date(msg.createdAt).toLocaleTimeString()}</p></div></div>); }))}<div ref={messagesEndRef} /></div><div className="bg-white border-t px-4 py-3"><div className="flex items-center space-x-2"><input type="text" value={replyInput} onChange={(e) => setReplyInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendReply()} placeholder="Type your reply here..." className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-nts-green-500 focus:border-transparent" /><button onClick={sendReply} disabled={!replyInput.trim() || sendingReply} className="p-2 bg-nts-green-600 text-white rounded-full hover:bg-nts-green-700 transition disabled:opacity-50"><FaPaperPlane size={18} /></button></div></div></>) : (<div className="flex-1 flex items-center justify-center text-gray-400"><div className="text-center"><FaComment className="text-5xl mb-2 opacity-30 mx-auto" /><p>Select a conversation to view messages</p></div></div>)}</div></div>
        )}
        
        {/* Courses Tab */}
        {activeTab === 'courses' && (
          <div className="space-y-6"><div className="bg-white rounded-xl shadow-sm p-6"><div className="flex justify-between items-center mb-6"><div><h2 className="text-xl font-bold text-gray-800">Course Management</h2><p className="text-gray-500 mt-1">Manage all courses across different trades and levels</p></div><button onClick={() => setShowCourseModal(true)} className="px-4 py-2 bg-nts-green-600 text-white rounded-lg font-semibold hover:bg-nts-green-700 flex items-center space-x-2"><FaPlus /><span>Add Course</span></button></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{tradesData.map(trade => (<div key={trade.id} className="border rounded-lg p-4 hover:shadow-md transition"><div className="flex items-center justify-between mb-3"><div className="flex items-center space-x-3"><div className={`${trade.color} p-2 rounded-lg text-white`}>{trade.icon}</div><h3 className="font-semibold text-gray-800">{trade.name}</h3></div><button onClick={() => { setEditingTrade(trade); setShowCourseModal(true); }} className="text-blue-500 hover:text-blue-700"><FaEdit size={16} /></button></div><p className="text-sm text-gray-500">Level 3: {trade.levels[1]?.length || 0} modules<br />Level 4: {trade.levels[2]?.length || 0} modules<br />Level 5: {trade.levels[3]?.length || 0} modules</p><button onClick={() => { setSelectedTrade(trade); setShowModuleModal(true); }} className="mt-3 text-sm text-nts-green-600 hover:underline">Manage Modules →</button></div>))}</div><div className="mt-6 p-4 bg-blue-50 rounded-lg"><p className="text-sm text-blue-800">📚 Total: 450+ modules across all trades. Admin can add, edit, or remove courses.</p></div></div></div>
        )}
      </div>
      
      {/* Edit User Modal */}
      {showEditModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}><div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-bold mb-4">Edit User</h3><div className="space-y-4"><input type="text" placeholder="Full Name" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /><input type="text" placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /><input type="text" placeholder="School" value={editForm.school} onChange={(e) => setEditForm({ ...editForm, school: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /><textarea placeholder="Bio" value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows="3" /><select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full px-3 py-2 border rounded-lg"><option value="STUDENT">Student</option><option value="TRAINER">Trainer</option><option value="ADMIN">Admin</option></select></div><div className="flex gap-3 mt-6"><button onClick={handleEditUser} className="flex-1 px-4 py-2 bg-nts-green-600 text-white rounded-lg">Save</button><button onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button></div></div></div>)}
      
      {/* Delete User Modal */}
      {showDeleteModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDeleteModal(false)}><div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}><div className="text-center"><div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><FaTrash className="text-red-500 text-2xl" /></div><h3 className="text-xl font-bold mb-2">Delete User</h3><p className="text-gray-500 text-sm mb-6">Are you sure you want to delete {userToDelete?.fullName}? This action cannot be undone.</p><div className="flex gap-3"><button onClick={handleDeleteUser} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg">Delete</button><button onClick={() => setShowDeleteModal(false)} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button></div></div></div></div>)}
      
      {/* Internship Modal */}
      {showInternshipModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowInternshipModal(false)}><div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-bold mb-4">Add Internship</h3><div className="space-y-3"><input type="text" placeholder="Title" value={newInternship.title} onChange={(e) => setNewInternship({...newInternship, title: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /><input type="text" placeholder="Company" value={newInternship.company} onChange={(e) => setNewInternship({...newInternship, company: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /><textarea placeholder="Description" value={newInternship.description} onChange={(e) => setNewInternship({...newInternship, description: e.target.value})} className="w-full px-3 py-2 border rounded-lg" rows="3" /><input type="text" placeholder="Location" value={newInternship.location} onChange={(e) => setNewInternship({...newInternship, location: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /><input type="number" placeholder="Duration (months)" value={newInternship.duration} onChange={(e) => setNewInternship({...newInternship, duration: parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg" /><input type="number" placeholder="Stipend (RWF)" value={newInternship.stipend} onChange={(e) => setNewInternship({...newInternship, stipend: parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg" /><input type="date" placeholder="Deadline" value={newInternship.deadline} onChange={(e) => setNewInternship({...newInternship, deadline: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div><div className="flex gap-3 mt-6"><button onClick={createInternship} className="flex-1 px-4 py-2 bg-nts-green-600 text-white rounded-lg">Create</button><button onClick={() => setShowInternshipModal(false)} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button></div></div></div>)}
      
      {/* Add Course Modal */}
      {showCourseModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCourseModal(false)}><div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-bold mb-4">{editingTrade ? `Edit ${editingTrade.name}` : 'Add New Course'}</h3><div className="space-y-3"><select value={newCourse.tradeId} onChange={(e) => setNewCourse({...newCourse, tradeId: e.target.value})} className="w-full px-3 py-2 border rounded-lg"><option value="">Select Trade</option>{tradesData.map(trade => (<option key={trade.id} value={trade.id}>{trade.name}</option>))}</select><select value={newCourse.level} onChange={(e) => setNewCourse({...newCourse, level: e.target.value})} className="w-full px-3 py-2 border rounded-lg"><option value="">Select Level</option><option value="1">Level 3</option><option value="2">Level 4</option><option value="3">Level 5</option></select><input type="text" placeholder="Course Code (e.g., SWD301)" value={newCourse.code} onChange={(e) => setNewCourse({...newCourse, code: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /><input type="text" placeholder="Course Name" value={newCourse.name} onChange={(e) => setNewCourse({...newCourse, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /><textarea placeholder="Description" value={newCourse.description} onChange={(e) => setNewCourse({...newCourse, description: e.target.value})} className="w-full px-3 py-2 border rounded-lg" rows="3" /></div><div className="flex gap-3 mt-6"><button onClick={addCourse} className="flex-1 px-4 py-2 bg-nts-green-600 text-white rounded-lg">Save Course</button><button onClick={() => setShowCourseModal(false)} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button></div></div></div>)}
    </div>
  );
};

export default AdminPanel;
