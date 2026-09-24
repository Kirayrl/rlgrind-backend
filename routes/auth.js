const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'Username et password requis' });

    if (password.length < 6)
      return res.status(400).json({ error: 'Password trop court (min 6 chars)' });

    const exists = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (exists)
      return res.status(409).json({ error: 'Username déjà pris' });

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, password: hash });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id:       user._id,
        username: user.username,
        elo:      user.elo,
        rank:     user.getRank(),
        role:     user.role // <-- Ajouté ici
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (!user)
      return res.status(401).json({ error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id:       user._id,
        username: user.username,
        elo:      user.elo,
        rank:     user.getRank(),
        stats:    user.stats,
        winrate:  user.getWinrate(),
        role:     user.role // <-- Ajouté ici
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me — profil du user connecté
router.get('/me', require('../middleware/auth'), async (req, res) => {
  const user = req.user;
  res.json({
    id:          user._id,
    username:    user.username,
    elo:         user.elo,
    rank:        user.getRank(),
    stats:       user.stats,
    winrate:     user.getWinrate(),
    inQueue:     user.inQueue,
    inMatch:     user.inMatch,
    role:        user.role // <-- Ajouté ici aussi
  });
});

module.exports = router;