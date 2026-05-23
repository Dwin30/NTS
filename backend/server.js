const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

dotenv.config();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://nts_database_user:llGHTWUpCs9N2NqKTkPgdlh4d30UVmlp@dpg-d86ulv6k1jcs739msak0-a:5432/nts_database"
    }
  }
});

const app = express();
const server = http.createServer(app);

// ============ ALLOWED ORIGINS ============
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://exquisite-souffle-c3acd0.netlify.app",
  "https://polite-cucurucho-d21021.netlify.app",
  "https://nts-platform.netlify.app",
  "https://nts-iey7-dwin30s-projects.vercel.app",
  "https://nts-frontend.onrender.com",
  "https://*.netlify.app",
  "https://*.vercel.app",
  "https://*.onrender.com"
];

// ============ SOCKET.IO WITH FULL CORS ============
const io = socketIO(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling']
});

// ============ MULTER SETUP ============
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ============ EXPRESS CORS MIDDLEWARE ============
app.use(cors({ 
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin === allowed || origin.endsWith('.onrender.com') || origin.endsWith('.netlify.app') || origin.endsWith('.vercel.app'))) {
      callback(null, true);
    } else {
      console.log('Blocked CORS from:', origin);
      callback(null, true); // Allow anyway for testing
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use('/uploads', express.static(uploadDir));

// Handle preflight requests
app.options('*', cors());

// ============ AUTH MIDDLEWARE ============
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ AUTH ROUTES ============
app.post('/api/auth/register', async (req, res) => {
  const { email, fullName, password, role, phone, school } = req.body;
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email, fullName, passwordHash,
        role: role || 'STUDENT',
        phone: phone || null,
        school: school || null,
        otpCode: otp,
        otpExpiresAt,
        isVerified: false
      }
    });
    
    res.status(201).json({ message: 'Registration successful! OTP sent', userId: user.id, email: user.email });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isVerified) return res.status(400).json({ error: 'Already verified' });
    if (user.otpCode !== otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (new Date() > user.otpExpiresAt) return res.status(400).json({ error: 'OTP expired' });
    
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, otpCode: null, otpExpiresAt: null }
    });
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio, phone: user.phone, school: user.school, postsCount: user.postsCount || 0, followersCount: user.followersCount || 0, followingCount: user.followingCount || 0 } });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isVerified) return res.status(401).json({ error: 'Please verify your email first' });
    
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    await prisma.user.update({ where: { id: user.id }, data: { lastSeen: new Date() } });
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio, phone: user.phone, school: user.school, postsCount: user.postsCount || 0, followersCount: user.followersCount || 0, followingCount: user.followingCount || 0 } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    await prisma.user.update({ where: { id: user.id }, data: { otpCode: otp, otpExpiresAt } });
    res.json({ message: 'Reset code sent to your email' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send reset code' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.otpCode !== otp) return res.status(400).json({ error: 'Invalid code' });
    if (new Date() > user.otpExpiresAt) return res.status(400).json({ error: 'Code expired' });
    
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, otpCode: null, otpExpiresAt: null } });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============ FILE UPLOAD ============
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename, originalName: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
});

// ============ USER PROFILE ROUTES ============
app.get('/api/users/profile/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  try {
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true, avatar: true, bio: true, phone: true, school: true, postsCount: true, followersCount: true, followingCount: true, createdAt: true }
    });
    if (!userProfile) return res.status(404).json({ error: 'User not found' });
    res.json(userProfile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/profile', authenticate, async (req, res) => {
  const { fullName, bio, phone, school, avatar } = req.body;
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { fullName: fullName || undefined, bio: bio || undefined, phone: phone || undefined, school: school || undefined, avatar: avatar || undefined }
    });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/suggested', authenticate, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: req.user.id } },
      select: { id: true, fullName: true, avatar: true, role: true },
      take: 10
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ POST ROUTES ============
app.get('/api/posts/feed', authenticate, async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: { author: { select: { id: true, fullName: true, avatar: true, role: true } } },
      orderBy: { createdAt: 'desc' }
    });
    
    const postsWithCounts = await Promise.all(posts.map(async (post) => {
      const likeCount = await prisma.like.count({ where: { postId: post.id } });
      const commentCount = await prisma.comment.count({ where: { postId: post.id } });
      const userLike = await prisma.like.findFirst({ where: { userId: req.user.id, postId: post.id } });
      return { ...post, isLiked: !!userLike, likesCount: likeCount, commentsCount: commentCount, sharesCount: 0 };
    }));
    res.json(postsWithCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts', authenticate, async (req, res) => {
  const { content, imageUrl } = req.body;
  if (!content || content.trim() === '') return res.status(400).json({ error: 'Content is required' });
  
  try {
    const post = await prisma.post.create({
      data: { content, imageUrl: imageUrl || null, authorId: req.user.id },
      include: { author: { select: { id: true, fullName: true, avatar: true, role: true } } }
    });
    await prisma.user.update({ where: { id: req.user.id }, data: { postsCount: { increment: 1 } } });
    const newPost = { ...post, isLiked: false, likesCount: 0, commentsCount: 0, sharesCount: 0 };
    io.emit('post:created', newPost);
    res.status(201).json(newPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/posts/:postId', authenticate, async (req, res) => {
  const { postId } = req.params;
  try {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not authorized' });
    
    await prisma.like.deleteMany({ where: { postId } });
    await prisma.comment.deleteMany({ where: { postId } });
    await prisma.post.delete({ where: { id: postId } });
    await prisma.user.update({ where: { id: post.authorId }, data: { postsCount: { decrement: 1 } } });
    io.emit('post:deleted', postId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/posts/:postId', authenticate, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  try {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { content },
      include: { author: { select: { id: true, fullName: true, avatar: true, role: true } } }
    });
    io.emit('post:edited', updatedPost);
    res.json(updatedPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts/:postId/like', authenticate, async (req, res) => {
  const { postId } = req.params;
  try {
    const existingLike = await prisma.like.findFirst({ where: { userId: req.user.id, postId } });
    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      res.json({ liked: false });
    } else {
      await prisma.like.create({ data: { userId: req.user.id, postId } });
      res.json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COMMENT ROUTES ============
app.post('/api/posts/:postId/comments', authenticate, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  if (!content || content.trim() === '') return res.status(400).json({ error: 'Comment content is required' });
  
  try {
    const comment = await prisma.comment.create({
      data: { content, authorId: req.user.id, postId },
      include: { author: { select: { id: true, fullName: true, avatar: true } } }
    });
    io.emit('comment:added', { postId, comment });
    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/posts/:postId/comments', authenticate, async (req, res) => {
  const { postId } = req.params;
  try {
    const comments = await prisma.comment.findMany({
      where: { postId },
      include: { author: { select: { id: true, fullName: true, avatar: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/posts/:postId/comments/:commentId', authenticate, async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;
  try {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.authorId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not authorized' });
    
    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { content, isEdited: true, editedAt: new Date() },
      include: { author: { select: { id: true, fullName: true, avatar: true } } }
    });
    io.emit('comment:edited', { postId: comment.postId, comment: updatedComment });
    res.json(updatedComment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/posts/:postId/comments/:commentId', authenticate, async (req, res) => {
  const { postId, commentId } = req.params;
  try {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.authorId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not authorized' });
    
    await prisma.comment.delete({ where: { id: commentId } });
    io.emit('comment:deleted', { postId, commentId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SHARE POST ROUTE ============
app.post('/api/posts/:postId/share', authenticate, async (req, res) => {
  const { postId } = req.params;
  try {
    const originalPost = await prisma.post.findUnique({ where: { id: postId } });
    if (!originalPost) return res.status(404).json({ error: 'Post not found' });
    
    const sharedPost = await prisma.post.create({
      data: {
        content: `Shared a post: ${originalPost.content.substring(0, 100)}...`,
        imageUrl: originalPost.imageUrl,
        authorId: req.user.id,
        isShared: true,
        originalPostId: postId
      },
      include: { author: { select: { id: true, fullName: true, avatar: true, role: true } } }
    });
    
    await prisma.user.update({ where: { id: req.user.id }, data: { postsCount: { increment: 1 } } });
    await prisma.post.update({ where: { id: postId }, data: { sharesCount: { increment: 1 } } });
    
    io.emit('post:created', sharedPost);
    res.status(201).json(sharedPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ CHAT ROUTES ============
app.get('/api/chat', authenticate, async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { participants: { some: { userId: req.user.id } } },
      include: {
        participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } },
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, fullName: true } } }
        }
      }
    });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/private/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  try {
    let chat = await prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: req.user.id } } },
          { participants: { some: { userId: userId } } }
        ]
      },
      include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
    });
    
    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          isGroup: false,
          participants: { create: [{ userId: req.user.id }, { userId: userId }] }
        },
        include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
      });
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

app.post('/api/chat/group', authenticate, async (req, res) => {
  const { name, participantIds } = req.body;
  try {
    const chat = await prisma.chat.create({
      data: {
        name,
        isGroup: true,
        participants: { create: [{ userId: req.user.id }, ...participantIds.map(id => ({ userId: id }))] }
      },
      include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
    });
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.post('/api/chat/group/:chatId/add', authenticate, async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.body;
  try {
    await prisma.chatParticipant.create({ data: { chatId, userId } });
    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
    });
    io.emit('group:updated', updatedChat);
    res.json(updatedChat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.get('/api/chat/:chatId/messages', authenticate, async (req, res) => {
  const { chatId } = req.params;
  const { limit = 50, cursor } = req.query;
  try {
    const messages = await prisma.message.findMany({
      where: { chatId, isDeleted: false },
      include: {
        sender: { select: { id: true, fullName: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, fullName: true } } } }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      ...(cursor && { skip: 1, cursor: { id: cursor } })
    });
    res.json({ messages: messages.reverse(), nextCursor: messages.length === parseInt(limit) ? messages[0]?.id : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/messages', authenticate, async (req, res) => {
  const { chatId, content, receiverId, fileUrl, fileType, fileName, replyToId } = req.body;
  try {
    const message = await prisma.message.create({
      data: { content: content || '', senderId: req.user.id, receiverId, chatId, fileUrl, fileType, fileName, replyToId, isRead: false, isDeleted: false },
      include: { sender: { select: { id: true, fullName: true, avatar: true } }, replyTo: { include: { sender: { select: { id: true, fullName: true } } } } }
    });
    io.to(`user:${receiverId}`).emit('message:received', message);
    if (chatId) {
      const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { participants: true } });
      chat?.participants.forEach(p => {
        if (p.userId !== req.user.id) io.to(`user:${p.userId}`).emit('message:received', message);
      });
    }
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/chat/messages/:messageId', authenticate, async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.senderId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true, editedAt: new Date() },
      include: { sender: { select: { id: true, fullName: true, avatar: true } }, replyTo: { include: { sender: { select: { id: true, fullName: true } } } } }
    });
    io.to(`user:${message.receiverId}`).emit('message:updated', updatedMessage);
    res.json(updatedMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/chat/messages/:messageId', authenticate, async (req, res) => {
  const { messageId } = req.params;
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.senderId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not authorized' });
    
    await prisma.message.update({ where: { id: messageId }, data: { isDeleted: true, deletedBy: req.user.id } });
    io.to(`user:${message.receiverId}`).emit('message:deleted', { messageId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ MESSAGE REACTIONS ============
app.post('/api/chat/messages/:messageId/react', authenticate, async (req, res) => {
  const { messageId } = req.params;
  const { reaction } = req.body;
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    
    let reactions = message.reactions || {};
    if (reactions[req.user.id] === reaction) {
      delete reactions[req.user.id];
    } else {
      reactions[req.user.id] = reaction;
    }
    
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { reactions: JSON.stringify(reactions) },
      include: { sender: { select: { id: true, fullName: true } } }
    });
    
    io.to(`user:${message.senderId}`).emit('message:reacted', { messageId, reactions });
    res.json({ success: true, reactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/messages/:messageId/delivered', authenticate, async (req, res) => {
  const { messageId } = req.params;
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    await prisma.message.update({ where: { id: messageId }, data: { deliveredAt: new Date() } });
    io.to(`user:${message.senderId}`).emit('message:delivered', { messageId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/messages/:messageId/seen', authenticate, async (req, res) => {
  const { messageId } = req.params;
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    await prisma.message.update({ where: { id: messageId }, data: { isRead: true, readAt: new Date() } });
    io.to(`user:${message.senderId}`).emit('message:seen', { messageId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chat/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: req.user.id }, OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, fullName: true, email: true, avatar: true, role: true },
      take: 20
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ INTERNSHIP ROUTES ============
app.get('/api/internships', authenticate, async (req, res) => {
  try {
    const internships = await prisma.internship.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(internships);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/internships', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { title, company, description, location, duration, stipend, deadline, tradeId } = req.body;
  if (!title || !company || !description || !deadline) return res.status(400).json({ error: 'Missing required fields' });
  
  try {
    const internship = await prisma.internship.create({
      data: { title, company, description, location: location || null, duration: parseInt(duration) || 3, stipend: parseInt(stipend) || 0, deadline: new Date(deadline), tradeId: tradeId ? parseInt(tradeId) : null, isActive: true }
    });
    res.status(201).json(internship);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/internships/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { id } = req.params;
  try {
    await prisma.internship.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/internships/:id/apply', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await prisma.internshipApplication.findFirst({ where: { studentId: req.user.id, internshipId: id } });
    if (existing) return res.status(400).json({ error: 'Already applied' });
    const application = await prisma.internshipApplication.create({ data: { studentId: req.user.id, internshipId: id } });
    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN ROUTES ============
app.get('/api/admin/users', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/users/:userId/role', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { userId } = req.params;
  const { role } = req.body;
  try {
    const updatedUser = await prisma.user.update({ where: { id: userId }, data: { role } });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/users/:userId', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { userId } = req.params;
  const { fullName, phone, school, role, bio } = req.body;
  try {
    const updatedUser = await prisma.user.update({ where: { id: userId }, data: { fullName, phone: phone || null, school: school || null, role, bio: bio || null } });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:userId', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { userId } = req.params;
  try {
    await prisma.user.delete({ where: { id: userId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/applications', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  try {
    const applications = await prisma.internshipApplication.findMany({ include: { student: true, internship: true }, orderBy: { appliedAt: 'desc' } });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/applications/:applicationId/status', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { applicationId } = req.params;
  const { status } = req.body;
  try {
    const updated = await prisma.internshipApplication.update({ where: { id: applicationId }, data: { status, reviewedAt: new Date() } });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'ADMIN') {
      const [students, trainers, posts, internships] = await Promise.all([
        prisma.user.count({ where: { role: 'STUDENT' } }),
        prisma.user.count({ where: { role: 'TRAINER' } }),
        prisma.post.count(),
        prisma.internship.count()
      ]);
      res.json({ students, trainers, posts, internships });
    } else {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const applications = await prisma.internshipApplication.count({ where: { studentId: req.user.id } });
      res.json({ applications, posts: user.postsCount, followers: user.followersCount, following: user.followingCount });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COURSE/TRADE ROUTES ============
app.get('/api/trades', authenticate, async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({ include: { modules: true } });
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { name, description, icon, color } = req.body;
  try {
    const trade = await prisma.trade.create({ data: { name, description, icon, color } });
    res.status(201).json(trade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/modules', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { tradeId, level, code, name, description } = req.body;
  try {
    const module = await prisma.module.create({ data: { tradeId: parseInt(tradeId), level: parseInt(level), code, name, description } });
    res.status(201).json(module);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/trades/:tradeId', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { tradeId } = req.params;
  try {
    await prisma.module.deleteMany({ where: { tradeId: parseInt(tradeId) } });
    await prisma.trade.delete({ where: { id: parseInt(tradeId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/modules/:moduleId', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  const { moduleId } = req.params;
  try {
    await prisma.module.delete({ where: { id: parseInt(moduleId) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADDITIONAL ROUTES ============
app.get('/api/my-applications', authenticate, async (req, res) => {
  try {
    const applications = await prisma.internshipApplication.findMany({ where: { studentId: req.user.id }, include: { internship: true } });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/applications/:applicationId', authenticate, async (req, res) => {
  const { applicationId } = req.params;
  try {
    const application = await prisma.internshipApplication.findUnique({ where: { id: applicationId } });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.studentId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not authorized' });
    await prisma.internshipApplication.delete({ where: { id: applicationId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/contact', authenticate, async (req, res) => {
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, fullName: true, email: true } });
    if (!admin) return res.status(404).json({ error: 'No admin found' });
    res.json(admin);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SOCKET.IO ============
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 User ${socket.userId} connected`);
  onlineUsers.set(socket.userId, socket.id);
  socket.join(`user:${socket.userId}`);
  io.emit('users:online', Array.from(onlineUsers.keys()));

  socket.on('user:online', (data) => {
    onlineUsers.set(data.userId, socket.id);
    io.emit('users:online', Array.from(onlineUsers.keys()));
  });

  socket.on('user:offline', (data) => {
    onlineUsers.delete(data.userId);
    io.emit('users:online', Array.from(onlineUsers.keys()));
  });

  socket.on('message:send', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:received', data.message);
    }
  });

  socket.on('message:delivered', (data) => {
    const senderSocketId = onlineUsers.get(data.to);
    if (senderSocketId) {
      io.to(senderSocketId).emit('message:delivered', { messageId: data.messageId });
    }
  });

  socket.on('message:seen', (data) => {
    const senderSocketId = onlineUsers.get(data.to);
    if (senderSocketId) {
      io.to(senderSocketId).emit('message:seen', { messageId: data.messageId });
    }
  });

  socket.on('message:react', (data) => {
    const receiverSocketId = onlineUsers.get(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:reacted', { messageId: data.messageId, reaction: data.reaction });
    }
  });

  socket.on('typing:start', ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing:start', { userId: socket.userId });
    }
  });

  socket.on('typing:stop', ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing:stop', { userId: socket.userId });
    }
  });

  // Video Call Events
  socket.on('call:start', (data) => {
    const receiverSocketId = onlineUsers.get(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('call:incoming', { fromId: socket.userId, fromName: data.fromName, isVideo: data.isVideo });
    }
  });

  socket.on('call:accept', (data) => {
    const callerSocketId = onlineUsers.get(data.to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:accepted', { from: socket.userId });
    }
  });

  socket.on('call:reject', (data) => {
    const callerSocketId = onlineUsers.get(data.to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:rejected');
    }
  });

  socket.on('call:end', (data) => {
    const receiverSocketId = onlineUsers.get(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('call:ended');
    }
  });

  socket.on('call:webrtc:signal', (data) => {
    const receiverSocketId = onlineUsers.get(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('call:webrtc:signal', { signal: data.signal, from: socket.userId });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User ${socket.userId} disconnected`);
    onlineUsers.delete(socket.userId);
    io.emit('users:online', Array.from(onlineUsers.keys()));
  });
});

// ============ CREATE DEFAULT ADMIN ============
async function createDefaultAdmin() {
  try {
    const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@nts.rw' } });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('Admin123', 10);
      await prisma.user.create({
        data: { email: 'admin@nts.rw', fullName: 'System Administrator', passwordHash, role: 'ADMIN', isVerified: true }
      });
      console.log('✅ Default admin created: admin@nts.rw / Admin123');
    }
  } catch (error) {
    console.error('Failed to create default admin:', error.message);
  }
}

// ============ CREATE DEFAULT TRADES ============
async function createDefaultTrades() {
  try {
    const existingTrades = await prisma.trade.count();
    if (existingTrades === 0) {
      const trades = [
        { name: 'Software Development', description: 'Web and application development', icon: 'FaCode', color: 'bg-green-500' },
        { name: 'Networking & Internet Technologies', description: 'Network infrastructure and security', icon: 'FaNetworkWired', color: 'bg-blue-500' },
        { name: 'Computer Systems & Architecture', description: 'Hardware and system design', icon: 'FaMicrochip', color: 'bg-purple-500' },
        { name: 'Electronics & Telecommunication', description: 'Electronic systems and communication', icon: 'FaBroadcastTower', color: 'bg-yellow-500' },
        { name: 'Multimedia & Production', description: 'Video, audio, and graphic design', icon: 'FaVideo', color: 'bg-red-500' }
      ];
      for (const trade of trades) {
        await prisma.trade.create({ data: trade });
      }
      console.log('✅ Default trades created');
    }
  } catch (error) {
    console.error('Failed to create default trades:', error.message);
  }
}

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    await createDefaultAdmin();
    await createDefaultTrades();
    server.listen(PORT, () => {
      console.log(`🚀 NTS Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    server.listen(PORT, () => {
      console.log(`🚀 NTS Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();