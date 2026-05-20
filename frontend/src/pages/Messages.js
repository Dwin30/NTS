 import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { io } from 'socket.io-client';
import { 
  FaPaperPlane, FaSearch, FaUserPlus, FaComment, FaCheck, FaCheckDouble, 
  FaTrash, FaEdit, FaReply, FaTimes, FaFile, FaPaperclip, FaDownload,
  FaArrowLeft, FaVideo as FaVideoCall, FaMicrophone, FaMicrophoneSlash,
  FaVideoSlash, FaPhoneSlash, FaArrowDown, FaChevronLeft
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api, { uploadFile } from '../services/api';

const Messages = () => {
  const { user, token, setUnreadCount } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [socket, setSocket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [typing, setTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [observedMessages, setObservedMessages] = useState(new Set());
  const [incomingCall, setIncomingCall] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageIdsSet = useRef(new Set());
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const observerRef = useRef(null);
  const callTimerRef = useRef(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  
  const getOtherParticipant = useCallback(() => {
    if (!selectedChat || selectedChat.isGroup) return null;
    return selectedChat.participants?.find(p => p.userId !== user.id)?.user;
  }, [selectedChat, user.id]);
  
  const getChatUnreadCount = useCallback((chat) => {
    if (!chat.messages || !Array.isArray(chat.messages)) return 0;
    return chat.messages.filter(msg => msg.isRead === false && msg.senderId !== user?.id).length;
  }, [user]);
  
  const calculateTotalUnread = useCallback((chatsData) => {
    let total = 0;
    chatsData.forEach(chat => { total += getChatUnreadCount(chat); });
    return total;
  }, [getChatUnreadCount]);
  
  const fetchChats = useCallback(async () => {
    try {
      const res = await api.get('/chat');
      const chatsData = res.data || [];
      setChats(chatsData);
      const totalUnread = calculateTotalUnread(chatsData);
      setUnreadCount(totalUnread);
    } catch (error) {
      console.error('Failed to fetch chats', error);
    }
  }, [calculateTotalUnread, setUnreadCount]);
  
  const fetchMessages = useCallback(async (chatId) => {
    try {
      const res = await api.get(`/chat/${chatId}/messages`);
      const newMessages = (res.data.messages || []).filter(msg => !msg.isDeleted);
      messageIdsSet.current.clear();
      newMessages.forEach(m => messageIdsSet.current.add(m.id));
      setMessages(newMessages);
      setObservedMessages(new Set());
      setTimeout(() => scrollToBottom(), 100);
    } catch (error) {
      console.error('Failed to fetch messages', error);
    }
  }, []);
  
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current && !isUserScrollingRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);
  
  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
      isUserScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => { isUserScrollingRef.current = false; }, 150);
    }
  }, []);
  
  const goBackToChatList = () => setSelectedChat(null);
  
  const markAsRead = useCallback(async (messageId) => {
    try {
      const message = messages.find(m => m.id === messageId);
      if (message && !message.isRead && message.senderId !== user.id) {
        await api.post(`/chat/messages/${messageId}/read`);
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isRead: true } : m));
        fetchChats();
      }
    } catch (error) {
      console.error('Failed to mark as read', error);
    }
  }, [messages, user, fetchChats]);
  
  const endCall = useCallback(() => {
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
    setIsCallActive(false);
    setIsCalling(false);
    setIsMuted(false);
    setIsVideoOff(false);
    setIncomingCall(null);
    toast.success('Call ended');
  }, [localStream, peerConnection]);
  
  const rejectCall = useCallback(() => {
    if (incomingCall && socket) {
      socket.emit('call:reject', { to: incomingCall.fromId });
      setIncomingCall(null);
      toast.error('Call rejected');
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
    }
  }, [incomingCall, socket]);
  
  const startCallSetup = useCallback(async (isVideo = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
      setLocalStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
      });
      
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('call:ice-candidate', { to: getOtherParticipant()?.id, candidate: event.candidate });
        }
      };
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };
      setPeerConnection(pc);
      return pc;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      toast.error('Cannot access camera/microphone. Please check permissions.');
      return null;
    }
  }, [socket, getOtherParticipant]);
  
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    setIsCallActive(true);
    setIsCalling(false);
    const pc = await startCallSetup(true);
    if (!pc) { setIsCallActive(false); return; }
    try {
      if (socket) {
        socket.emit('call:accepted', { to: incomingCall.fromId });
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { to: incomingCall.fromId, answer });
        toast.success('Call connected');
        setIncomingCall(null);
        if (callTimerRef.current) clearTimeout(callTimerRef.current);
      }
    } catch (error) {
      console.error('Accept call error:', error);
      toast.error('Failed to accept call');
      endCall();
    }
  }, [incomingCall, socket, startCallSetup, endCall]);
  
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000', { auth: { token } });
    setSocket(newSocket);
    fetchChats();
    if (location.state?.selectedChat) {
      setSelectedChat(location.state.selectedChat);
      fetchMessages(location.state.selectedChat.id);
    }
    return () => newSocket.disconnect();
  }, [token, fetchChats, fetchMessages, location.state]);
  
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  
  useEffect(() => {
    if (!socket) return;
    
    socket.on('message:received', (message) => {
      if (message.isDeleted) return;
      if (messageIdsSet.current.has(message.id)) return;
      messageIdsSet.current.add(message.id);
      if (selectedChat?.id === message.chatId) {
        setMessages(prev => { if (prev.some(m => m.id === message.id)) return prev; return [...prev, message]; });
        setTimeout(() => scrollToBottom(), 100);
      }
      fetchChats();
      if (message.senderId !== user.id) toast.success(`📩 New message from ${message.sender?.fullName}`);
    });
    
    socket.on('message:sent', (message) => {
      if (message.isDeleted) return;
      if (messageIdsSet.current.has(message.id)) return;
      messageIdsSet.current.add(message.id);
      if (selectedChat?.id === message.chatId) {
        setMessages(prev => { if (prev.some(m => m.id === message.id)) return prev; return [...prev, message]; });
        scrollToBottom();
      }
      fetchChats();
    });
    
    socket.on('message:edited', (message) => {
      if (selectedChat?.id === message.chatId && !message.isDeleted) {
        setMessages(prev => prev.map(m => m.id === message.id ? message : m));
      }
      fetchChats();
    });
    
    socket.on('message:deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      fetchChats();
    });
    
    socket.on('typing:start', ({ userId: typingUserId }) => {
      if (selectedChat && getOtherParticipant()?.id === typingUserId) setIsTyping(true);
    });
    
    socket.on('typing:stop', ({ userId: typingUserId }) => {
      if (selectedChat && getOtherParticipant()?.id === typingUserId) setIsTyping(false);
    });
    
    socket.on('call:incoming', (data) => {
      console.log('📞 Incoming call from:', data.fromName);
      setIncomingCall({ fromId: data.fromId, fromName: data.fromName, offer: data.offer });
      
      toast.custom((t) => (
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5">
          <div className="flex-1 w-0 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5"><div className="w-10 h-10 rounded-full bg-nts-green-600 flex items-center justify-center"><FaVideoCall className="text-white" size={18} /></div></div>
              <div className="ml-3 flex-1"><p className="text-sm font-medium text-gray-900">Incoming Call</p><p className="text-sm text-gray-500">{data.fromName} is calling you...</p></div>
            </div>
          </div>
          <div className="flex border-l border-gray-200">
            <button onClick={() => { toast.dismiss(t.id); acceptCall(); }} className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-green-600 hover:text-green-500 hover:bg-gray-50">Accept</button>
            <button onClick={() => { toast.dismiss(t.id); rejectCall(); }} className="w-full border border-transparent rounded-none p-4 flex items-center justify-center text-sm font-medium text-red-600 hover:text-red-500 hover:bg-gray-50">Decline</button>
          </div>
        </div>
      ), { duration: 30000 });
      
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
      callTimerRef.current = setTimeout(() => { if (incomingCall) { rejectCall(); toast.error('Call timed out - no answer'); } }, 15000);
    });
    
    socket.on('call:accepted', () => { toast.success('Call connected'); setIsCalling(false); if (callTimerRef.current) clearTimeout(callTimerRef.current); });
    socket.on('call:rejected', () => { toast.error('Call rejected'); endCall(); setIsCalling(false); setIncomingCall(null); if (callTimerRef.current) clearTimeout(callTimerRef.current); });
    socket.on('call:offer', async (data) => { if (peerConnection) { await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer)); const answer = await peerConnection.createAnswer(); await peerConnection.setLocalDescription(answer); socket.emit('call:answer', { to: data.from, answer }); } });
    socket.on('call:answer', async (data) => { if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer)); });
    socket.on('call:ice-candidate', (data) => { if (peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); });
    
    return () => {
      socket.off('message:received'); socket.off('message:sent'); socket.off('message:edited'); socket.off('message:deleted');
      socket.off('typing:start'); socket.off('typing:stop'); socket.off('call:incoming'); socket.off('call:accepted');
      socket.off('call:rejected'); socket.off('call:offer'); socket.off('call:answer'); socket.off('call:ice-candidate');
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
    };
  }, [socket, selectedChat, fetchChats, user.id, getOtherParticipant, endCall, acceptCall, rejectCall, incomingCall, peerConnection, scrollToBottom]);
  
  useEffect(() => { if (selectedChat) fetchMessages(selectedChat.id); }, [selectedChat, fetchMessages]);
  
  useEffect(() => {
    if (!messages.length) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const messageId = entry.target.getAttribute('data-message-id');
          if (messageId && !observedMessages.has(messageId)) {
            const message = messages.find(m => m.id === messageId);
            if (message && !message.isRead && message.senderId !== user.id) {
              markAsRead(messageId);
              setObservedMessages(prev => new Set([...prev, messageId]));
            }
          }
        }
      });
    }, { threshold: 0.5 });
    const messageElements = document.querySelectorAll('.message-item');
    messageElements.forEach(el => observerRef.current.observe(el));
    return () => { if (observerRef.current) observerRef.current.disconnect(); };
  }, [messages, observedMessages, user, markAsRead]);
  
  const initiateCall = async (isVideo = true) => {
    const otherUser = getOtherParticipant();
    if (!otherUser) { toast.error('User not found'); return; }
    try { await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }); } catch (err) { toast.error('Please grant camera and microphone permissions'); return; }
    if (isCalling) { toast.error('Already calling...'); return; }
    setIsCalling(true);
    setIsCallActive(true);
    const pc = await startCallSetup(isVideo);
    if (!pc) { setIsCalling(false); setIsCallActive(false); return; }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (socket) socket.emit('call:offer', { to: otherUser.id, from: user.id, fromName: user.fullName, offer });
      toast.success(`Calling ${otherUser.fullName}...`);
      callTimerRef.current = setTimeout(() => { if (isCalling) { toast.error('No answer. Call timed out.'); endCall(); setIsCalling(false); } }, 15000);
    } catch (error) { console.error('Call initiation error:', error); toast.error('Failed to start call'); endCall(); setIsCalling(false); }
  };
  
  const toggleMute = () => {
    if (localStream) { const audioTrack = localStream.getAudioTracks()[0]; if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsMuted(!audioTrack.enabled); toast.success(audioTrack.enabled ? 'Microphone on' : 'Microphone off'); } }
  };
  
  const toggleVideo = () => {
    if (localStream) { const videoTrack = localStream.getVideoTracks()[0]; if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setIsVideoOff(!videoTrack.enabled); toast.success(videoTrack.enabled ? 'Camera on' : 'Camera off'); } }
  };
  
  const handleTyping = (e) => {
    setInput(e.target.value);
    if (!typing && e.target.value.length > 0) {
      setTyping(true);
      const otherUser = getOtherParticipant();
      if (socket && otherUser) socket.emit('typing:start', { receiverId: otherUser.id });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (typing) {
        setTyping(false);
        const otherUser = getOtherParticipant();
        if (socket && otherUser) socket.emit('typing:stop', { receiverId: otherUser.id });
      }
    }, 1500);
  };
  
  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const result = await uploadFile(file, (progress) => setUploadProgress(progress));
      await sendMessageWithFile(result);
    } catch (error) { toast.error('Failed to upload file'); }
    finally { setUploading(false); setUploadProgress(0); }
  };
  
  const sendMessageWithFile = async (fileData) => {
    const otherUser = getOtherParticipant();
    if (!selectedChat || sending) return;
    setSending(true);
    try {
      const res = await api.post('/chat/messages', { chatId: selectedChat.id, content: '', receiverId: otherUser?.id, fileUrl: fileData.url, fileType: fileData.mimetype, fileName: fileData.originalName, replyToId: replyTo?.id });
      const newMessage = res.data;
      if (!messageIdsSet.current.has(newMessage.id)) {
        messageIdsSet.current.add(newMessage.id);
        setMessages(prev => [...prev, newMessage]);
      }
      setReplyTo(null);
      if (socket && otherUser) socket.emit('message:send', { receiverId: otherUser.id, message: newMessage });
      fetchChats();
      toast.success('Message sent');
      scrollToBottom();
    } catch (error) { console.error('Send message error:', error); toast.error('Failed to send message'); }
    finally { setSending(false); }
  };
  
  const sendMessage = async () => {
    if ((!input.trim() && !replyTo) || !selectedChat || sending) return;
    const otherUser = getOtherParticipant();
    setSending(true);
    try {
      const res = await api.post('/chat/messages', { chatId: selectedChat.id, content: input, receiverId: otherUser?.id, replyToId: replyTo?.id });
      const newMessage = res.data;
      if (!messageIdsSet.current.has(newMessage.id)) {
        messageIdsSet.current.add(newMessage.id);
        setMessages(prev => [...prev, newMessage]);
      }
      setInput('');
      setReplyTo(null);
      if (socket && otherUser) socket.emit('message:send', { receiverId: otherUser.id, message: newMessage });
      fetchChats();
      scrollToBottom();
    } catch (error) { console.error('Send message error:', error); toast.error('Failed to send message'); }
    finally { setSending(false); }
  };
  
  const confirmDeleteMessage = (message) => { setMessageToDelete(message); setShowDeleteModal(true); };
  
  const handleDeleteMessage = async () => {
    if (!messageToDelete) return;
    try {
      await api.delete(`/chat/messages/${messageToDelete.id}`);
      setMessages(prev => prev.filter(m => m.id !== messageToDelete.id));
      const otherUser = getOtherParticipant();
      if (socket && otherUser) socket.emit('message:delete', { receiverId: otherUser.id, messageId: messageToDelete.id });
      fetchChats();
      toast.success('Message deleted');
      setShowDeleteModal(false);
      setMessageToDelete(null);
    } catch (error) { toast.error('Failed to delete message'); }
  };
  
  const handleKeyPress = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  
  const searchUsers = async (query) => {
    if (query.length < 2) { setSearchResults([]); return; }
    try { const res = await api.get('/chat/search', { params: { q: query } }); setSearchResults(res.data || []); } catch (error) { console.error('Search failed'); }
  };
  
  const startChat = async (userId) => {
    try {
      const res = await api.post(`/chat/private/${userId}`);
      setSelectedChat(res.data);
      setShowSearch(false);
      setSearchQuery('');
      fetchChats();
      await fetchMessages(res.data.id);
      toast.success('Chat started');
    } catch (error) { console.error('Start chat error:', error); toast.error('Failed to start chat'); }
  };
  
  const renderFilePreview = (message) => {
    const fileType = message.fileType;
    const fileName = message.fileName || 'File';
    if (fileType?.startsWith('image/')) return (<div className="mt-2"><img src={message.fileUrl} alt={fileName} className="max-w-full rounded-lg cursor-pointer max-h-48 object-cover" onClick={() => window.open(message.fileUrl, '_blank')} /></div>);
    if (fileType?.startsWith('video/')) return (<div className="mt-2"><video src={message.fileUrl} controls className="max-w-full rounded-lg max-h-48" controlsList="nodownload" /></div>);
    if (fileType?.startsWith('audio/')) return (<div className="mt-2 p-2 bg-gray-100 rounded-lg"><audio src={message.fileUrl} controls className="w-full" /><p className="text-xs text-gray-500 mt-1 truncate">{fileName}</p></div>);
    return (<div className="mt-2 p-2 bg-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-200 transition"><div className="flex items-center space-x-2 flex-1 min-w-0"><FaFile className="text-nts-green-600 flex-shrink-0" size={16} /><span className="text-xs text-gray-700 truncate flex-1">{fileName}</span></div><a href={message.fileUrl} download className="text-nts-green-600 p-1 rounded-full hover:bg-white transition"><FaDownload size={12} /></a></div>);
  };
  
  const otherUser = getOtherParticipant();
  const totalUnreadCount = chats.reduce((total, chat) => total + (chat.messages || []).filter(msg => msg.isRead === false && msg.senderId !== user?.id).length, 0);
  
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden">
      {/* Chat List Sidebar */}
      <div className={`${selectedChat && isMobile ? 'hidden' : 'flex'} flex-col w-full md:w-80 bg-white border-r shadow-sm h-full overflow-hidden`}>
        <div className="p-4 border-b bg-white sticky top-0 z-10">
          <div className="flex justify-between items-center mb-3">
            <div><h2 className="text-xl font-bold text-gray-800">Messages</h2>{totalUnreadCount > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white ml-2">{totalUnreadCount} new</span>}</div>
            <button onClick={() => setShowSearch(!showSearch)} className="p-2 rounded-full hover:bg-gray-100 transition"><FaUserPlus className="text-nts-green-600" size={18} /></button>
          </div>
          {showSearch && (<div className="mb-3"><div className="relative"><FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} /><input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); searchUsers(e.target.value); }} className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-nts-green-500 focus:border-transparent text-sm" autoFocus /></div>{searchResults.length > 0 && (<div className="absolute bg-white border rounded-xl shadow-lg mt-1 left-4 right-4 z-10 max-h-60 overflow-y-auto">{searchResults.map(result => (<button key={result.id} onClick={() => startChat(result.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-3 transition border-b last:border-b-0"><div className="w-10 h-10 rounded-full bg-gradient-to-r from-nts-green-500 to-nts-green-700 flex items-center justify-center text-white font-bold text-sm">{getInitials(result.fullName)}</div><div><p className="font-semibold text-gray-800">{result.fullName}</p><p className="text-xs text-gray-500">{result.role}</p></div></button>))}</div>)}</div>)}
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (<div className="text-center py-12 text-gray-400"><FaComment className="text-5xl mx-auto mb-3 opacity-50" /><p className="text-sm">No messages yet</p><button onClick={() => setShowSearch(true)} className="block mx-auto mt-3 text-nts-green-600 text-sm font-medium hover:underline">Start a conversation</button></div>) : (chats.map(chat => {
            const other = !chat.isGroup ? chat.participants?.find(p => p.userId !== user.id)?.user : null;
            const lastMessage = chat.messages?.[0];
            const chatUnreadCount = (chat.messages || []).filter(msg => msg.isRead === false && msg.senderId !== user?.id).length;
            const isActive = selectedChat?.id === chat.id;
            return (<button key={chat.id} onClick={() => { setSelectedChat(chat); fetchMessages(chat.id); }} className={`w-full text-left p-4 hover:bg-gray-50 transition border-b ${isActive ? 'bg-nts-green-50 border-l-4 border-l-nts-green-600' : ''}`}><div className="flex items-center space-x-3"><div className="w-12 h-12 rounded-full bg-gradient-to-r from-nts-green-500 to-nts-green-700 flex items-center justify-center text-white font-bold shadow-sm">{getInitials(other?.fullName)}</div><div className="flex-1 min-w-0"><div className="flex justify-between items-baseline"><p className="font-semibold text-gray-800 truncate">{other?.fullName}</p>{lastMessage && !lastMessage.isDeleted && (<span className="text-xs text-gray-400 flex-shrink-0 ml-2">{new Date(lastMessage.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>)}</div><p className="text-sm text-gray-500 truncate">{lastMessage && !lastMessage.isDeleted ? (lastMessage.fileUrl ? `📎 ${lastMessage.fileName || 'File'}` : (lastMessage.content || 'No messages yet')) : 'No messages yet'}</p></div>{chatUnreadCount > 0 && (<div className="bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center font-bold shadow-sm">{chatUnreadCount}</div>)}</div></button>);
          }))}
        </div>
      </div>
      
      {/* Chat Area */}
      <div className={`${!selectedChat && isMobile ? 'hidden' : 'flex'} flex-1 flex-col bg-gray-50 relative h-full overflow-hidden`}>
        {selectedChat && otherUser ? (
          <>
            <div className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
              <div className="flex items-center space-x-3">
                <button onClick={goBackToChatList} className="p-2 rounded-full hover:bg-gray-100 transition md:hidden"><FaChevronLeft className="text-gray-600" size={18} /></button>
                <Link to={`/profile/${otherUser.id}`} className="flex items-center space-x-3 group"><div className="w-10 h-10 rounded-full bg-gradient-to-r from-nts-green-500 to-nts-green-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">{getInitials(otherUser.fullName)}</div><div><h3 className="font-semibold text-gray-800 group-hover:text-nts-green-600 transition text-sm md:text-base">{otherUser.fullName}</h3><p className="text-xs">{isTyping ? <span className="text-nts-green-600 animate-pulse">Typing...</span> : <span className="text-gray-500">{otherUser.role}</span>}</p></div></Link>
              </div>
              <button onClick={() => initiateCall(true)} disabled={isCalling} className="p-2 rounded-full hover:bg-gray-100 transition text-gray-500 hover:text-nts-green-600 disabled:opacity-50"><FaVideoCall size={18} /></button>
            </div>
            
            {replyTo && (<div className="bg-gray-100 px-4 py-2 flex justify-between items-center border-b"><div className="flex items-center space-x-2 text-sm"><FaReply className="text-nts-green-600 flex-shrink-0" size={12} /><span className="text-gray-600 truncate">Replying to: {replyTo.content?.substring(0, 30) || replyTo.fileName || 'File'}</span></div><button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 p-1"><FaTimes size={14} /></button></div>)}
            
            {editingMessage && (<div className="bg-gray-100 px-4 py-2 flex justify-between items-center border-b"><div className="flex items-center space-x-2 text-sm"><FaEdit className="text-blue-500 flex-shrink-0" size={12} /><span className="text-gray-600">Editing message</span></div><button onClick={() => { setEditingMessage(null); setInput(''); }} className="text-gray-400 hover:text-gray-600 p-1"><FaTimes size={14} /></button></div>)}
            
            {uploading && (<div className="bg-blue-50 px-4 py-2 border-b"><div className="flex items-center space-x-3"><div className="flex-1"><div className="bg-blue-200 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} /></div></div><span className="text-xs text-blue-600">{uploadProgress}%</span></div></div>)}
            
            <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 bg-gradient-to-b from-gray-50 to-gray-100">
              {messages.length === 0 ? (<div className="flex flex-col items-center justify-center h-full text-gray-400"><FaComment className="text-5xl mb-3 opacity-30" /><p className="text-center text-sm">No messages yet</p><p className="text-xs">Send a message to start the conversation</p></div>) : (messages.map((message, idx) => {
                const isOwn = message.senderId === user.id;
                const showAvatar = !isOwn && (idx === 0 || messages[idx-1]?.senderId !== message.senderId);
                return (<div key={message.id} className={`message-item flex ${isOwn ? 'justify-end' : 'justify-start'} items-end space-x-1 md:space-x-2 group`} data-message-id={message.id}>
                  {!isOwn && showAvatar && (<div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-r from-nts-green-500 to-nts-green-700 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm">{getInitials(message.sender?.fullName)}</div>)}
                  {!isOwn && !showAvatar && <div className="w-7 md:w-8 flex-shrink-0" />}
                  <div className={`relative max-w-[85%] md:max-w-[70%] ${isOwn ? 'order-first' : ''}`}>
                    {message.replyTo && (<div className={`text-xs mb-1 px-2 py-1 rounded-lg inline-block ${isOwn ? 'bg-nts-green-500 text-nts-green-100' : 'bg-gray-100 text-gray-600'}`}><FaReply className="inline mr-1" size={10} /><span className="italic text-xs">{message.replyTo.content?.substring(0, 30) || message.replyTo.fileName || 'File'}</span></div>)}
                    <div className={`px-3 py-2 md:px-4 md:py-2.5 rounded-2xl shadow-sm ${isOwn ? 'bg-nts-green-600 text-white rounded-br-sm' : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'}`}>
                      {message.content && <p className="text-sm break-words">{message.content}</p>}
                      {message.fileUrl && renderFilePreview(message)}
                      <div className={`flex items-center justify-end space-x-1 mt-1 ${message.content || message.fileUrl ? 'pt-1' : ''}`}>
                        <span className={`text-[10px] ${isOwn ? 'text-nts-green-200' : 'text-gray-400'}`}>{new Date(message.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        {isOwn && (<span>{message.isRead ? <FaCheckDouble size={10} className="text-nts-green-200" /> : <FaCheck size={10} className="text-nts-green-200" />}</span>)}
                        {message.isEdited && <span className={`text-[10px] ${isOwn ? 'text-nts-green-200' : 'text-gray-400'}`}>(edited)</span>}
                      </div>
                    </div>
                    <div className={`absolute top-0 ${isOwn ? '-left-8 md:-left-10' : '-right-8 md:-right-10'} opacity-0 group-hover:opacity-100 transition`}>
                      <div className="flex space-x-1 bg-white rounded-full shadow-md p-1">
                        {isOwn && (<><button onClick={() => { setEditingMessage(message); setInput(message.content); }} className="p-1.5 rounded-full hover:bg-gray-100 text-blue-500"><FaEdit size={10} className="md:text-xs" /></button><button onClick={() => confirmDeleteMessage(message)} className="p-1.5 rounded-full hover:bg-gray-100 text-red-500"><FaTrash size={10} className="md:text-xs" /></button></>)}
                        <button onClick={() => setReplyTo(message)} className="p-1.5 rounded-full hover:bg-gray-100 text-nts-green-600"><FaReply size={10} className="md:text-xs" /></button>
                      </div>
                    </div>
                  </div>
                </div>);
              }))}
              <div ref={messagesEndRef} />
            </div>
            
            {showScrollButton && (<button onClick={() => scrollToBottom()} className="absolute bottom-20 right-4 bg-nts-green-600 text-white p-2 rounded-full shadow-lg hover:bg-nts-green-700 transition-all z-10"><FaArrowDown size={16} /></button>)}
            
            <div className="bg-white border-t px-3 py-2 md:px-4 md:py-3 shadow-sm">
              <div className="flex items-end space-x-2">
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-nts-green-600 rounded-full hover:bg-gray-100 transition"><FaPaperclip size={16} className="md:text-lg" /></button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" />
                <div className="flex-1"><textarea value={input} onChange={handleTyping} onKeyPress={handleKeyPress} placeholder="Type a message..." rows="1" className="w-full px-3 py-2 border border-gray-200 rounded-2xl resize-none focus:ring-2 focus:ring-nts-green-500 focus:border-transparent text-sm bg-gray-50" disabled={uploading} style={{ maxHeight: '80px' }} /></div>
                <button onClick={sendMessage} disabled={(!input.trim() && !replyTo) || sending || uploading} className="p-2 bg-nts-green-600 text-white rounded-full hover:bg-nts-green-700 disabled:opacity-50 transition shadow-sm"><FaPaperPlane size={14} className="md:text-base" /></button>
              </div>
              <div className="mt-1 text-[10px] md:text-xs text-gray-400 flex items-center space-x-3"><span>📎 Attach files</span><span>⌨️ Enter to send</span></div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center text-gray-400"><div className="w-20 h-20 md:w-24 md:h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><FaComment className="text-3xl md:text-4xl text-gray-300" /></div><p className="text-base md:text-lg font-medium text-gray-500">No conversation selected</p><p className="text-xs md:text-sm mt-1">Choose a chat or start a new one</p><button onClick={() => setShowSearch(true)} className="mt-4 px-4 py-2 bg-nts-green-600 text-white rounded-full text-sm font-medium hover:bg-nts-green-700 transition shadow-sm">Find Students</button></div>
          </div>
        )}
      </div>
      
      {/* Incoming Call Modal */}
      {incomingCall && (<div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center animate-fadeIn"><div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 transform transition-all animate-scaleIn"><div className="text-center"><div className="w-20 h-20 bg-nts-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><FaVideoCall className="text-nts-green-600 text-3xl" /></div><h3 className="text-xl font-bold text-gray-800 mb-2">Incoming Call</h3><p className="text-gray-600 mb-6">{incomingCall.fromName} is calling you...</p><div className="flex gap-4 justify-center"><button onClick={acceptCall} className="px-6 py-2 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 transition flex items-center space-x-2"><FaVideoCall size={16} /><span>Accept</span></button><button onClick={rejectCall} className="px-6 py-2 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition flex items-center space-x-2"><FaPhoneSlash size={16} /><span>Decline</span></button></div></div></div></div>)}
      
      {/* Video Call Modal */}
      {isCallActive && (<div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col"><div className="flex-1 flex items-center justify-center p-2 md:p-4"><div className="relative w-full max-w-6xl h-full flex flex-col lg:flex-row gap-2 md:gap-4"><div className="flex-1 bg-gray-900 rounded-xl md:rounded-2xl overflow-hidden relative"><video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />{!remoteStream && (<div className="absolute inset-0 flex items-center justify-center text-white text-sm md:text-base"><p>{isCalling ? 'Calling...' : 'Connecting...'}</p></div>)}<div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white text-sm">{otherUser?.fullName}</div></div><div className="lg:w-80 h-48 lg:h-auto bg-gray-800 rounded-2xl overflow-hidden relative shadow-xl"><video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" /><div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-0.5 rounded-full text-white text-xs">You</div></div></div></div><div className="bg-gray-900 p-4 flex items-center justify-center space-x-4"><button onClick={toggleMute} className={`p-4 rounded-full transition ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>{isMuted ? <FaMicrophoneSlash size={24} /> : <FaMicrophone size={24} />}</button><button onClick={toggleVideo} className={`p-4 rounded-full transition ${isVideoOff ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>{isVideoOff ? <FaVideoSlash size={24} /> : <FaVideoCall size={24} />}</button><button onClick={endCall} className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 transition"><FaPhoneSlash size={24} /></button></div></div>)}
      
      {/* Delete Modal */}
      {showDeleteModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-5 md:p-6 max-w-sm w-full mx-4"><div className="text-center"><div className="w-14 h-14 md:w-16 md:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4"><FaTrash className="text-red-500 text-xl md:text-2xl" /></div><h3 className="text-lg md:text-xl font-bold text-gray-800 mb-2">Delete Message?</h3><p className="text-gray-500 text-xs md:text-sm mb-5 md:mb-6">This action cannot be undone.</p><div className="flex gap-3"><button onClick={() => { setShowDeleteModal(false); setMessageToDelete(null); }} className="flex-1 px-3 py-2 border rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button><button onClick={handleDeleteMessage} className="flex-1 px-3 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">Delete</button></div></div></div></div>)}
    </div>
  );
};

export default Messages;
