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

    // Initialiser scoreSubmissions si absent
    if (!match.scoreSubmissions) {
      match.scoreSubmissions = {};
    }

    // Enregistre la soumission du joueur concerné
    if (isPlayer1) {
      match.scoreSubmissions.player1 = { myScore, theirScore };
    } else {
      match.scoreSubmissions.player2 = { myScore, theirScore };
    }

    // Marquer que ce joueur a soumis (optionnel selon ton schéma, mais pratique)
    const sub1 = match.scoreSubmissions.player1;
    const sub2 = match.scoreSubmissions.player2;

    // ATTENTION : On ne compare QUE si les DEUX ont soumis !
    if (sub1 && sub2) {
      const p1GoalsClaimedByP1 = sub1.myScore;
      const p2GoalsClaimedByP1 = sub1.theirScore;
      
      const p2GoalsClaimedByP2 = sub2.myScore;
      const p1GoalsClaimedByP2 = sub2.theirScore;

      // Comparaison croisée : Est-ce que P1 et P2 sont d'accord sur les deux scores ?
      if (p1GoalsClaimedByP1 === p1GoalsClaimedByP2 && p2GoalsClaimedByP1 === p2GoalsClaimedByP2) {
        // MATCH VALIDÉ !
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
        // VRAI LITIGE : Les deux ont soumis, mais les scores ne correspondent pas du tout
        match.status = 'disputed';
        match.disputeReason = 'Les scores soumis par les deux joueurs diffèrent.';
      }
    } else {
      // Un seul joueur a soumis pour l'instant, on laisse le match en 'ongoing'
      // Tu peux éventuellement émettre un évènement Socket.io ici pour prévenir l'autre joueur
    }

    await match.save();
    res.json({ message: 'Score enregistré avec succès. En attente de l\'adversaire.', match });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la soumission du score.' });
  }
});