const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const Match   = require('../models/Match');
const User    = require('../models/User');
const { calculateElo } = require('../utils/elo');

router.get('/:id', auth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('player1', 'username elo')
      .populate('player2', 'username elo')
      .populate('winner',  'username');
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    const isPlayer = match.player1._id.equals(req.user._id) || match.player2._id.equals(req.user._id);
    if (!isPlayer) return res.status(403).json({ error: 'Accès refusé' });
    res.json(match);
  } catch { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/:id/submit', auth, async (req, res) => {
  try {
    const { myScore, theirScore } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    if (match.status !== 'ongoing' && match.status !== 'score_submission')
      return res.status(400).json({ error: 'Match pas en cours' });
    const isP1 = match.player1.equals(req.user._id);
    const isP2 = match.player2.equals(req.user._id);
    if (!isP1 && !isP2) return res.status(403).json({ error: 'Accès refusé' });
    if (typeof myScore !== 'number' || typeof theirScore !== 'number' || myScore < 0 || theirScore < 0)
      return res.status(400).json({ error: 'Score invalide' });
    const playerKey = isP1 ? 'player1' : 'player2';
    if (match.scoreSubmissions[playerKey].myScore !== null)
      return res.status(400).json({ error: 'Score déjà soumis' });
    match.scoreSubmissions[playerKey] = { myScore, theirScore, submittedAt: new Date() };
    match.status = 'score_submission';
    const sub1 = match.scoreSubmissions.player1;
    const sub2 = match.scoreSubmissions.player2;
    if (sub1.myScore !== null && sub2.myScore !== null) {
      const p1Goals = sub1.myScore, p2Goals = sub1.theirScore;
      const scoresMatch = p1Goals === sub2.theirScore && p2Goals === sub2.myScore;
      if (scoresMatch) { await finalizeMatch(match, p1Goals, p2Goals); }
      else { match.status = 'disputed'; match.disputed = true; match.disputeReason = `P1 a soumis ${sub1.myScore}-${sub1.theirScore}, P2 a soumis ${sub2.myScore}-${sub2.theirScore}`; }
    }
    await match.save();
    res.json({ message: 'Score soumis', match });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

async function finalizeMatch(match, p1Goals, p2Goals) {
  match.finalScore = { player1Goals: p1Goals, player2Goals: p2Goals };
  match.status = 'completed';
  match.completedAt = new Date();
  const p1 = await User.findById(match.player1);
  const p2 = await User.findById(match.player2);
  let result = p1Goals > p2Goals ? 1 : p1Goals < p2Goals ? 0 : 0.5;
  const { newEloP1, newEloP2, changeP1, changeP2 } = calculateElo(p1.elo, p2.elo, result);
  match.winner = result === 1 ? p1._id : result === 0 ? p2._id : null;
  match.eloChanges = { player1: changeP1, player2: changeP2 };
  p1.elo = newEloP1; p1.inMatch = false;
  if (result === 1) p1.stats.wins++; else if (result === 0) p1.stats.losses++; else p1.stats.draws++;
  p1.matchHistory.push({ matchId: match._id, result: result === 1 ? 'win' : result === 0 ? 'loss' : 'draw', eloChange: changeP1, eloAfter: newEloP1 });
  p2.elo = newEloP2; p2.inMatch = false;
  if (result === 0) p2.stats.wins++; else if (result === 1) p2.stats.losses++; else p2.stats.draws++;
  p2.matchHistory.push({ matchId: match._id, result: result === 0 ? 'win' : result === 1 ? 'loss' : 'draw', eloChange: changeP2, eloAfter: newEloP2 });
  await p1.save(); await p2.save();
}

router.get('/:id/lobby', auth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    const isPlayer = match.player1.equals(req.user._id) || match.player2.equals(req.user._id);
    if (!isPlayer) return res.status(403).json({ error: 'Accès refusé' });
    res.json({ lobbyName: match.lobbyName, lobbyPassword: match.lobbyPassword });
  } catch { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;