const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.SESSION_SECRET || 'your-secret-key', {
    expiresIn: '7d',
  });
};

// Local Signup
exports.signup = async (req, res) => {
  try {
    const { email, username, password, firstName, lastName } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    user = new User({
      email,
      username,
      password,
      firstName,
      lastName,
      signupMethod: 'local',
    });

    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: user.getPublicProfile(),
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Error during signup' });
  }
};

// Local Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: user.getPublicProfile(),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error during login' });
  }
};

// Google Callback
exports.googleCallback = async (req, res) => {
  try {
    console.log('Google callback handler - req.user:', req.user ? 'exists' : 'missing');
    
    if (!req.user) {
      console.error('No user in request after Passport authentication');
      return res.redirect('/?error=authentication_failed');
    }

    const userId = req.user._id || req.user.id;
    
    if (!userId) {
      console.error('No userId found in user object');
      console.error('User object:', req.user);
      return res.redirect('/?error=no_user_id');
    }

    console.log('Generating token for user:', userId);
    const token = generateToken(userId);

    // Redirect to frontend with token
    const redirectUrl = `https://telegram-free-storage-video-streamer-production.up.railway.app/?token=${token}&userId=${userId}`;
    console.log('Google auth successful, redirecting to:', redirectUrl);
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google callback error:', error.message);
    console.error('Full error:', error);
    return res.redirect('https://telegram-free-storage-video-streamer-production.up.railway.app/?error=authentication_failed');
  }
};

// Get Current User
exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: user.getPublicProfile() });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Error fetching user' });
  }
};

// Logout
exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
};
