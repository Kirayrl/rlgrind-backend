module.exports = function(req, res, next) {
  // On suppose que ton middleware d'authentification précédent attache `req.user`
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Accès refusé. Réservé aux administrateurs.' });
  }
};