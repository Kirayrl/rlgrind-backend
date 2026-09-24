const mongoose = require('mongoose');

function generateLobbyName() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums  = '0123456789';
  let name = '';
  for (let i = 0; i < 4; i++) name += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) name += nums[Math.floor(Math.random() * nums.length)];
  return name;
}

function generateLobbyPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let pass = '';
  for (let i = 0; i < 6; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

const matchSchema = new mongoose.Schema({
  player1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  player2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lobbyName:     { type: String, default: generateLobbyName },
  lobbyPassword: { type: String, default: generateLobbyPassword },
  status: {
    type: String,
    enum: ['pending', 'ongoing', 'score_submission', 'disputed', 'completed', 'cancelled'],
    default: 'pending'
  },
  scoreSubmissions: {
    player1: { myScore: { type: Number, default: null }, theirScore: { type: Number, default: null }, submittedAt: { type: Date } },
    player2: { myScore: { type: Number, default: null }, theirScore: { type: Number, default: null }, submittedAt: { type: Date } }
  },
  finalScore: { player1Goals: { type: Number }, player2Goals: { type: Number } },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  eloChanges: { player1: { type: Number }, player2: { type: Number } },
  disputed: { type: Boolean, default: false },
  disputeReason: { type: String },
  createdAt:   { type: Date, default: Date.now },
  completedAt: { type: Date }
});

module.exports = mongoose.model('Match', matchSchema);