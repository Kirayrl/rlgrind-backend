require('dotenv').config();
const express    = require('express');
const http       = http = require('http'); // ou require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');

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
app.use('/api/admin',       require('./routes/admin'));

// ─── MATCHMAKING QUEUES ──────────────────────────────────────────────────────
const queue1v1 = new Map(); // userId -> { socketId, elo, username, userId }
const queue2v2 = new Map(); // userId -> { socketId, elo2v2, username, userId }

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
  console.log(`[+] ${user.username} connecté (ELO 1v1: ${user.elo} | ELO 2v2: ${user.elo2v2})`);

  // Rejoindre une room perso pour recevoir les events ciblés
  socket.join(`user:${user._id}`);

  // ── QUEUE 1v1 ──────────────────────────────────────────────────────────────
  socket.on('queue:join', async () => {
    if (user.inMatch) {
      return socket.emit('queue:error', { message: 'Tu es déjà dans un match' });
    }
    if (queue1v1.has(user._id.toString()) || queue2v2.has(user._id.toString())) {
      return socket.emit('queue:error', { message: 'Déjà dans une queue' });
    }

    queue1v1.set(user._id.toString(), {
      socketId: socket.id,
      elo:      user.elo,
      username: user.username,
      userId:   user._id
    });

    await User.findByIdAndUpdate(user._id, { inQueue: true });
    socket.emit('queue:joined', { mode: '1v1', position: queue1v1.size });
    console.log(`[QUEUE 1v1] ${user.username} rejoint la queue (${queue1v1.size})`);

    if (queue1v1.size >= 2) {
      const entries = [...queue1v1.entries()];
      const [id1, p1] = entries[0];
      const [id2, p2] = entries[1];

      queue1v1.delete(id1);
      queue1v1.delete(id2);

      try {
        const match = await Match.create({
          player1: p1.userId,
          player2: p2.userId,
          status:  'ongoing'
        });

        await User.updateMany(
          { _id: { $in: [p1.userId, p2.userId] } },
          { inQueue: false, inMatch: true }
        );

        const matchData = {
          matchId:       match._id,
          lobbyName:     match.lobbyName,
          lobbyPassword: match.lobbyPassword,
          opponent:      null
        };

        io.to(`user:${p1.userId}`).emit('match:found', {
          ...matchData,
          opponent: { username: p2.username, elo: p2.elo }
        });
        io.to(`user:${p2.userId}`).emit('match:found', {
          ...matchData,
          opponent: { username: p1.username, elo: p1.elo }
        });

        console.log(`[MATCH 1v1] ${p1.username} vs ${p2.username}`);
      } catch (err) {
        console.error('[MATCH ERROR 1v1]', err);
      }
    }
  });

  // ── QUEUE 2v2 ──────────────────────────────────────────────────────────────
  socket.on('queue2v2:join', async () => {
    if (user.inMatch) {
      return socket.emit('queue:error', { message: 'Tu es déjà dans un match' });
    }
    if (queue1v1.has(user._id.toString()) || queue2v2.has(user._id.toString())) {
      return socket.emit('queue:error', { message: 'Déjà dans une queue' });
    }

    queue2v2.set(user._id.toString(), {
      socketId: socket.id,
      elo2v2:   user.elo2v2,
      username: user.username,
      userId:   user._id
    });

    await User.findByIdAndUpdate(user._id, { inQueue: true });
    socket.emit('queue:joined', { mode: '2v2', position: queue2v2.size });
    console.log(`[QUEUE 2v2] ${user.username} rejoint la queue (${queue2v2.size}/4)`);

    // Dès qu'on a 4 joueurs en 2v2 -> on forme 2 équipes de 2
    if (queue2v2.size >= 4) {
      const entries = [...queue2v2.entries()];
      const [id1, p1] = entries[0];
      const [id2, p2] = entries[1];
      const [id3, p3] = entries[2];
      const [id4, p4] = entries[3];

      queue2v2.delete(id1);
      queue2v2.delete(id2);
      queue2v2.delete(id3);
      queue2v2.delete(id4);

      try {
        // Équipe 1 : p1 & p2 | Équipe 2 : p3 & p4
        // Pour l'instant on gère le match model en 1v1, on pourra l'adapter ou stocker l'array des joueurs
        const match = await Match.create({
          player1: p1.userId,
          player2: p3.userId, // Représentant principal de l'équipe adverse par défaut
          status:  'ongoing'
        });

        const allPlayers = [p1.userId, p2.userId, p3.userId, p4.userId];
        await User.updateMany(
          { _id: { $in: allPlayers } },
          { inQueue: false, inMatch: true }
        );

        const matchData = {
          matchId:       match._id,
          lobbyName:     match.lobbyName,
          lobbyPassword: match.lobbyPassword
        };

        // Notifier les 4 joueurs
        io.to(`user:${p1.userId}`).emit('match:found', { ...matchData, team: [p1, p2], opponents: [p3, p4] });
        io.to(`user:${p2.userId}`).emit('match:found', { ...matchData, team: [p2, p1], opponents: [p3, p4] });
        io.to(`user:${p3.userId}`).emit('match:found', { ...matchData, team: [p3, p4], opponents: [p1, p2] });
        io.to(`user:${p4.userId}`).emit('match:found', { ...matchData, team: [p4, p3], opponents: [p1, p2] });

        console.log(`[MATCH 2v2] (${p1.username}, ${p2.username}) vs (${p3.username}, ${p4.username})`);
      } catch (err) {
        console.error('[MATCH ERROR 2v2]', err);
      }
    }
  });

  // ── LEAVE QUEUE (1v1 ou 2v2) ───────────────────────────────────────────────
  socket.on('queue:leave', async () => {
    queue1v1.delete(user._id.toString());
    queue2v2.delete(user._id.toString());
    await User.findByIdAndUpdate(user._id, { inQueue: false });
    socket.emit('queue:left');
    console.log(`[QUEUE] ${user.username} a quitté la file d'attente`);
  });

  // ── SCORE SUBMITTED ────────────────────────────────────────────────────────
  socket.on('match:score_submitted', ({ matchId, opponentId }) => {
    io.to(`user:${opponentId}`).emit('match:opponent_submitted', { matchId });
  });

  socket.on('disconnect', async () => {
    queue1v1.delete(user._id.toString());
    queue2v2.delete(user._id.toString());
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