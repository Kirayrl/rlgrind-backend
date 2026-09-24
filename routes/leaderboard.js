const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

// GET /api/leaderboard — top 50 joueurs
router.get('/', async (req, res) => {
  try {
    const players = await User.find({})
      .sort({ elo: -1 })
      .limit(50)
      .select('username elo stats');

    const leaderboard = players.map((p, i) => ({
      rank:     i + 1,
      username: p.username,
      elo:      p.elo,
      division: p.getRank(),
      wins:     p.stats.wins,
      losses:   p.stats.losses,
      winrate:  p.getWinrate()
    }));

    res.json(leaderboard);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
