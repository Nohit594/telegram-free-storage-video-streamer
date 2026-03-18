const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Local Strategy
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ $or: [{ email }, { username: email }] });

        if (!user) {
          return done(null, false, { message: 'User not found' });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
          return done(null, false, { message: 'Invalid password' });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google strategy verify callback - Profile ID:', profile.id);
        
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          const nameParts = (profile.displayName || 'User').split(' ');
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : profile.email;
          
          if (!email) {
            console.error('No email from Google profile');
            return done(new Error('No email from Google profile'));
          }

          console.log('Creating new user from Google profile:', email);
          
          user = new User({
            googleId: profile.id,
            email,
            firstName: nameParts[0] || 'User',
            lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
            profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
            signupMethod: 'google',
          });

          await user.save();
          console.log('New user saved, userId:', user._id);
        }

        console.log('User authenticated successfully:', user._id);
        return done(null, user);
      } catch (error) {
        console.error('Google Strategy error:', error.message);
        console.error('Error stack:', error.stack);
        return done(error);
      }
    }
  )
);

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

module.exports = passport;
