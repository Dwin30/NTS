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

// CORS
const allowedOrigins = [
  "http://localhost:3000",
  "https://nts-frontend.onrender.com",
  "https://nts-backend-409a.onrender.com",
  "https://*.onrender.com"
];

const io = socketIO(server, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, avatar: user.avatar } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, fullName, password, role, phone, school } = req.body;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, fullName, passwordHash, role: role || 'STUDENT', phone, school, isVerified: true }
    });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Upload
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `https://${req.get('host')}/uploads/${req.file.filename}`, mimetype: req.file.mimetype });
});

// Chat routes
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
    res.json([]);
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
      include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true } } } } }
    });
    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          isGroup: false,
          participants: { create: [{ userId: req.user.id }, { userId }] }
        },
        include: { participants: { include: { user: { select: { id: true, fullName: true, avatar: true } } } } }
      });
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to start chat' });
  }
});

app.get('/api/chat/:chatId/messages', authenticate, async (req, res) => {
  const { chatId } = req.params;
  try {
    const messages = await prisma.message.findMany({
      where: { chatId, isDeleted: false },
      include: { sender: { select: { id: true, fullName: true, avatar: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ messages });
  } catch (error) {
    res.json({ messages: [] });
  }
});

app.post('/api/chat/messages', authenticate, async (req, res) => {
  const { chatId, content, receiverId, fileUrl, fileType, replyToId } = req.body;
  try {
    const message = await prisma.message.create({
      data: { content: content || '', senderId: req.user.id, receiverId, chatId, fileUrl, fileType, replyToId, isRead: false },
      include: { sender: { select: { id: true, fullName: true, avatar: true } } }
    });
    io.to(`user:${receiverId}`).emit('message:received', message);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/chat/messages/:messageId/read', authenticate, async (req, res) => {
  const { messageId } = req.params;
  try {
    await prisma.message.update({ where: { id: messageId }, data: { isRead: true, readAt: new Date() } });
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    io.to(`user:${message.senderId}`).emit('message:read', { messageId });
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

// Feed routes
app.get('/api/posts/feed', authenticate, async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { isDeleted: false },
      include: { author: { select: { id: true, fullName: true, avatar: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    const postsWithLikes = await Promise.all(posts.map(async (post) => {
      const likeCount = await prisma.like.count({ where: { postId: post.id } });
      const userLike = await prisma.like.findFirst({ where: { userId: req.user.id, postId: post.id } });
      return { ...post, isLiked: !!userLike, likesCount: likeCount };
    }));
    res.json(postsWithLikes);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/posts', authenticate, async (req, res) => {
  const { content, imageUrl } = req.body;
  try {
    const post = await prisma.post.create({
      data: { content, imageUrl: imageUrl || null, authorId: req.user.id },
      include: { author: { select: { id: true, fullName: true, avatar: true } } }
    });
    await prisma.user.update({ where: { id: req.user.id }, data: { postsCount: { increment: 1 } } });
    io.emit('post:created', post);
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create post' });
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
    res.json({ liked: false });
  }
});

// Profile routes
app.get('/api/users/profile/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, role: true, avatar: true, bio: true, phone: true, school: true, postsCount: true, createdAt: true }
    });
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: 'User not found' });
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
    res.json([]);
  }
});

// Dashboard stats
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  const [students, trainers, posts] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.user.count({ where: { role: 'TRAINER' } }),
    prisma.post.count({ where: { isDeleted: false } })
  ]);
  res.json({ students, trainers, posts, internships: 0 });
});

// Socket.IO
const onlineUsers = new Map();
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected`);
  onlineUsers.set(socket.userId, socket.id);
  socket.join(`user:${socket.userId}`);

  socket.on('message:send', (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:received', data.message);
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

  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
    onlineUsers.delete(socket.userId);
  });
});

// Create default admin
async function createDefaultAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@nts.rw' } });
  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin123', 10);
    await prisma.user.create({ data: { email: 'admin@nts.rw', fullName: 'Admin', passwordHash, role: 'ADMIN', isVerified: true } });
    console.log('✅ Admin created');
  }
}

// Start server
const PORT = process.env.PORT || 5000;
createDefaultAdmin().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});