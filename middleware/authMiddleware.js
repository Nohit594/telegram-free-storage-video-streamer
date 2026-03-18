const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
