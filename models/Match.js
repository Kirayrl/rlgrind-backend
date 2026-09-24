const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const User = require('../models/User');
const auth = require('../middleware/auth');

// ── 1. Soumettre le score d'un match ────────────────────────────────────────
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const { myScore, theirScore } = req.body;
    const match = await Match.findById(req.params.id);

    if (!match || match.status !== 'ongoing') {
      return res.status(404).json({ error: 'Match introuvable ou déjà terminé.' });
    }

    const userId = req.user._id.toString();
    const isPlayer1 = match.player1.toString() === userId;
    const isPlayer2 = match.player2.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: 'Tu ne fais pas partie de ce match.' });
    }

    if (!match.scoreSubmissions) {
      match.scoreSubmissions = {};
    }

    // Enregistre le score du joueur
    if (isPlayer1) {
      match.scoreSubmissions.player1 = { myScore, theirScore, submittedAt: new Date() };
    } else {
      match.scoreSubmissions.player2 = { myScore, theirScore, submittedAt: new Date() };
    }

    // INDispensable avec Mongoose pour les sous-documents/objets imbriqués :
    match.markModified('scoreSubmissions');

    const sub1 = match.scoreSubmissions.player1;
    const sub2 = match.scoreSubmissions.player2;

    // Vérifie si les DEUX ont soumis un score (on vérifie que myScore n'est pas null/undefined)
    const p1HasSubmitted = sub1 && sub1.myScore !== null && sub1.myScore !== undefined;
    const p2HasSubmitted = sub2 && sub2.myScore !== null && sub2.myScore !== undefined;

    if (p1HasSubmitted && p2HasSubmitted) {
      const p1GoalsClaimedByP1 = sub1.myScore;
      const p2GoalsClaimedByP1 = sub1.theirScore;
      
      const p2GoalsClaimedByP2 = sub2.myScore;
      const p1GoalsClaimedByP2 = sub2.theirScore;

      // Comparaison croisée des scores
      if (p1GoalsClaimedByP1 === p1GoalsClaimedByP2 && p2GoalsClaimedByP1 === p2GoalsClaimedByP2) {
        match.status = 'completed';
        match.completedAt = Date.now();
        match.finalScore = { player1Goals: p1GoalsClaimedByP1, player2Goals: p2GoalsClaimedByP2 };
        match.winner = p1GoalsClaimedByP1 > p2GoalsClaimedByP2 ? match.player1 : (p1GoalsClaimedByP1 < p2GoalsClaimedByP2 ? match.player2 : null);

        const eloChange = 25;
        const p1User = await User.findById(match.player1);
        const p2User = await User.findById(match.player2);

        if (match.winner) {
          const isP1Winner = match.winner.toString() === match.player1.toString();
          const winnerUser = isP1Winner ? p1User : p2User;
          const loserUser = isP1Winner ? p2User : p1User;

          winnerUser.elo += eloChange;
          winnerUser.stats.wins = (winnerUser.stats.wins || 0) + 1;
          loserUser.elo = Math.max(0, loserUser.elo - eloChange);
          loserUser.stats.losses = (loserUser.stats.losses || 0) + 1;

          match.eloChanges = {
            player1: isP1Winner ? eloChange : -eloChange,
            player2: isP1Winner ? -eloChange : eloChange
          };
        } else {
          match.eloChanges = { player1: 0, player2: 0 };
        }

        p1User.inMatch = false;
        p2User.inMatch = false;

        await p1User.save();
        await p2User.save();

      } else {
        // Litige si les scores saisis ne correspondent pas
        match.status = 'disputed';
        match.disputed = true;
        match.disputeReason = 'Les scores soumis par les deux joueurs diffèrent.';
      }
    }

    await match.save();
    res.json({ message: 'Score enregistré avec succès.', match });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la soumission du score.' });
  }
});

// ── 2. Récupérer un match par son ID ───────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('player1', 'username elo')
      .populate('player2', 'username elo');
    if (!match) return res.status(404).json({ error: 'Match introuvable.' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── 3. Historique des matchs de l'utilisateur ──────────────────────────────
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

module.exports = router;