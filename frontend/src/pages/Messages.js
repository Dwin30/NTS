import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { io } from 'socket.io-client';
import { 
  FaPaperPlane, FaSearch, FaUserPlus, FaComment, FaCheck, FaCheckDouble, 
  FaTrash, FaEdit, FaReply, FaTimes, FaPaperclip,
  FaArrowLeft, FaVideo as FaVideoCall, FaMicrophone, FaMicrophoneSlash,
  FaVideoSlash, FaPhoneSlash, FaArrowDown, FaPlay, FaPause,
  FaPhone, FaPhoneAlt, FaEllipsisV, FaStop
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../services/api';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://nts-backend-409a.onrender.com';

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
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  
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
  
  // Handle mobile back button
  useEffect(() => {
    const handlePopState = () => {
      if (isMobile && showChatArea) {
        goBackToChatList();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobile, showChatArea]);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) setShowChatArea(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Socket connection
  useEffect(() => {
    if (!token || !user) return;
    
    const newSocket = io(SOCKET_URL, { 
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    
    newSocket.on('connect', () => {
      console.log('Socket connected');
      newSocket.emit('user:online', { userId: user.id });
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('Socket error:', error);
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
  
  // Socket event listeners
  useEffect(() => {
    if (!socket) return;
    
    socket.on('message:received', (message) => {
      if (selectedChat?.id === message.chatId) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, { ...message, status: 'delivered' }];
        });
        setTimeout(() => scrollToBottom(), 100);
        socket.emit('message:delivered', { messageId: message.id, to: message.senderId });
      }
      fetchChats();
    });
    
    socket.on('message:delivered', ({ messageId }) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'delivered' } : msg
      ));
    });
    
    socket.on('message:seen', ({ messageId }) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'seen' } : msg
      ));
    });
    
    socket.on('message:updated', (updatedMessage) => {
      setMessages(prev => prev.map(msg => msg.id === updatedMessage.id ? updatedMessage : msg));
      fetchChats();
    });
    
    socket.on('message:deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      fetchChats();
    });
    
    socket.on('typing:start', ({ userId }) => {
      const otherUser = getOtherParticipant();
      if (otherUser && otherUser.id === userId) setIsTyping(true);
    });
    
    socket.on('typing:stop', ({ userId }) => {
      const otherUser = getOtherParticipant();
      if (otherUser && otherUser.id === userId) setIsTyping(false);
    });
    
    socket.on('call:incoming', (data) => {
      setIncomingCall(data);
      const audio = new Audio('/ringtone.mp3');
      audio.loop = true;
      audio.play().catch(e => console.log('Ringtone play failed'));
      window.currentRingtone = audio;
      toast.success(`${data.fromName} is calling...`);
    });
    
    socket.on('call:accepted', async ({ signal }) => {
      if (peerConnection && signal) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          setIsCallActive(true);
          setIsCalling(false);
          toast.success('Call connected');
          let seconds = 0;
          callTimerRef.current = setInterval(() => {
            seconds++;
            setCallDuration(seconds);
          }, 1000);
        } catch (error) {
          console.error('Error:', error);
        }
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
    
    socket.on('call:webrtc:signal', async ({ signal, from }) => {
      if (peerConnection) {
        try {
          if (signal.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('call:webrtc:signal', { signal: answer, to: from });
          } else if (signal.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          } else if (signal.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
          }
        } catch (error) {
          console.error('WebRTC error:', error);
        }
      }
    });
    
    return () => {
      socket.off('message:received');
      socket.off('message:delivered');
      socket.off('message:seen');
      socket.off('message:updated');
      socket.off('message:deleted');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('call:incoming');
      socket.off('call:accepted');
      socket.off('call:rejected');
      socket.off('call:ended');
      socket.off('call:webrtc:signal');
    };
  }, [socket, selectedChat]);
  
  const getOtherParticipant = useCallback(() => {
    if (!selectedChat || selectedChat.isGroup) return null;
    const participant = selectedChat.participants?.find(p => p.userId !== user.id);
    return participant?.user || participant;
  }, [selectedChat, user.id]);
  
  const fetchChats = async () => {
    try {
      const res = await api.get('/chat');
      const chatData = res.data || [];
      const validChats = chatData.filter(chat => {
        if (chat.isGroup) return true;
        const otherUser = chat.participants?.find(p => p.userId !== user.id)?.user;
        return otherUser && otherUser.fullName && otherUser.fullName !== 'Unknown';
      });
      setChats(validChats);
      const totalUnread = validChats.reduce((total, chat) => {
        return total + (chat.messages || []).filter(msg => !msg.isRead && msg.senderId !== user?.id).length;
      }, 0);
      setUnreadCount(totalUnread);
    } catch (error) {
      console.error('Failed to fetch chats', error);
    }
  };
  
  const fetchMessages = async (chatId) => {
    try {
      const res = await api.get(`/chat/${chatId}/messages`);
      const msgs = (res.data.messages || []).map(msg => ({
        ...msg,
        status: msg.seen ? 'seen' : msg.delivered ? 'delivered' : 'sent'
      }));
      setMessages(msgs);
      
      const unseenMessages = msgs.filter(msg => !msg.seen && msg.senderId !== user.id);
      unseenMessages.forEach(msg => {
        socket?.emit('message:seen', { messageId: msg.id, to: msg.senderId });
      });
      
      setTimeout(() => scrollToBottom(), 100);
    } catch (error) {
      console.error('Failed to fetch messages', error);
    }
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    }
  };
  
  const handleTyping = (e) => {
    setInput(e.target.value);
    const otherUser = getOtherParticipant();
    if (socket && otherUser) {
      socket.emit('typing:start', { receiverId: otherUser.id });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing:stop', { receiverId: otherUser.id });
      }, 1500);
    }
  };
  
  const sendMessage = async () => {
    if (!input.trim() || !selectedChat || sending) return;
    const otherUser = getOtherParticipant();
    setSending(true);
    try {
      const payload = { 
        chatId: selectedChat.id, 
        content: input, 
        receiverId: otherUser?.id 
      };
      if (replyingTo) payload.replyToId = replyingTo.id;
      
      const res = await api.post('/chat/messages', payload);
      const newMessage = { ...res.data, status: 'sent' };
      setMessages(prev => [...prev, newMessage]);
      setInput('');
      setReplyingTo(null);
      
      if (socket && otherUser) {
        socket.emit('message:send', { receiverId: otherUser.id, message: newMessage });
        setTimeout(() => {
          setMessages(prev => prev.map(msg => 
            msg.id === newMessage.id ? { ...msg, status: 'delivered' } : msg
          ));
        }, 500);
      }
      fetchChats();
      scrollToBottom();
    } catch (error) {
      console.error('Send error:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };
  
  const editMessage = async () => {
    if (!editingMessage || !input.trim()) return;
    try {
      const res = await api.put(`/chat/messages/${editingMessage.id}`, { content: input });
      const updatedMessage = res.data;
      setMessages(prev => prev.map(msg => msg.id === editingMessage.id ? updatedMessage : msg));
      setInput('');
      setEditingMessage(null);
      toast.success('Message edited');
    } catch (error) {
      console.error('Edit error:', error);
      toast.error('Failed to edit message');
    }
  };
  
  const deleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      await api.delete(`/chat/messages/${selectedMessage.id}`);
      setMessages(prev => prev.filter(msg => msg.id !== selectedMessage.id));
      setShowDeleteConfirm(false);
      setShowMessageOptions(false);
      setSelectedMessage(null);
      toast.success('Message deleted');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete message');
    }
  };
  
  const handleReplyClick = (message) => {
    setReplyingTo(message);
    setShowMessageOptions(false);
    document.querySelector('textarea')?.focus();
  };
  
  const handleEditClick = (message) => {
    setEditingMessage(message);
    setInput(message.content);
    setShowMessageOptions(false);
    document.querySelector('textarea')?.focus();
  };
  
  const handleFileUpload = async (file) => {
    if (!selectedChat) {
      toast.error('No chat selected');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const otherUser = getOtherParticipant();
      const res = await api.post('/chat/messages', { 
        chatId: selectedChat.id, 
        content: '', 
        receiverId: otherUser?.id,
        fileUrl: result.data.url,
        fileType: file.type,
        fileName: file.name
      });
      setMessages(prev => [...prev, { ...res.data, status: 'sent' }]);
      if (socket && otherUser) {
        socket.emit('message:send', { receiverId: otherUser.id, message: res.data });
      }
      scrollToBottom();
      toast.success('Sent');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload');
    } finally {
      setUploading(false);
    }
  };
  
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        await handleFileUpload(file);
        stream.getTracks().forEach(track => track.stop());
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
      toast.error('Please allow microphone access');
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
      const filteredResults = (res.data || []).filter(user => user.fullName && user.fullName !== 'Unknown');
      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Search failed', error);
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
    const otherUser = getOtherParticipant();
    if (!otherUser) {
      toast.error('User not found');
      return;
    }
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
          socket.emit('call:webrtc:signal', { signal: event.candidate, to: otherUser.id });
        }
      };
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit('call:webrtc:signal', { signal: offer, to: otherUser.id });
      socket.emit('call:start', { to: otherUser.id, from: user.id, fromName: user.fullName, isVideo });
      
      setIsCalling(true);
      toast.success(`Calling ${otherUser.fullName}...`);
    } catch (err) {
      toast.error('Please grant camera/microphone permissions');
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
          socket.emit('call:webrtc:signal', { signal: event.candidate, to: incomingCall.fromId });
        }
      };
      
      socket.emit('call:accept', { to: incomingCall.fromId, from: user.id });
      
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
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
    setIsCallActive(false);
    setIsCalling(false);
    setCallDuration(0);
  };
  
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMuted(!isMuted);
    }
  };
  
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
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
    if (message.status === 'seen') return <FaCheckDouble className="text-blue-500 text-xs" title="Seen" />;
    if (message.status === 'delivered') return <FaCheckDouble className="text-gray-400 text-xs" title="Delivered" />;
    return <FaCheck className="text-gray-400 text-xs" title="Sent" />;
  };
  
  const AudioPlayer = ({ audioUrl, messageId }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(null);
    
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
      audio.addEventListener('timeupdate', () => setProgress((audio.currentTime / audio.duration) * 100));
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setProgress(0);
        setPlayingAudioId(null);
      });
      return () => {
        audio.removeEventListener('loadedmetadata', () => {});
        audio.removeEventListener('timeupdate', () => {});
        audio.removeEventListener('ended', () => {});
      };
    }, []);
    
    const togglePlay = () => {
      if (playingAudioId && playingAudioId !== messageId) {
        const prev = audioRefs.current[playingAudioId];
        if (prev) { prev.pause(); prev.currentTime = 0; }
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
      <div className="flex items-center space-x-3 mt-1 min-w-[220px]">
        <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center">
          {isPlaying ? <FaPause size={16} className="text-white" /> : <FaPlay size={16} className="text-white ml-0.5" />}
        </button>
        <div className="flex-1"><div className="h-1.5 bg-gray-300 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all duration-100" style={{ width: `${progress}%` }} /></div></div>
        <span className="text-xs text-gray-500 min-w-[40px]">{duration ? `${Math.floor(duration)}s` : '0:00'}</span>
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
      </div>
    );
  };
  
  const getInitials = (name) => {
    if (!name || name === 'Unknown') return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  
  const otherUser = getOtherParticipant();
  
  return (
    <>
      <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden">
        {/* Chat List */}
        <div className={`${isMobile && showChatArea ? 'hidden' : 'flex'} flex-col w-full md:w-80 bg-white border-r shadow-sm h-full overflow-hidden`}>
          <div className="p-4 border-b bg-white sticky top-0 z-10">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-gray-800">Messages</h2>
              <button onClick={() => setShowSearch(!showSearch)} className="p-2 rounded-full hover:bg-gray-100">
                <FaUserPlus className="text-green-600" size={18} />
              </button>
            </div>
            {showSearch && (
              <div className="mb-3">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Search users..." 
                    value={searchQuery} 
                    onChange={(e) => { setSearchQuery(e.target.value); searchUsers(e.target.value); }} 
                    className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-green-500 text-sm" 
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute bg-white border rounded-xl shadow-lg mt-1 left-4 right-4 z-10 max-h-60 overflow-y-auto">
                    {searchResults.map(result => (
                      <button key={result.id} onClick={() => startChat(result.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-3 border-b">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-green-700 flex items-center justify-center text-white font-bold text-sm">
                          {getInitials(result.fullName)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{result.fullName}</p>
                          <p className="text-xs text-gray-500">{result.role}</p>
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
              <div className="text-center py-12 text-gray-400">
                <FaComment className="text-5xl mx-auto mb-3 opacity-50" />
                <p className="text-sm">No messages yet</p>
                <button onClick={() => setShowSearch(true)} className="block mx-auto mt-3 text-green-600 text-sm font-medium hover:underline">
                  Start a conversation
                </button>
              </div>
            ) : (
              chats.map(chat => {
                const other = !chat.isGroup ? chat.participants?.find(p => p.userId !== user.id)?.user : null;
                const lastMessage = chat.messages?.[0];
                const isActive = selectedChat?.id === chat.id;
                
                if (!other || !other.fullName || other.fullName === 'Unknown') return null;
                
                let lastMessageText = 'No messages yet';
                if (lastMessage?.content) lastMessageText = lastMessage.content;
                else if (lastMessage?.fileType?.startsWith('audio/')) lastMessageText = '🎤 Voice message';
                else if (lastMessage?.fileType?.startsWith('video/')) lastMessageText = '📹 Video';
                else if (lastMessage?.fileType?.startsWith('image/')) lastMessageText = '📷 Photo';
                
                return (
                  <button 
                    key={chat.id} 
                    onClick={() => selectChat(chat)} 
                    className={`w-full text-left p-4 hover:bg-gray-50 transition border-b ${isActive && !isMobile ? 'bg-green-50 border-l-4 border-l-green-600' : ''}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-green-700 flex items-center justify-center text-white font-bold shadow-sm">
                        {getInitials(other?.fullName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline">
                          <p className="font-semibold text-gray-800 truncate">{other?.fullName}</p>
                          {lastMessage && (
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                              {new Date(lastMessage.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{lastMessageText}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
        
        {/* Chat Area */}
        <div className={`${isMobile && !showChatArea ? 'hidden' : 'flex'} flex-1 flex-col bg-gray-50 relative h-full overflow-hidden`}>
          {selectedChat && otherUser ? (
            <>
              <div className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
                <div className="flex items-center space-x-3">
                  {isMobile && (
                    <button onClick={goBackToChatList} className="p-2 rounded-full hover:bg-gray-100 mr-2">
                      <FaArrowLeft size={18} className="text-gray-600" />
                    </button>
                  )}
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-green-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {getInitials(otherUser.fullName)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                        {otherUser.fullName}
                      </h3>
                      <p className="text-xs">
                        {isTyping ? <span className="text-green-600 animate-pulse">Typing...</span> : <span className="text-gray-500">{otherUser.role}</span>}
                      </p>
                    </div>
                  </div>
                </div>
                <button onClick={() => initiateCall(true)} disabled={isCalling || isCallActive} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-green-600 disabled:opacity-50">
                  <FaVideoCall size={18} />
                </button>
              </div>
              
              {/* Reply Preview */}
              {replyingTo && (
                <div className="bg-gray-100 px-4 py-2 border-l-4 border-green-500 flex justify-between items-center">
                  <div className="flex-1">
                    <p className="text-xs text-green-600 font-semibold">Replying to</p>
                    <p className="text-sm text-gray-600 truncate">{replyingTo.content || 'Media'}</p>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded-full">
                    <FaTimes size={12} />
                  </button>
                </div>
              )}
              
              {/* Edit Preview */}
              {editingMessage && (
                <div className="bg-gray-100 px-4 py-2 border-l-4 border-blue-500 flex justify-between items-center">
                  <div className="flex-1">
                    <p className="text-xs text-blue-600 font-semibold">Editing</p>
                    <p className="text-sm text-gray-600 truncate">{editingMessage.content}</p>
                  </div>
                  <button onClick={() => { setEditingMessage(null); setInput(''); }} className="p-1 hover:bg-gray-200 rounded-full">
                    <FaTimes size={12} />
                  </button>
                </div>
              )}
              
              <div 
                ref={messagesContainerRef} 
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3"
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <FaComment className="text-5xl mb-3 opacity-30" />
                    <p className="text-center text-sm">No messages yet</p>
                    <p className="text-xs">Send a message to start</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isOwn = message.senderId === user.id;
                    const isAudio = message.fileType?.startsWith('audio/');
                    const isVideo = message.fileType?.startsWith('video/');
                    const isImage = message.fileType?.startsWith('image/');
                    const repliedTo = message.replyToId ? messages.find(m => m.id === message.replyToId) : null;
                    
                    return (
                      <div 
                        key={message.id} 
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} message-item group relative`}
                      >
                        <div className={`max-w-[75%] px-4 py-2 rounded-2xl relative ${
                          isOwn ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                        }`}>
                          {repliedTo && (
                            <div className={`text-xs mb-1 p-1 rounded ${isOwn ? 'bg-green-700' : 'bg-gray-100'} opacity-75`}>
                              <p className="font-semibold">↳ {repliedTo.senderId === user.id ? 'You' : (repliedTo.sender?.fullName || 'User')}</p>
                              <p className="truncate">{repliedTo.content || 'Media'}</p>
                            </div>
                          )}
                          
                          {message.content && <p className="text-sm break-words">{message.content}</p>}
                          {message.fileUrl && (
                            <>
                              {isImage && (
                                <img src={message.fileUrl} alt="" className="max-w-full rounded mt-1 max-h-60 cursor-pointer" onClick={() => window.open(message.fileUrl)} />
                              )}
                              {isVideo && (
                                <video controls className="max-w-full rounded mt-1 max-h-60 w-full" playsInline>
                                  <source src={message.fileUrl} type={message.fileType} />
                                </video>
                              )}
                              {isAudio && (
                                <AudioPlayer audioUrl={message.fileUrl} messageId={message.id} />
                              )}
                            </>
                          )}
                          <div className="flex items-center justify-end space-x-1 mt-1">
                            <span className={`text-[10px] ${isOwn ? 'text-green-200' : 'text-gray-400'}`}>
                              {new Date(message.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            </span>
                            <MessageStatus message={message} isOwn={isOwn} />
                          </div>
                          
                          {/* Desktop Hover Actions */}
                          {!isMobile && (
                            <div className="absolute -top-8 right-0 bg-white rounded-full shadow-lg flex space-x-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <button onClick={() => handleReplyClick(message)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600" title="Reply">
                                <FaReply size={12} />
                              </button>
                              {isOwn && (
                                <>
                                  <button onClick={() => handleEditClick(message)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600" title="Edit">
                                    <FaEdit size={12} />
                                  </button>
                                  <button onClick={() => { setSelectedMessage(message); setShowDeleteConfirm(true); }} className="p-1.5 hover:bg-red-100 rounded-full text-red-500" title="Delete">
                                    <FaTrash size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          
                          {/* Mobile Action Button */}
                          {isMobile && (
                            <button onClick={() => { setSelectedMessage(message); setShowMessageOptions(true); }} className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <FaEllipsisV size={14} className="text-gray-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              
              {showScrollButton && (
                <button onClick={scrollToBottom} className="absolute bottom-20 right-4 bg-green-600 text-white rounded-full p-2 shadow-lg hover:bg-green-700 transition z-10">
                  <FaArrowDown size={16} />
                </button>
              )}
              
              <div className="bg-white border-t px-3 py-2 md:px-4 md:py-3 shadow-sm">
                <div className="flex items-end space-x-2">
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 text-gray-500 hover:text-green-600 rounded-full hover:bg-gray-100 disabled:opacity-50">
                    <FaPaperclip size={16} />
                  </button>
                  <button onClick={isRecording ? stopVoiceRecording : startVoiceRecording} disabled={uploading} className={`p-2 rounded-full transition ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-gray-500 hover:text-green-600 hover:bg-gray-100'} disabled:opacity-50`}>
                    {isRecording ? <FaStop size={14} /> : <FaMicrophone size={16} />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
                  <div className="flex-1">
                    <textarea 
                      value={input} 
                      onChange={handleTyping} 
                      onKeyPress={handleKeyPress} 
                      placeholder={editingMessage ? "Edit..." : replyingTo ? "Reply..." : "Type a message..."} 
                      rows="1" 
                      className="w-full px-3 py-2 border border-gray-200 rounded-2xl resize-none focus:ring-2 focus:ring-green-500 text-sm bg-gray-50" 
                      style={{ maxHeight: '80px' }} 
                    />
                  </div>
                  <button onClick={editingMessage ? editMessage : sendMessage} disabled={(!input.trim() && !editingMessage) || sending} className="p-2 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 transition shadow-sm">
                    <FaPaperPlane size={14} />
                  </button>
                </div>
                <div className="mt-1 text-[10px] md:text-xs text-gray-400 flex items-center space-x-3">
                  <span>📎 Attach</span>
                  <span>{isRecording ? '🔴 Recording...' : '🎙️ Voice'}</span>
                  <span>⌨️ Enter to send</span>
                  <span>↩️ Swipe reply</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center text-gray-400">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaComment className="text-3xl text-gray-300" />
                </div>
                <p className="text-base font-medium text-gray-500">No conversation selected</p>
                <p className="text-xs mt-1">Choose a chat or start a new one</p>
                <button onClick={() => setShowSearch(true)} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700">
                  Find Students
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Message Options Modal */}
      {showMessageOptions && selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center" onClick={() => setShowMessageOptions(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4">
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>
              <button onClick={() => handleReplyClick(selectedMessage)} className="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center space-x-3">
                <FaReply className="text-green-600" />
                <span>Reply</span>
              </button>
              {selectedMessage.senderId === user.id && (
                <>
                  <button onClick={() => handleEditClick(selectedMessage)} className="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center space-x-3">
                    <FaEdit className="text-blue-600" />
                    <span>Edit</span>
                  </button>
                  <button onClick={() => { setShowMessageOptions(false); setShowDeleteConfirm(true); }} className="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center space-x-3 text-red-600">
                    <FaTrash />
                    <span>Delete</span>
                  </button>
                </>
              )}
              <button onClick={() => setShowMessageOptions(false)} className="w-full text-center px-4 py-3 hover:bg-gray-100 rounded-lg mt-2 font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Delete Message</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this message?</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setSelectedMessage(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={deleteMessage} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Video Call Modal */}
      {isCallActive && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex-1 relative bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-4 right-4 w-32 h-48 bg-black rounded-lg overflow-hidden shadow-lg border-2 border-white z-10">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="absolute top-4 left-4 text-white bg-black bg-opacity-50 px-3 py-1 rounded-full text-sm">
              {otherUser?.fullName} • {formatDuration(callDuration)}
            </div>
          </div>
          <div className="bg-black bg-opacity-90 p-4 flex justify-center space-x-4">
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
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaPhoneAlt className="text-green-600 text-3xl animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Incoming Call</h3>
              <p className="text-gray-600 mb-1 text-lg font-semibold">{incomingCall.fromName}</p>
              <p className="text-sm text-gray-500 mb-6">{incomingCall.isVideo ? 'Video call' : 'Voice call'}...</p>
              <div className="flex gap-4 justify-center">
                <button onClick={acceptCall} className="px-8 py-3 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 flex items-center gap-2">
                  <FaPhone size={16} /> Accept
                </button>
                <button onClick={declineCall} className="px-8 py-3 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 flex items-center gap-2">
                  <FaPhoneSlash size={16} /> Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Messages;