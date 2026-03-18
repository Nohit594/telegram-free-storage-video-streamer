const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Local authentication
router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google callback with error handling
router.get('/google/callback', (req, res, next) => {
  console.log('Google callback route handler');
  passport.authenticate('google', { failureRedirect: '/?error=google_auth_failed' }, (err, user, info) => {
    if (err) {
      console.error('Passport authenticate error:', err.message);
      return res.redirect('/?error=auth_error');
    }
    
    if (!user) {
      console.error('No user returned from Passport');
      return res.redirect('/?error=no_user');
    }
    
    console.log('User authenticated, setting req.user');
    req.user = user;
    req.login(user, (err) => {
      if (err) {
        console.error('Login error:', err.message);
        return res.redirect('/?error=login_failed');
      }
      authController.googleCallback(req, res);
    });
  })(req, res, next);
});

// User routes
router.get('/user', authMiddleware, authController.getCurrentUser);
router.get('/logout', authController.logout);

module.exports = router;
