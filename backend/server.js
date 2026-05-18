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

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
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

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/webm', 'application/pdf'];
  allowedTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// ============ MIDDLEWARE ============
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadDir));
app.set('prisma', prisma);
app.set('io', io);

// ============ AUTH MIDDLEWARE ============
const authenticate = async (req, res, next) => {
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

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, fullName, password, role, phone, school } = req.body;
  
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: { email, fullName, passwordHash, role: role || 'STUDENT', phone: phone || null, school: school || null, otpCode: otp, otpExpiresAt, isVerified: false }
    });
    
    console.log(`\n========================================`);
    console.log(`📧 OTP VERIFICATION CODE`);
    console.log(`Email: ${email}`);
    console.log(`OTP Code: ${otp}`);
    console.log(`========================================\n`);
    
    res.status(201).json({ message: 'Registration successful! Check terminal for OTP', userId: user.id, email: user.email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isVerified) return res.status(400).json({ error: 'Already verified' });
    if (user.otpCode !== otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (new Date() > user.otpExpiresAt) return res.status(400).json({ error: 'OTP expired' });
    
    await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, otpCode: null, otpExpiresAt: null } });
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio, phone: user.phone, school: user.school, postsCount: user.postsCount || 0, followersCount: user.followersCount || 0, followingCount: user.followingCount || 0 } });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isVerified) return res.status(401).json({ error: 'Verify email first' });
    
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    await prisma.user.update({ where: { id: user.id }, data: { lastSeen: new Date() } });
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio, phone: user.phone, school: user.school, postsCount: user.postsCount || 0, followersCount: user.followersCount || 0, followingCount: user.followingCount || 0 } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    await prisma.user.update({ where: { id: user.id }, data: { otpCode: otp, otpExpiresAt } });
    
    console.log(`\n========================================`);
    console.log(`🔐 PASSWORD RESET CODE`);
    console.log(`Email: ${email}`);
    console.log(`Reset Code: ${otp}`);
    console.log(`========================================\n`);
    
    res.json({ message: 'Reset code sent to your email' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send reset code' });
  }
});

// Reset Password
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

// Change Password
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
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`, filename: req.file.filename, originalName: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
});

// ============ USER PROFILE ROUTES ============

// Get profile
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

// Update profile
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

// Get suggested users
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

// Get feed posts
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

// Create post
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

// Delete post
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

// Edit post
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

// Like/Unlike post
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

// Add comment
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

// Get comments
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

// Edit comment
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

// Delete comment
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

// ============ CHAT ROUTES ============
// ============ CHAT ROUTES ============

// Get chats
app.get('/api/chat', authenticate, async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { participants: { some: { userId: req.user.id } } },
      include: {
        participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } },
        messages: { where: { isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true, fullName: true } } } }
      }
    });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create private chat (WORKING VERSION)
// Create private chat (YOUR ORIGINAL WORKING CODE)
app.post('/api/chat/private/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  
  try {
    let chat = await prisma.chat.findFirst({
      where: { isGroup: false, AND: [{ participants: { some: { userId: req.user.id } } }, { participants: { some: { userId } } }] },
      include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
    });
    
    if (!chat) {
      chat = await prisma.chat.create({
        data: { isGroup: false, participants: { create: [{ userId: req.user.id }, { userId }] } },
        include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
      });
    }
    
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages
app.get('/api/chat/:chatId/messages', authenticate, async (req, res) => {
  const { chatId } = req.params;
  
  try {
    const messages = await prisma.message.findMany({
      where: { chatId, isDeleted: false },
      include: { 
        sender: { select: { id: true, fullName: true, avatar: true } }, 
        replyTo: { include: { sender: { select: { id: true, fullName: true } } } } 
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message
app.post('/api/chat/messages', authenticate, async (req, res) => {
  const { chatId, content, receiverId, fileUrl, fileType, fileName, replyToId } = req.body;
  
  try {
    const message = await prisma.message.create({
      data: { 
        content: content || (fileUrl ? `📎 ${fileName || 'File'}` : ''), 
        senderId: req.user.id, 
        receiverId, 
        chatId, 
        fileUrl, 
        fileType, 
        fileName, 
        replyToId, 
        isRead: false, 
        isDeleted: false 
      },
      include: { 
        sender: { select: { id: true, fullName: true, avatar: true } }, 
        replyTo: { include: { sender: { select: { id: true, fullName: true } } } } 
      }
    });
    
    // Emit to receiver via Socket.IO
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:received', message);
    }
    
    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Edit message
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
      include: { 
        sender: { select: { id: true, fullName: true, avatar: true } }, 
        replyTo: { include: { sender: { select: { id: true, fullName: true } } } } 
      }
    });
    
    const receiverSocketId = onlineUsers.get(message.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:edited', updatedMessage);
    }
    io.to(`user:${message.senderId}`).emit('message:edited', updatedMessage);
    
    res.json(updatedMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete message
app.delete('/api/chat/messages/:messageId', authenticate, async (req, res) => {
  const { messageId } = req.params;
  
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.senderId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not authorized' });
    
    await prisma.message.update({ where: { id: messageId }, data: { isDeleted: true, deletedBy: req.user.id } });
    
    const receiverSocketId = onlineUsers.get(message.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:deleted', { messageId });
    }
    io.to(`user:${message.senderId}`).emit('message:deleted', { messageId });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark message as read
app.post('/api/chat/messages/:messageId/read', authenticate, async (req, res) => {
  const { messageId } = req.params;
  
  try {
    await prisma.message.update({
      where: { id: messageId },
      data: { isRead: true, readAt: new Date() }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search users
app.get('/api/chat/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  
  try {
    const users = await prisma.user.findMany({
      where: { 
        id: { not: req.user.id },
        OR: [
          { fullName: { contains: q } },
          { email: { contains: q } }
        ]
      },
      select: { id: true, fullName: true, email: true, avatar: true, role: true },
      take: 20
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ INTERNSHIP ROUTES ============

// Get internships
app.get('/api/internships', authenticate, async (req, res) => {
  try {
    const internships = await prisma.internship.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(internships);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create internship (admin only)
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

// Delete internship (admin only)
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

// Apply for internship
app.post('/api/internships/:id/apply', authenticate, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  
  try {
    const existing = await prisma.internshipApplication.findFirst({ where: { studentId: req.user.id, internshipId: id } });
    if (existing) return res.status(400).json({ error: 'Already applied' });
    
    const application = await prisma.internshipApplication.create({ data: { studentId: req.user.id, internshipId: id, message: message || null } });
    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN ROUTES ============

// Get all users
app.get('/api/admin/users', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user role
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

// Update user (full edit)
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

// Delete user
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

// Get all applications
app.get('/api/admin/applications', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  
  try {
    const applications = await prisma.internshipApplication.findMany({
      include: { student: true, internship: true },
      orderBy: { appliedAt: 'desc' }
    });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard stats
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
  
  // Send message
  socket.on('message:send', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:received', data.message);
    }
    // Also emit to sender to confirm
    io.to(`user:${data.message.senderId}`).emit('message:sent', data.message);
  });
  
  // Edit message
  socket.on('message:edit', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:edited', data.message);
    }
    io.to(`user:${data.message.senderId}`).emit('message:edited', data.message);
  });
  
  // Delete message
  socket.on('message:delete', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:deleted', { messageId: data.messageId });
    }
    io.to(`user:${data.senderId}`).emit('message:deleted', { messageId: data.messageId });
  });
  
  // Mark as read
  socket.on('message:read', (data) => {
    const senderSocketId = onlineUsers.get(data.senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit('message:read', { messageId: data.messageId });
    }
  });
  
  // Typing indicators
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
  
  socket.on('disconnect', () => {
    console.log(`🔌 User ${socket.userId} disconnected`);
    onlineUsers.delete(socket.userId);
    io.emit('users:online', Array.from(onlineUsers.keys()));
  });
});

// ============ CREATE DEFAULT ADMIN ============
async function createDefaultAdmin() {
  const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@nts.rw' } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('Admin123', 10);
    await prisma.user.create({ data: { email: 'admin@nts.rw', fullName: 'System Administrator', passwordHash, role: 'ADMIN', isVerified: true } });
    console.log('✅ Default admin created: admin@nts.rw / Admin123');
  }
}

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;
createDefaultAdmin().then(() => {
  server.listen(PORT, () => console.log(`🚀 NTS Server running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to create default admin:', err);
  server.listen(PORT, () => console.log(`🚀 NTS Server running on http://localhost:${PORT}`));
});