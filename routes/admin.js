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

    const p1Id = match.player1.toString();
    const p2Id = match.player2.toString();
    const isP1Winner = winnerId.toString() === p1Id;

    const loserId = isP1Winner ? p2Id : p1Id;

    // Récupérer les utilisateurs
    const winnerUser = await User.findById(winnerId);
    const loserUser = await User.findById(loserId);

    if (!winnerUser || !loserUser) {
      return res.status(404).json({ error: 'Joueur(s) introuvable(s).' });
    }

    // Calcul de l'ELO (fixe ou basé sur ton système habituel, ici ex: 25 points)
    const eloChange = 25;

    // Mise à jour des stats du gagnant
    winnerUser.elo += eloChange;
    winnerUser.stats.wins = (winnerUser.stats.wins || 0) + 1;
    winnerUser.inMatch = false;
    await winnerUser.save();

    // Mise à jour des stats du perdant
    loserUser.elo = Math.max(0, loserUser.elo - eloChange);
    loserUser.stats.losses = (loserUser.stats.losses || 0) + 1;
    loserUser.inMatch = false;
    await loserUser.save();

    // Mettre à jour le match
    match.status = 'completed';
    match.winner = winnerId;
    match.completedAt = Date.now();
    match.disputed = false;
    
    // Sauvegarde des changements d'Elo dans le match
    match.eloChanges = {
      player1: isP1Winner ? eloChange : -eloChange,
      player2: isP1Winner ? -eloChange : eloChange
    };

    // Définir le score final selon le choix de l'admin
    if (isP1Winner) {
      match.finalScore = { player1Goals: 1, player2Goals: 0 };
    } else {
      match.finalScore = { player1Goals: 0, player2Goals: 1 };
    }

    await match.save();

    res.json({ message: 'Litige résolu avec succès par l\'administrateur et ELO mis à jour.', match });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la résolution du litige.' });
  }
});

module.exports = router;