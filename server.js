require('dotenv').config();
const express   = require('express');
const http      = require('http');
const { Server } = require('socket.io');
const mongoose  = require('mongoose');
const cors      = require('cors');
const jwt       = require('jsonwebtoken');

const User  = require('./models/User');
const Match = require('./models/Match');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    }
}));

// Routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/match',       require('./routes/Match'));
app.use('/api/leaderboard', require('./routes/leaderboard'));

// ─── MATCHMAKING QUEUE ────────────────────────────────────────────────────────
// Simple queue FIFO — on prend les deux premiers disponibles
const queue = new Map(); // userId -> { socketId, elo, username }

// Auth Socket.io via JWT dans le handshake
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Auth required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`[+] ${user.username} connecté (ELO: ${user.elo})`);

  // Rejoindre une room perso pour recevoir les events ciblés
  socket.join(`user:${user._id}`);

  // ── JOIN QUEUE ──────────────────────────────────────────────────────────────
  socket.on('queue:join', async () => {
    if (user.inMatch) {
      return socket.emit('queue:error', { message: 'Tu es déjà dans un match' });
    }
    if (queue.has(user._id.toString())) {
      return socket.emit('queue:error', { message: 'Déjà dans la queue' });
    }

    queue.set(user._id.toString(), {
      socketId: socket.id,
      elo:      user.elo,
      username: user.username,
      userId:   user._id
    });

    await User.findByIdAndUpdate(user._id, { inQueue: true });
    socket.emit('queue:joined', { position: queue.size });
    console.log(`[QUEUE] ${user.username} rejoint la queue (${queue.size} en attente)`);

    // Dès qu'on a 2 joueurs → on crée un match
    if (queue.size >= 2) {
      const entries  = [...queue.entries()];
      const [id1, p1] = entries[0];
      const [id2, p2] = entries[1];

      queue.delete(id1);
      queue.delete(id2);

      try {
        // Crée le match en DB — lobby name + mdp générés auto par le modèle
        const match = await Match.create({
          player1: p1.userId,
          player2: p2.userId,
          status:  'ongoing'
        });

        // Update les users
        await User.updateMany(
          { _id: { $in: [p1.userId, p2.userId] } },
          { inQueue: false, inMatch: true }
        );

        // Notifie les deux joueurs
        const matchData = {
          matchId:       match._id,
          lobbyName:     match.lobbyName,
          lobbyPassword: match.lobbyPassword,
          opponent:      null // chacun reçoit le nom de l'adversaire
        };

        io.to(`user:${p1.userId}`).emit('match:found', {
          ...matchData,
          opponent: { username: p2.username, elo: p2.elo }
        });
        io.to(`user:${p2.userId}`).emit('match:found', {
          ...matchData,
          opponent: { username: p1.username, elo: p1.elo }
        });

        console.log(`[MATCH] ${p1.username} vs ${p2.username} — Lobby: ${match.lobbyName} | mdp: ${match.lobbyPassword}`);
      } catch (err) {
        console.error('[MATCH ERROR]', err);
      }
    }
  });

  // ── LEAVE QUEUE ─────────────────────────────────────────────────────────────
  socket.on('queue:leave', async () => {
    queue.delete(user._id.toString());
    await User.findByIdAndUpdate(user._id, { inQueue: false });
    socket.emit('queue:left');
    console.log(`[QUEUE] ${user.username} quitte la queue`);
  });

  // ── SCORE SUBMITTED — notif temps réel à l'adversaire ──────────────────────
  socket.on('match:score_submitted', ({ matchId, opponentId }) => {
    io.to(`user:${opponentId}`).emit('match:opponent_submitted', { matchId });
  });

  socket.on('disconnect', async () => {
    queue.delete(user._id.toString());
    await User.findByIdAndUpdate(user._id, { inQueue: false });
    console.log(`[-] ${user.username} déconnecté`);
  });
});

// ─── MONGO + START ─────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('[DB] MongoDB connecté');
    server.listen(process.env.PORT, () => {
      console.log(`[SERVER] http://localhost:${process.env.PORT}`);
    });
  })
  .catch(err => {
    console.error('[DB ERROR]', err);
    process.exit(1);
  });
