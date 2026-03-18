const express = require('express');
const multer = require('multer');
const router = express.Router();
const videoController = require('../controllers/videoController');
const authMiddleware = require('../middleware/authMiddleware');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        // Allow up to 5GB file uploads
        fileSize: 5 * 1024 * 1024 * 1024 // 5GB Limit
    }
});

// Routes
router.post('/upload', authMiddleware, upload.single('video'), videoController.uploadVideo);
router.get('/', authMiddleware, videoController.getVideos);

// Public routes (no auth required) - for shared videos
router.get('/public/thumbnail/:videoId', videoController.getThumbnail);
router.get('/public/stream/:videoId/master.m3u8', videoController.getPlaylist);
router.get('/public/stream/:videoId/chunk/:chunkName', videoController.getChunk);
router.get('/public/:videoId', videoController.getVideoById);

// Protected routes (auth required)
router.get('/thumbnail/:videoId', authMiddleware, videoController.getThumbnail);
router.get('/stream/:videoId/master.m3u8', authMiddleware, videoController.getPlaylist);
router.get('/stream/:videoId/chunk/:chunkName', authMiddleware, videoController.getChunk);
router.delete('/:videoId', authMiddleware, videoController.deleteVideo);
router.get('/:videoId', authMiddleware, videoController.getVideoById);
router.put('/:videoId/rename', authMiddleware, videoController.renameVideo);
router.patch('/:videoId/toggle-privacy', authMiddleware, videoController.togglePrivacy);

module.exports = router;
