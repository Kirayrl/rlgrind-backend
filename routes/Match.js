const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const auth = require('../middleware/auth');

// Route pour récupérer l'historique des matchs récents de l'utilisateur
router.get('/my-history', auth, async (req, res) => {
  try {
    const matches = await Match.find({
      $or: [{ player1: req.user._id }, { player2: req.user._id }],
      status: 'completed'
    })
      .populate('player1', 'username elo')
      .populate('player2', 'username elo')
      .sort({ completedAt: -1 })
      .limit(10);

    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique.' });
  }
});

// ... tes autres routes de match existantes ...

module.exports = router;