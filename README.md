# 🎬 StreamFlix - Telegram Free Storage Video Streamer

A modern, full-featured video storage and streaming application that stores videos on Telegram and provides Netflix-style sharing with universal links.

## ✨ Features

### 🔐 Authentication
- **Local Authentication**: Email/password registration and login
- **Google OAuth 2.0**: One-click login with Google
- **JWT Tokens**: Secure token-based authentication with 7-day expiration
- **Password Hashing**: Bcryptjs for secure password storage
- **Protected Routes**: All video operations require authentication

### 📹 Video Management
- **Upload Videos**: Support for files up to 1GB
- **HLS Streaming**: Adaptive bitrate streaming for smooth playback
- **Video Quality**: Multiple quality options (Auto, 1080p, 720p, etc.)
- **Rename Videos**: Change video names without re-uploading
- **Delete Videos**: Permanently remove videos from storage
- **Search**: Full-text search for videos in database

### 🔗 Video Sharing
- **Two Sharing Formats**:
  - **Embed Link** (`/watch?v=VIDEO_ID`) - Full-screen dedicated player
  - **App Link** (`/?v=VIDEO_ID`) - Full app with database
- **QR Codes**: Generate QR codes for easy mobile sharing
- **Social Meta Tags**: Open Graph and Twitter Card support
- **No Auth Required**: Shared links don't require login to view

### 💾 Storage Management
- **Telegram Storage**: Videos stored directly in Telegram channel
- **Chunked Upload**: Large files split into manageable 5MB chunks
- **Thumbnail Generation**: Auto-generated video thumbnails
- **Storage Stats**: Real-time storage usage information
- **Telegram File Count**: Track number of files in Telegram

### 🎛️ Video Player
- **Playback Controls**: Play, pause, seek, mute, volume
- **Speed Control**: 0.25x to 2x playback speed
- **Quality Selection**: Switch between available quality levels
- **Fullscreen**: Full-screen playback support
- **Progress Bar**: Visual progress with preview scrubbing
- **Responsive**: Works on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites
- Node.js (v14+)
- MongoDB Atlas account
- Google OAuth credentials (optional)
- Telegram Bot Token

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/nohit594/telegram-free-storage-video-streamer.git
   cd telegram-free-storage-video-streamer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables** (create `.env` file):
   ```env
   # MongoDB
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname

   # Google OAuth
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

   # Session & JWT
   SESSION_SECRET=your_random_secret_key

   # Telegram (optional, for storage)
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   
   # Server
   PORT=3000
   ```

4. **Start the server**
   ```bash
   node server.js
   ```

5. **Access the application**
   ```
   http://localhost:3000
   ```

## 📖 User Flows

### First Time User
```
Visit homepage → Redirect to login → Create account → Dashboard
```

### Existing User
```
Visit homepage → Login → Dashboard
```

### Watch Shared Video
```
Click shared link → Auto-play video → No login needed
```

### Upload Video
```
Dashboard → Click Upload → Select file → Wait for processing → Video appears in database
```

### Share Video
```
Database → Find video → Click Share → Copy link or scan QR → Share anywhere
```

### Delete Video
```
Database → Find video → Click Delete → Confirm → Video removed from all storage
```

## 🎯 Video Actions

### Play
- Opens full-screen video player
- Auto-plays on page load (if allowed by browser)
- Supports all quality levels
- Speed control and fullscreen available

### Share
- Generate shareable links (Embed or App format)
- Create QR codes for mobile
- View link format toggle
- One-click copy to clipboard

### Rename
- Change video filename
- Keep original file extension
- Update reflected in database

### Delete
- Permanently remove video
- Confirmation required
- Deletes from Telegram and database
- Irreversible action

## 🔐 Authentication Details

### JWT Tokens
- **Expiration**: 7 days
- **Storage**: Browser localStorage
- **Format**: Bearer token in Authorization header
- **Refresh**: Auto-refresh on valid requests

### Password Requirements
- Minimum 8 characters recommended
- Bcryptjs hashing with 10 salt rounds
- Never stored in plain text

### OAuth Integration
- Google Login with automatic user creation
- Profile data (name, email) saved to database
- One-click authentication

## 📊 Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  email: String,
  username: String,
  password: String (hashed),
  googleId: String (optional),
  firstName: String,
  lastName: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Videos Collection
```javascript
{
  id: String (UUID),
  userId: ObjectId,
  filename: String,
  originalSize: Number,
  uploadTime: Date,
  fileId: String (Telegram),
  messageId: Number (Telegram),
  chunks: [{
    id: String,
    fileId: String,
    messageId: Number
  }],
  thumbnailFileId: String,
  playlistFileId: String
}
```

## 🔧 API Endpoints

### Authentication
- `POST /auth/signup` - Create new account
- `POST /auth/login` - Login with credentials
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/user` - Get current user info
- `GET /auth/logout` - Logout user

### Videos
- `GET /api/videos` - List all videos (protected)
- `POST /api/videos/upload` - Upload video (protected)
- `GET /api/videos/:videoId` - Get video info (protected)
- `GET /api/videos/:videoId/stream/:filename` - Stream HLS segment (protected)
- `GET /api/videos/thumbnail/:videoId` - Get thumbnail (protected)
- `DELETE /api/videos/:videoId` - Delete video (protected)
- `PUT /api/videos/:videoId/rename` - Rename video (protected)

## 🏗️ Project Structure

```
telegram-free-storage-video-streamer/
├── config/                 # Configuration files
│   ├── db.js              # MongoDB connection
│   └── passport.js        # Passport strategies
├── controllers/           # Route controllers
│   ├── authController.js  # Auth logic
│   └── videoController.js # Video logic
├── middleware/            # Express middleware
│   └── authMiddleware.js  # JWT verification
├── models/                # Database schemas
│   └── User.js            # User model
├── routes/                # API routes
│   ├── authRoutes.js      # Auth endpoints
│   └── videoRoutes.js     # Video endpoints
├── services/              # Business logic
│   ├── hlsService.js      # HLS streaming
│   └── telegramService.js # Telegram integration
├── public/                # Frontend files
│   ├── index.html         # Main dashboard
│   ├── login.html         # Login page
│   ├── signup.html        # Signup page
│   ├── embed.html         # Video embed player
│   ├── app.js             # Frontend JS
│   └── style.css          # Styling
├── uploads/               # Temporary video storage
├── hls/                   # HLS segments
├── .env                   # Environment config
├── .gitignore            # Git ignore rules
├── package.json          # Dependencies
└── server.js             # Main server file
```

## 🛠️ Dependencies

### Core
- **express**: Web framework
- **mongoose**: MongoDB ODM
- **passport**: Authentication middleware
- **jsonwebtoken**: JWT token generation

### Security
- **bcryptjs**: Password hashing
- **express-session**: Session management

### Video Processing
- **ffmpeg-static**: FFmpeg binary
- **fluent-ffmpeg**: FFmpeg wrapper

### Telegram Integration
- **axios**: HTTP client

### Development
- **dotenv**: Environment variables

## 🌐 Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (strong requirement)
- [ ] Configure CORS properly
- [ ] Set secure session secrets
- [ ] Enable CSRF protection
- [ ] Use environment variables for all secrets
- [ ] Set up MongoDB Atlas security
- [ ] Configure Google OAuth redirect URLs
- [ ] Test all authentication flows
- [ ] Monitor error logs

### Recommended Platforms
- **Heroku**: Easy deployment with free tier
- **Railway**: Modern Node.js hosting
- **Vercel**: Serverless with Node.js support
- **DigitalOcean APP**: Full control with reasonable pricing

## 📱 Browser Support

✅ Chrome/Edge (latest 2 versions)  
✅ Firefox (latest 2 versions)  
✅ Safari (latest 2 versions)  
✅ Mobile browsers (iOS Safari, Chrome Mobile)  

## 🐛 Troubleshooting

### `401 Unauthorized` on API calls
- Check if token is in localStorage
- Verify token hasn't expired (7 days)
- Try logging out and logging back in

### Video won't play
- Check browser HLS.js support
- Verify stream URL is accessible
- Check network tab for 401/404 errors
- Try a different video quality

### Upload fails
- File size must be under 1GB
- Ensure Telegram credentials are valid
- Check MongoDB connection
- Verify FFmpeg installation

### Google OAuth not working
- Verify Client ID and Secret in `.env`
- Check Callback URL matches GitHub settings
- Ensure OAuth app is in authorized state

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🙋 Support

For support, issues, or questions:
- Open an issue on GitHub
- Check existing documentation
- Review error logs in console

## 🎉 Acknowledgments

- **MongoDB Atlas** - Free database hosting
- **Telegram Bot API** - Unlimited free storage
- **FFmpeg** - Video processing
- **HLS.js** - Streaming playback
- **Passport.js** - Authentication

## 📈 Roadmap

### Coming Soon
- [ ] Video recommendations
- [ ] Playlist support
- [ ] Comments and ratings
- [ ] Subtitle support
- [ ] Video thumbnails from specific time
- [ ] Bulk operations (select multiple videos)
- [ ] Storage analytics dashboard
- [ ] Email verification
- [ ] Two-factor authentication
- [ ] Mobile app (React Native)

---

**Made with ❤️ by StreamFlix Community**

For the latest updates and information, visit our [GitHub Repository](https://github.com/nohit594/telegram-free-storage-video-streamer)
