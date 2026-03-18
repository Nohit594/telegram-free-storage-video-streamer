require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const connectDB = require('./config/db');
require('./config/passport');

const videoRoutes = require('./routes/videoRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/api/videos', videoRoutes);

// Serve embed.html for /watch route with video ID parameter
app.get('/watch', (req, res) => {
  if (req.query.v) {
    res.sendFile(path.join(__dirname, 'public', 'embed.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Serve index.html for all other routes (for SPA with URL parameters)
app.use((req, res, next) => {
  if (req.path === '/' || req.query.v) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    next();
  }
});

// Fallback for 404
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error boundary
app.use((err, req, res, next) => {
  console.error('=== SERVER ERROR ===');
  console.error('Path:', req.path);
  console.error('Method:', req.method);
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);
  console.error('==================');
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
