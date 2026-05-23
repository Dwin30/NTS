import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { io } from 'socket.io-client';
import { 
  FaPaperPlane, FaSearch, FaUserPlus, FaComment, FaCheck, FaCheckDouble, 
  FaTrash, FaEdit, FaReply, FaTimes, FaPaperclip,
  FaArrowLeft, FaVideo as FaVideoCall, FaMicrophone, FaMicrophoneSlash,
  FaVideoSlash, FaPhoneSlash, FaArrowDown, FaPlay, FaPause,
  FaPhone, FaPhoneAlt, FaStop, FaSmile
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../services/api';

// Use the new backend URL
const SOCKET_URL = 'https://nts-backend-new.onrender.com';

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
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showChatArea, setShowChatArea] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const callTimerRef = useRef(null);
  const audioRefs = useRef({});
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  
  // Reaction Picker
  const ReactionPicker = ({ onSelect, onClose }) => {
    const reactions = ['❤️', '👍', '😂', '😮', '😢', '😡'];
    return (
      <div className="absolute -top-12 left-0 flex gap-2 bg-white rounded-full p-2 shadow-lg z-20 dark:bg-gray-800">
        {reactions.map(emoji => (
          <button key={emoji} onClick={() => { onSelect(emoji); onClose(); }} className="text-2xl hover:scale-125 transition-transform">
            {emoji}
          </button>
        ))}
      </div>
    );
  };
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Socket connection with proper reconnection settings
  useEffect(() => {
    if (!token || !user) return;
    
    const newSocket = io(SOCKET_URL, { 
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    
    newSocket.on('connect', () => {
      console.log('✅ Socket connected to backend');
      newSocket.emit('user:online', { userId: user.id });
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
    
    setSocket(newSocket);
    fetchChats();
    
    if (location.state?.selectedChat) {
      setSelectedChat(location.state.selectedChat);
      fetchMessages(location.state.selectedChat.id);
      if (isMobile) setShowChatArea(true);
    }
    
    return () => {
      if (newSocket) {
        newSocket.emit('user:offline', { userId: user.id });
        newSocket.disconnect();
      }
    };
  }, [token, user]);
  
  useEffect(() => {
    if (!socket) return;
    
    socket.on('message:received', (message) => {
      if (selectedChat?.id === message.chatId) {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
        socket.emit('message:read', { messageId: message.id, senderId: message.senderId });
      }
      fetchChats();
    });
    
    socket.on('message:read', ({ messageId }) => {
      setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, isRead: true, readAt: new Date() } : msg));
    });
    
    socket.on('message:updated', (updatedMessage) => {
      setMessages(prev => prev.map(msg => msg.id === updatedMessage.id ? updatedMessage : msg));
    });
    
    socket.on('message:deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      fetchChats();
    });
    
    socket.on('message:reacted', ({ messageId, reaction }) => {
      setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, reaction } : msg));
    });
    
    socket.on('typing:start', ({ userId }) => {
      const other = getOtherParticipant();
      if (other?.id === userId) setIsTyping(true);
    });
    
    socket.on('typing:stop', ({ userId }) => {
      const other = getOtherParticipant();
      if (other?.id === userId) setIsTyping(false);
    });
    
    socket.on('call:incoming', (data) => {
      setIncomingCall(data);
      const audio = new Audio('/ringtone.mp3');
      audio.loop = true;
      audio.play().catch(e => console.log('Ringtone error'));
      window.currentRingtone = audio;
      toast.success(`${data.fromName} is calling...`);
    });
    
    socket.on('call:accepted', ({ answer }) => {
      if (peerConnection && answer) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        setIsCallActive(true);
        setIsCalling(false);
        toast.success('Call connected');
        let seconds = 0;
        callTimerRef.current = setInterval(() => {
          seconds++;
          setCallDuration(seconds);
        }, 1000);
      }
    });
    
    socket.on('call:rejected', () => {
      endCall();
      toast.error('Call rejected');
    });
    
    socket.on('call:ended', () => {
      endCall();
      toast.info('Call ended');
    });
    
    socket.on('call:ice-candidate', ({ candidate }) => {
      if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
    
    return () => {
      socket.off('message:received');
      socket.off('message:read');
      socket.off('message:updated');
      socket.off('message:deleted');
      socket.off('message:reacted');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('call:incoming');
      socket.off('call:accepted');
      socket.off('call:rejected');
      socket.off('call:ended');
      socket.off('call:ice-candidate');
    };
  }, [socket, selectedChat]);
  
  const getOtherParticipant = useCallback(() => {
    if (!selectedChat || selectedChat.isGroup) return null;
    return selectedChat.participants?.find(p => p.userId !== user.id)?.user;
  }, [selectedChat, user.id]);
  
  const fetchChats = async () => {
    try {
      const res = await api.get('/chat');
      setChats(res.data || []);
      const unread = (res.data || []).reduce((total, chat) => {
        return total + (chat.messages || []).filter(m => !m.isRead && m.senderId !== user?.id).length;
      }, 0);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Fetch chats error:', error);
    }
  };
  
  const fetchMessages = async (chatId) => {
    try {
      const res = await api.get(`/chat/${chatId}/messages`);
      setMessages(res.data.messages || []);
      scrollToBottom();
      
      const unreadMessages = (res.data.messages || []).filter(m => !m.isRead && m.senderId !== user.id);
      unreadMessages.forEach(msg => {
        api.post(`/chat/messages/${msg.id}/read`);
        socket?.emit('message:read', { messageId: msg.id, senderId: msg.senderId });
      });
    } catch (error) {
      console.error('Fetch messages error:', error);
    }
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200);
    }
  };
  
  const handleTyping = (e) => {
    setInput(e.target.value);
    const other = getOtherParticipant();
    if (socket && other) {
      socket.emit('typing:start', { receiverId: other.id });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing:stop', { receiverId: other.id });
      }, 1500);
    }
  };
  
  const handleReaction = async (messageId, reaction) => {
    try {
      await api.post(`/chat/messages/${messageId}/react`, { reaction });
      socket.emit('message:react', { messageId, reaction, to: getOtherParticipant()?.id });
      setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, reaction } : msg));
    } catch (error) {
      console.error('Reaction error:', error);
    }
    setShowReactionPicker(null);
  };
  
  const sendMessage = async () => {
    if (!input.trim() || !selectedChat || sending) return;
    const other = getOtherParticipant();
    setSending(true);
    try {
      const payload = { chatId: selectedChat.id, content: input, receiverId: other?.id };
      if (replyingTo) payload.replyToId = replyingTo.id;
      
      const res = await api.post('/chat/messages', payload);
      setMessages(prev => [...prev, res.data]);
      setInput('');
      setReplyingTo(null);
      
      if (socket && other) {
        socket.emit('message:send', { receiverId: other.id, message: res.data });
      }
      fetchChats();
      scrollToBottom();
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };
  
  const editMessage = async () => {
    if (!editingMessage || !input.trim()) return;
    try {
      const res = await api.put(`/chat/messages/${editingMessage.id}`, { content: input });
      setMessages(prev => prev.map(msg => msg.id === editingMessage.id ? res.data : msg));
      setInput('');
      setEditingMessage(null);
      toast.success('Message edited');
    } catch (error) {
      toast.error('Failed to edit message');
    }
  };
  
  const deleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      await api.delete(`/chat/messages/${selectedMessage.id}`);
      setMessages(prev => prev.filter(msg => msg.id !== selectedMessage.id));
      setShowDeleteConfirm(false);
      setSelectedMessage(null);
      toast.success('Message deleted');
    } catch (error) {
      toast.error('Failed to delete message');
    }
  };
  
  const handleReplyClick = (message) => {
    setReplyingTo(message);
    document.querySelector('textarea')?.focus();
  };
  
  const handleEditClick = (message) => {
    setEditingMessage(message);
    setInput(message.content);
    document.querySelector('textarea')?.focus();
  };
  
  const handleFileUpload = async (file) => {
    if (!selectedChat) return toast.error('No chat selected');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.post('/upload', formData);
      const other = getOtherParticipant();
      const res = await api.post('/chat/messages', {
        chatId: selectedChat.id,
        content: '',
        receiverId: other?.id,
        fileUrl: result.data.url,
        fileType: file.type,
        fileName: file.name
      });
      setMessages(prev => [...prev, res.data]);
      if (socket && other) {
        socket.emit('message:send', { receiverId: other.id, message: res.data });
      }
      scrollToBottom();
      toast.success('Sent');
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };
  
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`);
        await handleFileUpload(file);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setIsRecording(false);
        }
      }, 30000);
    } catch (error) {
      toast.error('Microphone access needed');
    }
  };
  
  const stopVoiceRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      editingMessage ? editMessage() : sendMessage();
    }
  };
  
  const searchUsers = async (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api.get('/chat/search', { params: { q: query } });
      setSearchResults(res.data || []);
    } catch (error) {
      console.error('Search error:', error);
    }
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
      if (isMobile) setShowChatArea(true);
    } catch (error) {
      toast.error('Failed to start chat');
    }
  };
  
  const selectChat = (chat) => {
    setSelectedChat(chat);
    fetchMessages(chat.id);
    if (isMobile) setShowChatArea(true);
  };
  
  const goBackToChatList = () => {
    setShowChatArea(false);
    setSelectedChat(null);
    setReplyingTo(null);
    setEditingMessage(null);
  };
  
  const initiateCall = async (isVideo = true) => {
    const other = getOtherParticipant();
    if (!other) return toast.error('User not found');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
      setLocalStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      setPeerConnection(pc);
      
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('call:ice-candidate', { candidate: event.candidate, to: other.id });
        }
      };
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit('call:offer', { to: other.id, fromName: user.fullName, offer, isVideo });
      setIsCalling(true);
      toast.success(`Calling ${other.fullName}...`);
    } catch (err) {
      toast.error('Camera/Microphone access needed');
    }
  };
  
  const acceptCall = async () => {
    if (!incomingCall) return;
    if (window.currentRingtone) {
      window.currentRingtone.pause();
      window.currentRingtone = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: incomingCall.isVideo, audio: true });
      setLocalStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      setPeerConnection(pc);
      
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('call:ice-candidate', { candidate: event.candidate, to: incomingCall.fromId });
        }
      };
      
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('call:answer', { to: incomingCall.fromId, answer });
      setIsCallActive(true);
      setIncomingCall(null);
      toast.success('Call connected');
      
      let seconds = 0;
      callTimerRef.current = setInterval(() => {
        seconds++;
        setCallDuration(seconds);
      }, 1000);
    } catch (err) {
      toast.error('Failed to accept call');
    }
  };
  
  const declineCall = () => {
    if (window.currentRingtone) {
      window.currentRingtone.pause();
      window.currentRingtone = null;
    }
    if (incomingCall) {
      socket.emit('call:reject', { to: incomingCall.fromId });
      setIncomingCall(null);
      toast.success('Call declined');
    }
  };
  
  const endCall = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (remoteStream) remoteStream.getTracks().forEach(t => t.stop());
    setIsCallActive(false);
    setIsCalling(false);
    setCallDuration(0);
    if (selectedChat && getOtherParticipant()) {
      socket.emit('call:end', { to: getOtherParticipant().id });
    }
  };
  
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!isMuted);
    }
  };
  
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsVideoOff(!isVideoOff);
    }
  };
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const MessageStatus = ({ message, isOwn }) => {
    if (!isOwn) return null;
    if (message.isRead) return <span className="text-[10px] text-gray-400">Seen</span>;
    return <span className="text-[10px] text-gray-400">Sent</span>;
  };
  
  const AudioPlayer = ({ audioUrl, messageId }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(null);
    
    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.addEventListener('loadedmetadata', () => setDuration(audioRef.current.duration));
        audioRef.current.addEventListener('timeupdate', () => {
          setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        });
        audioRef.current.addEventListener('ended', () => {
          setIsPlaying(false);
          setProgress(0);
          setPlayingAudioId(null);
        });
      }
    }, []);
    
    const togglePlay = () => {
      if (playingAudioId && playingAudioId !== messageId) {
        if (audioRefs.current[playingAudioId]) {
          audioRefs.current[playingAudioId].pause();
          audioRefs.current[playingAudioId].currentTime = 0;
        }
      }
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        setPlayingAudioId(null);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
        setPlayingAudioId(messageId);
      }
    };
    
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center">
          {isPlaying ? <FaPause size={12} className="text-white" /> : <FaPlay size={12} className="text-white ml-0.5" />}
        </button>
        <div className="flex-1">
          <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className="text-xs text-gray-500 min-w-[40px]">{duration ? `${Math.floor(duration)}s` : '0:00'}</span>
        <audio ref={audioRef} src={audioUrl} />
      </div>
    );
  };
  
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  
  const otherUser = getOtherParticipant();
  
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-100 dark:bg-gray-900">
      {/* Chat List Sidebar */}
      <div className={`${isMobile && showChatArea ? 'hidden' : 'flex'} flex-col w-full md:w-96 bg-white dark:bg-gray-800 border-r dark:border-gray-700 h-full`}>
        <div className="p-4 border-b dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Chats</h1>
            <button onClick={() => setShowSearch(!showSearch)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
              <FaUserPlus className="text-green-500" size={20} />
            </button>
          </div>
          {showSearch && (
            <div className="mt-3">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
                  className="w-full pl-10 pr-4 py-2 border rounded-full focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute mt-1 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700 z-10 max-h-60 overflow-y-auto">
                  {searchResults.map(user => (
                    <button
                      key={user.id}
                      onClick={() => startChat(user.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold">
                        {getInitials(user.fullName)}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-gray-800 dark:text-white">{user.fullName}</p>
                        <p className="text-xs text-gray-500">{user.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <FaComment size={48} className="mb-3 opacity-50" />
              <p>No chats yet</p>
              <button onClick={() => setShowSearch(true)} className="mt-3 text-green-500 text-sm font-medium">
                Start a conversation
              </button>
            </div>
          ) : (
            chats.map(chat => {
              const other = chat.participants?.find(p => p.userId !== user.id)?.user;
              const lastMsg = chat.messages?.[0];
              const unread = chat.messages?.filter(m => !m.isRead && m.senderId !== user.id).length || 0;
              const isActive = selectedChat?.id === chat.id;
              
              return (
                <button
                  key={chat.id}
                  onClick={() => selectChat(chat)}
                  className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition border-b dark:border-gray-700 ${isActive && !isMobile ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center text-white font-bold shadow-sm">
                    {getInitials(other?.fullName)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className="font-semibold text-gray-800 dark:text-white truncate">{other?.fullName}</p>
                      {lastMsg && (
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                          {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {lastMsg?.content || (lastMsg?.fileType?.startsWith('audio/') ? '🎤 Voice message' : lastMsg?.fileType?.startsWith('video/') ? '📹 Video' : lastMsg?.fileType?.startsWith('image/') ? '📷 Photo' : 'No messages yet')}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
      
      {/* Chat Area */}
      <div className={`${isMobile && !showChatArea ? 'hidden' : 'flex'} flex-1 flex-col bg-gray-50 dark:bg-gray-900`}>
        {selectedChat && otherUser ? (
          <>
            {/* Chat Header */}
            <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button onClick={goBackToChatList} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <FaArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
                  </button>
                )}
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center text-white font-bold">
                  {getInitials(otherUser.fullName)}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800 dark:text-white">{otherUser.fullName}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {isTyping ? <span className="text-green-500">Typing...</span> : otherUser.role}
                  </p>
                </div>
              </div>
              <button
                onClick={() => initiateCall(true)}
                disabled={isCalling || isCallActive}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 hover:text-green-500"
              >
                <FaVideoCall size={20} />
              </button>
            </div>
            
            {/* Reply Preview */}
            {replyingTo && (
              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-l-4 border-green-500 flex justify-between items-center">
                <div className="flex-1">
                  <p className="text-xs text-green-600 font-semibold">Replying to</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{replyingTo.content || 'Media'}</p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                  <FaTimes size={12} className="text-gray-500" />
                </button>
              </div>
            )}
            
            {/* Edit Preview */}
            {editingMessage && (
              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-l-4 border-blue-500 flex justify-between items-center">
                <div className="flex-1">
                  <p className="text-xs text-blue-600 font-semibold">Editing</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{editingMessage.content}</p>
                </div>
                <button onClick={() => { setEditingMessage(null); setInput(''); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                  <FaTimes size={12} className="text-gray-500" />
                </button>
              </div>
            )}
            
            {/* Messages Container */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-3"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <FaComment size={48} className="mb-3 opacity-30" />
                  <p>No messages yet</p>
                  <p className="text-sm">Send a message to start the conversation</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.senderId === user.id;
                  const isAudio = msg.fileType?.startsWith('audio/');
                  const isVideo = msg.fileType?.startsWith('video/');
                  const isImage = msg.fileType?.startsWith('image/');
                  const repliedTo = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} message-item group relative`}
                    >
                      <div
                        className={`max-w-[75%] px-4 py-2 rounded-2xl relative ${
                          isOwn
                            ? 'bg-green-500 text-white rounded-br-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-white shadow-md rounded-bl-sm'
                        }`}
                      >
                        {repliedTo && (
                          <div className={`text-xs mb-1 p-1 rounded ${isOwn ? 'bg-green-600' : 'bg-gray-100 dark:bg-gray-700'} opacity-75`}>
                            <p className="font-semibold">↳ {repliedTo.senderId === user.id ? 'You' : repliedTo.sender?.fullName}</p>
                            <p className="truncate">{repliedTo.content || 'Media'}</p>
                          </div>
                        )}
                        
                        {msg.content && <p className="text-sm break-words">{msg.content}</p>}
                        
                        {msg.fileUrl && (
                          <>
                            {isImage && (
                              <img
                                src={msg.fileUrl}
                                alt=""
                                className="max-w-full rounded mt-1 max-h-60 cursor-pointer"
                                onClick={() => window.open(msg.fileUrl)}
                              />
                            )}
                            {isVideo && (
                              <video controls className="max-w-full rounded mt-1 max-h-60">
                                <source src={msg.fileUrl} />
                              </video>
                            )}
                            {isAudio && <AudioPlayer audioUrl={msg.fileUrl} messageId={msg.id} />}
                          </>
                        )}
                        
                        {msg.reaction && (
                          <div className="absolute -top-3 -right-2 text-lg">{msg.reaction}</div>
                        )}
                        
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className={`text-[10px] ${isOwn ? 'text-green-200' : 'text-gray-400'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <MessageStatus message={msg} isOwn={isOwn} />
                        </div>
                        
                        {/* Desktop Hover Actions */}
                        {!isMobile && (
                          <div className="absolute -top-8 right-0 bg-white dark:bg-gray-800 rounded-full shadow-lg flex gap-1 p-1 opacity-0 group-hover:opacity-100 transition z-10">
                            <button onClick={() => handleReplyClick(msg)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Reply">
                              <FaReply size={12} className="text-gray-600" />
                            </button>
                            {isOwn && (
                              <>
                                <button onClick={() => handleEditClick(msg)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Edit">
                                  <FaEdit size={12} className="text-gray-600" />
                                </button>
                                <button onClick={() => { setSelectedMessage(msg); setShowDeleteConfirm(true); }} className="p-1.5 hover:bg-red-100 rounded-full" title="Delete">
                                  <FaTrash size={12} className="text-red-500" />
                                </button>
                              </>
                            )}
                            <button onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="React">
                              <FaSmile size={12} className="text-gray-600" />
                            </button>
                          </div>
                        )}
                        
                        {showReactionPicker === msg.id && (
                          <ReactionPicker onSelect={(r) => handleReaction(msg.id, r)} onClose={() => setShowReactionPicker(null)} />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-20 right-4 bg-green-500 text-white rounded-full p-2 shadow-lg hover:bg-green-600 transition z-10"
              >
                <FaArrowDown size={16} />
              </button>
            )}
            
            {/* Message Input */}
            <div className="bg-white dark:bg-gray-800 border-t dark:border-gray-700 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-500 hover:text-green-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FaPaperclip size={20} />
                </button>
                <button
                  onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                  className={`p-2 rounded-full transition ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-gray-500 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  {isRecording ? <FaStop size={16} /> : <FaMicrophone size={20} />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }}
                />
                <div className="flex-1">
                  <textarea
                    value={input}
                    onChange={handleTyping}
                    onKeyPress={handleKeyPress}
                    placeholder="Message..."
                    rows="1"
                    className="w-full px-4 py-2 border dark:border-gray-600 rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-gray-50 dark:bg-gray-700 dark:text-white"
                    style={{ maxHeight: '100px' }}
                  />
                </div>
                <button
                  onClick={editingMessage ? editMessage : sendMessage}
                  disabled={(!input.trim() && !editingMessage) || sending}
                  className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 transition shadow-md"
                >
                  <FaPaperPlane size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <FaComment size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Select a chat</p>
              <p className="text-sm">Choose a conversation to start messaging</p>
              <button onClick={() => setShowSearch(true)} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600">
                Find Users
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedMessage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Delete Message</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Are you sure you want to delete this message?</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setSelectedMessage(null); }} className="flex-1 px-4 py-2 border rounded-lg text-gray-700 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={deleteMessage} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Video Call Modal */}
      {isCallActive && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex-1 relative">
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-4 right-4 w-32 h-48 bg-black rounded-lg overflow-hidden border-2 border-white">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="absolute top-4 left-4 text-white bg-black/50 px-3 py-1 rounded-full text-sm">
              {otherUser?.fullName} • {formatDuration(callDuration)}
            </div>
          </div>
          <div className="bg-black/90 p-4 flex justify-center gap-4">
            <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center ${isMuted ? 'bg-red-500' : 'bg-gray-700'}`}>
              {isMuted ? <FaMicrophoneSlash size={20} className="text-white" /> : <FaMicrophone size={20} className="text-white" />}
            </button>
            <button onClick={toggleVideo} className={`w-12 h-12 rounded-full flex items-center justify-center ${isVideoOff ? 'bg-red-500' : 'bg-gray-700'}`}>
              {isVideoOff ? <FaVideoSlash size={20} className="text-white" /> : <FaVideoCall size={20} className="text-white" />}
            </button>
            <button onClick={endCall} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
              <FaPhoneSlash size={20} className="text-white" />
            </button>
          </div>
        </div>
      )}
      
      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaPhoneAlt className="text-green-500 text-3xl animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Incoming Call</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-1 text-lg font-semibold">{incomingCall.fromName}</p>
              <p className="text-sm text-gray-500 mb-6">{incomingCall.isVideo ? 'Video call' : 'Voice call'}</p>
              <div className="flex gap-4 justify-center">
                <button onClick={acceptCall} className="px-6 py-2 bg-green-500 text-white rounded-full font-semibold flex items-center gap-2">
                  <FaPhone size={16} /> Accept
                </button>
                <button onClick={declineCall} className="px-6 py-2 bg-red-500 text-white rounded-full font-semibold flex items-center gap-2">
                  <FaPhoneSlash size={16} /> Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;