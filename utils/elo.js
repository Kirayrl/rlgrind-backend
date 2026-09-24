// Système ELO classique — K-factor adapté selon le rang
// Plus t'es haut, moins t'as de points à gagner/perdre

const K_FACTORS = [
  { maxElo: 400,     k: 40 },  // Bronze/Silver : apprentissage rapide
  { maxElo: 800,     k: 32 },  // Gold/Plat     : standard
  { maxElo: 1200,    k: 24 },  // Diamond/Champ : plus stable
  { maxElo: Infinity, k: 16 }  // GC/SSL        : très stable
];

function getKFactor(elo) {
  return K_FACTORS.find(k => elo <= k.maxElo).k;
}

// Calcule la probabilité de victoire attendue
function expectedScore(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// Retourne les nouveaux ELO des deux joueurs
// result : 1 = p1 win, 0 = p1 loss, 0.5 = draw
function calculateElo(eloP1, eloP2, result) {
  const expectedP1 = expectedScore(eloP1, eloP2);
  const expectedP2 = expectedScore(eloP2, eloP1);

  const kP1 = getKFactor(eloP1);
  const kP2 = getKFactor(eloP2);

  const actualP1 = result;        // 1, 0 ou 0.5
  const actualP2 = 1 - result;    // inverse

  const newEloP1 = Math.round(eloP1 + kP1 * (actualP1 - expectedP1));
  const newEloP2 = Math.round(eloP2 + kP2 * (actualP2 - expectedP2));

  // Floor à 0 — on descend pas en négatif
  return {
    newEloP1: Math.max(0, newEloP1),
    newEloP2: Math.max(0, newEloP2),
    changeP1: Math.round(kP1 * (actualP1 - expectedP1)),
    changeP2: Math.round(kP2 * (actualP2 - expectedP2))
  };
}

module.exports = { calculateElo, expectedScore, getKFactor };
