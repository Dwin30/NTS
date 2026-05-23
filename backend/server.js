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

// ============ CORS CONFIGURATION ============
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://nts-frontend.onrender.com",
  "https://nts-backend-409a.onrender.com",
  "https://*.onrender.com",
  "https://*.netlify.app",
  "https://*.vercel.app"
];

const io = socketIO(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"]
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

// ============ MIDDLEWARE ============
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use('/uploads', express.static(uploadDir));
app.options('*', cors());

// ============ AUTH MIDDLEWARE ============
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nts_secret_key_2024');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ AUTH ROUTES ============
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, fullName, password, role, phone, school } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, fullName, passwordHash, role: role || 'STUDENT', phone, school, isVerified: true }
    });
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'nts_secret_key_2024', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio, phone: user.phone, school: user.school } });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'nts_secret_key_2024', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio, phone: user.phone, school: user.school } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============ FILE UPLOAD ============
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, mimetype: req.file.mimetype });
});

// ============ CHAT ROUTES ============
app.get('/api/chat', authenticate, async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { participants: { some: { userId: req.user.id } } },
      include: {
        participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
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
          { participants: { some: { userId } } }
        ]
      },
      include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
    });
    
    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          isGroup: false,
          participants: { create: [{ userId: req.user.id }, { userId }] }
        },
        include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true, role: true } } } } }
      });
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

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

app.post('/api/chat/messages', authenticate, async (req, res) => {
  const { chatId, content, receiverId, fileUrl, fileType, fileName, replyToId } = req.body;
  try {
    const message = await prisma.message.create({
      data: { content: content || '', senderId: req.user.id, receiverId, chatId, fileUrl, fileType, fileName, replyToId, isRead: false, isDeleted: false },
      include: { sender: { select: { id: true, fullName: true, avatar: true } }, replyTo: { include: { sender: { select: { id: true, fullName: true } } } } }
    });
    
    io.to(`user:${receiverId}`).emit('message:received', message);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/chat/messages/:messageId', authenticate, async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;
  try {
    const message = await prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true, editedAt: new Date() },
      include: { sender: { select: { id: true, fullName: true, avatar: true } } }
    });
    io.to(`user:${message.receiverId}`).emit('message:updated', message);
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/chat/messages/:messageId', authenticate, async (req, res) => {
  const { messageId } = req.params;
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (message.senderId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Not authorized' });
    
    await prisma.message.update({ where: { id: messageId }, data: { isDeleted: true } });
    io.to(`user:${message.receiverId}`).emit('message:deleted', { messageId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/messages/:messageId/read', authenticate, async (req, res) => {
  const { messageId } = req.params;
  try {
    await prisma.message.update({ where: { id: messageId }, data: { isRead: true, readAt: new Date() } });
    io.emit('message:read', { messageId });
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
      where: { id: { not: req.user.id }, fullName: { contains: q, mode: 'insensitive' } },
      select: { id: true, fullName: true, avatar: true, role: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ POST FEED ROUTES ============
app.get('/api/posts/feed', authenticate, async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: { author: { select: { id: true, fullName: true, avatar: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    const postsWithLikes = await Promise.all(posts.map(async (post) => {
      const likeCount = await prisma.like.count({ where: { postId: post.id } });
      const commentCount = await prisma.comment.count({ where: { postId: post.id } });
      const userLike = await prisma.like.findFirst({ where: { userId: req.user.id, postId: post.id } });
      return { ...post, isLiked: !!userLike, likesCount: likeCount, commentsCount: commentCount };
    }));
    res.json(postsWithLikes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts', authenticate, async (req, res) => {
  const { content, imageUrl } = req.body;
  try {
    const post = await prisma.post.create({
      data: { content, imageUrl: imageUrl || null, authorId: req.user.id },
      include: { author: { select: { id: true, fullName: true, avatar: true, role: true } } }
    });
    io.emit('post:created', post);
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts/:postId/like', authenticate, async (req, res) => {
  const { postId } = req.params;
  try {
    const existing = await prisma.like.findFirst({ where: { userId: req.user.id, postId } });
    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      res.json({ liked: false });
    } else {
      await prisma.like.create({ data: { userId: req.user.id, postId } });
      res.json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts/:postId/comments', authenticate, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
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

// ============ USER PROFILE ============
app.get('/api/users/profile/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, role: true, avatar: true, bio: true, phone: true, school: true, createdAt: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/profile', authenticate, async (req, res) => {
  const { fullName, bio, phone, school, avatar } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { fullName, bio, phone, school, avatar }
    });
    res.json(updated);
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

// ============ INTERNSHIPS ============
app.get('/api/internships', authenticate, async (req, res) => {
  try {
    const internships = await prisma.internship.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(internships);
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

app.get('/api/my-applications', authenticate, async (req, res) => {
  try {
    const apps = await prisma.internshipApplication.findMany({ where: { studentId: req.user.id }, include: { internship: true } });
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN ROUTES ============
app.get('/api/admin/users', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  const users = await prisma.user.findMany();
  res.json({ users });
});

app.put('/api/admin/users/:userId/role', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  const { userId } = req.params;
  const { role } = req.body;
  const updated = await prisma.user.update({ where: { id: userId }, data: { role } });
  res.json(updated);
});

app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  const [students, trainers, posts, internships] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.user.count({ where: { role: 'TRAINER' } }),
    prisma.post.count(),
    prisma.internship.count()
  ]);
  res.json({ students, trainers, posts, internships });
});

// ============ MISSING POST ROUTES ============

// Create a new post (POST /api/posts)
app.post('/api/posts', authenticate, async (req, res) => {
  const { content, imageUrl } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required' });
  }
  try {
    const post = await prisma.post.create({
      data: {
        content: content.trim(),
        imageUrl: imageUrl || null,
        authorId: req.user.id,
      },
      include: {
        author: { select: { id: true, fullName: true, avatar: true, role: true } }
      }
    });
    // Update user's post count
    await prisma.user.update({
      where: { id: req.user.id },
      data: { postsCount: { increment: 1 } }
    });
    // Emit new post via Socket.IO
    const newPostForSocket = { ...post, isLiked: false, likesCount: 0, commentsCount: 0 };
    io.emit('post:created', newPostForSocket);
    res.status(201).json(newPostForSocket);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Get comments for a specific post (GET /api/posts/:postId/comments)
app.get('/api/posts/:postId/comments', authenticate, async (req, res) => {
  const { postId } = req.params;
  try {
    const comments = await prisma.comment.findMany({
      where: { postId, isDeleted: false },
      include: {
        author: { select: { id: true, fullName: true, avatar: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(comments);
  } catch (error) {
    console.error('Fetch comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add a comment to a post (POST /api/posts/:postId/comments)
app.post('/api/posts/:postId/comments', authenticate, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Comment content is required' });
  }
  try {
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        authorId: req.user.id,
        postId: postId,
      },
      include: {
        author: { select: { id: true, fullName: true, avatar: true } }
      }
    });
    // Update post's comment count
    await prisma.post.update({
      where: { id: postId },
      data: { commentsCount: { increment: 1 } }
    });
    io.emit('comment:added', { postId, comment });
    res.status(201).json(comment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ============ MISSING PROFILE & SUGGESTED USERS ROUTES ============

// Get a user's profile by ID
app.get('/api/users/profile/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  try {
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        school: true,
        postsCount: true,
        followersCount: true,
        followingCount: true,
        createdAt: true
      }
    });
    if (!userProfile) return res.status(404).json({ error: 'User not found' });
    res.json(userProfile);
  } catch (error) {
    console.error('Fetch profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user's own profile
app.put('/api/users/profile', authenticate, async (req, res) => {
  const { fullName, bio, phone, school, avatar } = req.body;
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { fullName, bio, phone, school, avatar }
    });
    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get suggested users to follow
app.get('/api/users/suggested', authenticate, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: req.user.id } },
      select: { id: true, fullName: true, avatar: true, role: true },
      take: 10
    });
    res.json(users);
  } catch (error) {
    console.error('Fetch suggested users error:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ============ MISSING CHANGE PASSWORD ROUTE ============
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: 'Current password is incorrect' });
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: hashedPassword }
    });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============ SOCKET.IO ============
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nts_secret_key_2024');
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`✅ User ${socket.userId} connected`);
  onlineUsers.set(socket.userId, socket.id);
  socket.join(`user:${socket.userId}`);

  socket.on('message:send', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:received', data.message);
    }
  });

  socket.on('message:read', (data) => {
    const senderSocketId = onlineUsers.get(data.senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit('message:read', { messageId: data.messageId });
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

  // Video Call Signaling
  socket.on('call:offer', (data) => {
    const receiverSocketId = onlineUsers.get(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('call:incoming', {
        fromId: socket.userId,
        fromName: data.fromName,
        offer: data.offer,
        isVideo: data.isVideo
      });
    }
  });

  socket.on('call:answer', (data) => {
    const callerSocketId = onlineUsers.get(data.to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:accepted', { answer: data.answer });
    }
  });

  socket.on('call:ice-candidate', (data) => {
    const receiverSocketId = onlineUsers.get(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('call:ice-candidate', { candidate: data.candidate });
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

  socket.on('disconnect', () => {
    console.log(`❌ User ${socket.userId} disconnected`);
    onlineUsers.delete(socket.userId);
  });
});

// ============ CREATE DEFAULT ADMIN ============
async function createDefaultAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@nts.rw' } });
  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin123', 10);
    await prisma.user.create({ data: { email: 'admin@nts.rw', fullName: 'Admin', passwordHash, role: 'ADMIN', isVerified: true } });
    console.log('✅ Admin created: admin@nts.rw / Admin123');
  }
}

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;

async function startServer() {
  await prisma.$connect();
  await createDefaultAdmin();
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

startServer();