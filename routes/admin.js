const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const User = require('../models/User');
const auth = require('../middleware/auth'); // Ton middleware d'authentification
const admin = require('../middleware/admin'); // Le middleware admin qu'on a vu juste avant

// 1. Récupérer tous les matchs en litige
router.get('/disputes', auth, admin, async (req, res) => {
  try {
    const disputedMatches = await Match.find({ status: 'disputed' })
      .populate('player1', 'username elo')
      .populate('player2', 'username elo');
    res.json(disputedMatches);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des litiges.' });
  }
});

// 2. Résoudre un litige (L'admin choisit le gagnant)
router.post('/disputes/:matchId/resolve', auth, admin, async (req, res) => {
  try {
    const { winnerId } = req.body; // ID du joueur déclaré vainqueur par l'admin
    const match = await Match.findById(req.params.matchId);

    if (!match || match.status !== 'disputed') {
      return res.status(404).json({ error: 'Match en litige introuvable.' });
    }

    const loserId = match.player1.toString() === winnerId ? match.player2 : match.player1;

    // Mettre à jour le match
    match.status = 'completed';
    match.winner = winnerId;
    match.completedAt = Date.now();
    match.disputed = false;

    // Définir le score final selon le choix de l'admin (ou par défaut basé sur les soumissions)
    if (winnerId === match.player1.toString()) {
      match.finalScore = { player1Goals: 1, player2Goals: 0 };
    } else {
      match.finalScore = { player1Goals: 0, player2Goals: 1 };
    }

    await match.save();

    // Optionnel : Mettre à jour les stats et ELO des joueurs ici si tu le souhaites

    res.json({ message: 'Litige résolu avec succès par l\'administrateur.', match });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la résolution du litige.' });
  }
});

module.exports = router;