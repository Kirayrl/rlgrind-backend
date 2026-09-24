const mongoose = require('mongoose');

// Rank thresholds — resserrés, pas comme le vrai MMR RL
const RANKS = [
  { name: 'Bronze',  min: 0,    max: 199  },
  { name: 'Silver',  min: 200,  max: 399  },
  { name: 'Gold',    min: 400,  max: 599  },
  { name: 'Plat',    min: 600,  max: 799  },
  { name: 'Diamond', min: 800,  max: 999  },
  { name: 'Champ',   min: 1000, max: 1199 },
  { name: 'GC',      min: 1200, max: 1399 },
  { name: 'SSL',     min: 1400, max: Infinity }
];

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'  // Par défaut, tout nouveau compte est un utilisateur classique
  },
  elo: {
    type: Number,
    default: 400  // Tout le monde start Gold
  },
  
  stats: {
    wins:   { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws:  { type: Number, default: 0 }
  },
  matchHistory: [{
    matchId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
    result:    { type: String, enum: ['win', 'loss', 'draw'] },
    eloChange: { type: Number },
    eloAfter:  { type: Number },
    date:      { type: Date, default: Date.now }
  }],
  inQueue:   { type: Boolean, default: false },
  inMatch:   { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Calcule le rank selon l'ELO
userSchema.methods.getRank = function() {
  return RANKS.find(r => this.elo >= r.min && this.elo <= r.max)?.name || 'Bronze';
};

// Winrate en %
userSchema.methods.getWinrate = function() {
  const total = this.stats.wins + this.stats.losses + this.stats.draws;
  if (total === 0) return 0;
  return Math.round((this.stats.wins / total) * 100);
};

module.exports = mongoose.model('User', userSchema);
module.exports.RANKS = RANKS;
