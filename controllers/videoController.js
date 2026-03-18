const telegramService = require('../services/telegramService');
const hlsService = require('../services/hlsService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '../data/videos.json');

if (!fs.existsSync(path.join(__dirname, '../data'))) {
    fs.mkdirSync(path.join(__dirname, '../data'));
}
if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, '[]');
}

const getStoredVideos = () => {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
};

const saveVideos = (videos) => {
    fs.writeFileSync(dataFile, JSON.stringify(videos, null, 2));
};

exports.uploadVideo = async (req, res) => {
    let localFilePath = null;
    let hlsData = null;
    let thumbPath = null;
    
    // Set timeout to be very long for FFmpeg processing
    req.setTimeout(0);
    
    // Set response headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        if (!req.file) {
            console.error('No file uploaded');
            res.write(`data: ${JSON.stringify({ error: 'No video file uploaded' })}\n\n`);
            return res.end();
        }

        console.log(`File received: ${req.file.originalname} (${req.file.size} bytes)`);
        const totalSize = req.file.size;
        let uploadedBytes = 0;
        let totalBytes = 0;

        // Calculate total bytes to upload (thumbnail + playlist + all chunks)
        const calculateTotalBytes = () => {
            return new Promise((resolve) => {
                let bytes = 0;
                // Thumbnail size estimate
                bytes += 50000; // ~50KB thumbnail
                
                // Read HLS files
                if (hlsData?.hlsFolder && fs.existsSync(hlsData.hlsFolder)) {
                    const files = fs.readdirSync(hlsData.hlsFolder);
                    files.forEach(file => {
                        const filePath = path.join(hlsData.hlsFolder, file);
                        bytes += fs.statSync(filePath).size;
                    });
                }
                resolve(bytes);
            });
        };

        localFilePath = req.file.path;
        console.log(`Starting HLS conversion for ${localFilePath}...`);

        // Send progress event helper
        const sendProgress = (phase, percent, message) => {
            if (req.socket && !req.socket.destroyed) {
                res.write(`data: ${JSON.stringify({ phase, percent, message })}\n\n`);
            }
        };

        // 1. Convert video to HLS and generate thumbnail
        sendProgress('converting', 5, 'Converting to HLS format...');
        
        [hlsData, thumbPath] = await Promise.all([
            hlsService.convertToHLS(localFilePath),
            hlsService.generateThumbnail(localFilePath)
        ]);

        sendProgress('converting', 20, 'HLS conversion complete, preparing upload...');

        // 2. Read all files in the HLS output folder
        const files = fs.readdirSync(hlsData.hlsFolder);
        const tsFiles = files.filter(f => f.endsWith('.ts')).sort();
        const m3u8File = files.find(f => f.endsWith('.m3u8'));

        // Calculate total upload size
        totalBytes = await calculateTotalBytes();
        console.log(`Total upload size: ${(totalBytes / (1024*1024)).toFixed(2)} MB`);

        // 3. Upload thumbnail
        sendProgress('uploading', 25, 'Uploading thumbnail...');
        const thumbResult = await telegramService.sendPhoto(thumbPath);
        const thumbFileId = thumbResult.fileId;
        uploadedBytes += fs.statSync(thumbPath).size;

        // 4. Upload m3u8 playlist file
        sendProgress('uploading', 30, 'Uploading playlist file...');
        const playlistPath = path.join(hlsData.hlsFolder, m3u8File);
        const playlistResult = await telegramService.sendDocument(playlistPath);
        const playlistFileId = playlistResult.fileId;
        uploadedBytes += fs.statSync(playlistPath).size;

        // 5. Upload all TS chunks sequentially
        sendProgress('uploading', 35, `Uploading video chunks (0/${tsFiles.length})...`);
        
        const chunkFileIds = [];
        for (let i = 0; i < tsFiles.length; i++) {
            const fileName = tsFiles[i];
            const chunkPath = path.join(hlsData.hlsFolder, fileName);
            console.log(`Uploading chunk: ${fileName}`);
            
            const chunkResult = await telegramService.sendDocument(chunkPath);
            chunkFileIds.push({
                name: fileName,
                fileId: chunkResult.fileId,
                messageId: chunkResult.messageId  // Store message ID for deletion
            });
            
            uploadedBytes += fs.statSync(chunkPath).size;
            
            // Calculate progress percentage
            const uploadPercent = 35 + ((uploadedBytes / totalBytes) * 60); // 35% to 95%
            sendProgress('uploading', Math.min(uploadPercent, 95), `Uploading video chunks (${i + 1}/${tsFiles.length})...`);

            // Optional: small delay to prevent telegram rate limits 429
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 6. Save metadata
        sendProgress('finalizing', 95, 'Saving metadata...');
        
        // Ensure user is authenticated
        if (!req.user || !req.user.id) {
            throw new Error('User not authenticated');
        }
        
        const videos = getStoredVideos();
        const videoData = {
            id: hlsData.uniqueId,
            userId: req.user.id,  // Link video to authenticated user
            filename: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            thumbnailFileId: thumbResult.fileId,
            thumbnailMessageId: thumbResult.messageId,
            playlistFileId: playlistResult.fileId,
            playlistMessageId: playlistResult.messageId,
            chunks: chunkFileIds,
            uploadTime: new Date().toISOString(),
            originalSize: req.file.size,
            isPublic: false  // New videos are private by default
        };
        videos.push(videoData);
        saveVideos(videos);
        console.log(`Video saved successfully: ${videoData.filename} (ID: ${videoData.id}) for user ${videoData.userId}`);
        console.log(`Total videos in database: ${videos.length}`);

        // 7. Cleanup local files
        cleanupTempFiles(localFilePath, thumbPath, hlsData.hlsFolder);

        res.write(`data: ${JSON.stringify({ success: true, video: videoData })}\n\n`);
        res.end();
    } catch (error) {
        console.error("Upload process failed:", error);
        console.error("Error details:", error.stack);
        cleanupTempFiles(localFilePath, thumbPath, hlsData?.hlsFolder);
        
        res.write(`data: ${JSON.stringify({ error: error.message || 'Upload failed' })}\n\n`);
        res.end();
    }
};

function cleanupTempFiles(videoPath, thumbPath, hlsFolder) {
    try {
        if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        if (hlsFolder && fs.existsSync(hlsFolder)) {
            const files = fs.readdirSync(hlsFolder);
            for (const file of files) {
                fs.unlinkSync(path.join(hlsFolder, file));
            }
            fs.rmdirSync(hlsFolder);
        }
    } catch(e) { console.error("Error during cleanup:", e.message); }
}

exports.getVideos = (req, res) => {
    try {
        const allVideos = getStoredVideos();
        // Filter videos to only show user's own videos
        const userVideos = allVideos.filter(video => video.userId === req.user.id);
        console.log(`User ${req.user.id} has ${userVideos.length} videos`);
        res.json(userVideos);
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
};

exports.getVideoById = (req, res) => {
    try {
        const videoId = req.params.videoId;
        const videos = getStoredVideos();
        const video = videos.find(v => v.id === videoId);
        
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        // Check ownership - user can only access their own videos
        if (video.userId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });
        }
        
        res.json(video);
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
};

exports.renameVideo = (req, res) => {
    try {
        const videoId = req.params.videoId;
        const { filename } = req.body;
        
        if (!filename || !filename.trim()) {
            return res.status(400).json({ error: 'Filename is required' });
        }
        
        const videos = getStoredVideos();
        const videoIndex = videos.findIndex(v => v.id === videoId);
        
        if (videoIndex === -1) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        // Check ownership
        if (videos[videoIndex].userId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });
        }
        
        // Update the filename
        videos[videoIndex].filename = filename.trim();
        saveVideos(videos);
        
        console.log(`Video ${videoId} renamed to: ${filename}`);
        res.json({ 
            message: 'Video renamed successfully',
            video: videos[videoIndex]
        });
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ error: 'Failed to rename video' });
    }
};

exports.togglePrivacy = (req, res) => {
    try {
        const videoId = req.params.videoId;
        const videos = getStoredVideos();
        const videoIndex = videos.findIndex(v => v.id === videoId);
        
        if (videoIndex === -1) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        // Check ownership
        if (videos[videoIndex].userId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });
        }
        
        // Toggle the isPublic flag (default to false/private if not set)
        const currentStatus = videos[videoIndex].isPublic !== true;
        videos[videoIndex].isPublic = !currentStatus;
        
        saveVideos(videos);
        
        console.log(`Video ${videoId} privacy toggled to: ${videos[videoIndex].isPublic ? 'PUBLIC' : 'PRIVATE'}`);
        res.json({ 
            message: 'Video privacy toggled successfully',
            video: videos[videoIndex]
        });
    } catch (error) {
        console.error('Toggle privacy error:', error);
        res.status(500).json({ error: 'Failed to toggle video privacy' });
    }
};

exports.getThumbnail = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = getStoredVideos().find(v => v.id === videoId);
        if (!video || !video.thumbnailFileId) return res.status(404).end();
        
        // Check ownership
        if (video.userId !== req.user.id) {
            return res.status(403).end();
        }
        
        const telegramFile = await telegramService.getFileUrl(video.thumbnailFileId);
        
        // Proxy the image directly
        const response = await axios.get(telegramFile.url, { responseType: 'stream' });
        response.data.pipe(res);
    } catch(e) {
        res.status(500).end();
    }
};

// Returns the m3u8 playlist file, dynamically rewriting the TS chunk URLs to point to our proxy
exports.getPlaylist = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = getStoredVideos().find(v => v.id === videoId);

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        // Check ownership
        if (video.userId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const telegramFile = await telegramService.getFileUrl(video.playlistFileId);
        
        const response = await axios.get(telegramFile.url);
        let m3u8Content = response.data;

        // The m3u8 file contains filenames like `segment_000.ts`.
        // We replace them with absolute paths to our chunk proxy endpoint.
        // e.g., `/api/videos/stream/VIDEO_ID/chunk/segment_000.ts`
        
        // We can just replace the .ts filename string with our routing URL
        video.chunks.forEach(chunk => {
            const proxyUrl = `/api/videos/stream/${videoId}/chunk/${chunk.name}`;
            m3u8Content = m3u8Content.replace(chunk.name, proxyUrl);
        });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(m3u8Content);

    } catch (error) {
        console.error('Playlist error:', error.message);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
};

// Redirects the chunk request to Cloudflare Worker, keeping Bot Token hidden!
exports.getChunk = async (req, res) => {
    try {
        const { videoId, chunkName } = req.params;
        const video = getStoredVideos().find(v => v.id === videoId);

        if (!video) return res.status(404).json({ error: 'Video not found' });
        
        // Check ownership
        if (video.userId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const chunk = video.chunks.find(c => c.name === chunkName);
        if (!chunk) return res.status(404).json({ error: 'Chunk not found' });

        // Get fresh temporary Telegram URL
        const telegramFile = await telegramService.getFileUrl(chunk.fileId);
        
        const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
        if (!workerUrl) throw new Error("Cloudflare worker URL not configured");

        // Redirect client to Cloudflare Worker edge cache
        const targetUrl = new URL(workerUrl);
        targetUrl.searchParams.set('url', telegramFile.url);

        res.redirect(302, targetUrl.toString());

    } catch (error) {
        console.error('Chunk streaming error:', error.message);
        res.status(500).json({ error: 'Failed to proxy chunk' });
    }
};

exports.deleteVideo = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const videos = getStoredVideos();        
        // Find video and check ownership
        const videoIndex = videos.findIndex(v => v.id === videoId);
        if (videoIndex === -1) {
            return res.status(404).json({ error: 'Video not found' });
        }
        const video = videos[videoIndex];
        if (video.userId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });
        }

        // Delete all chunks from Telegram
        console.log(`Deleting video ${videoId} from Telegram...`);
        
        // Delete thumbnail message (use messageId if available, otherwise skip)
        if (video.thumbnailMessageId) {
            await telegramService.deleteFile(video.thumbnailMessageId);
        } else if (video.thumbnailFileId) {
            console.log('Thumbnail message ID not available, skipping deletion');
        }

        // Delete playlist file message
        if (video.playlistMessageId) {
            await telegramService.deleteFile(video.playlistMessageId);
        } else if (video.playlistFileId) {
            console.log('Playlist message ID not available, skipping deletion');
        }

        // Delete all TS chunk messages
        let deletedCount = 0;
        for (const chunk of video.chunks) {
            if (chunk.messageId) {
                await telegramService.deleteFile(chunk.messageId);
                deletedCount++;
            } else if (chunk.fileId) {
                console.log(`Chunk ${chunk.name} message ID not available, skipping`);
            }
        }
        
        console.log(`Deleted ${deletedCount}/${video.chunks.length} chunks from Telegram`);

        // Remove from local storage
        videos.splice(videoIndex, 1);
        saveVideos(videos);

        console.log(`Video ${videoId} deleted successfully`);
        res.json({ message: 'Video deleted successfully', videoId });
    } catch (error) {
        console.error('Delete error:', error.message);
        res.status(500).json({ error: 'Failed to delete video', details: error.message });
    }
};
