const hlsService = require('../services/hlsService');
const storageService = require('../services/storageService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Video = require('../models/Video');

const MASTER_PLAYLIST_NAME = 'master.m3u8';

const canAccessVideo = (video, req) => {
    if (video.isPublic) return true;
    if (req.user && video.userId.toString() === req.user.id) return true;
    return false;
};

function sendSse(res, payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function ensureSseHeaders(req, res) {
    req.setTimeout(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
}

function cleanupTempFiles(videoPath, thumbPath, hlsFolder) {
    try {
        if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        if (hlsFolder && fs.existsSync(hlsFolder)) fs.rmSync(hlsFolder, { recursive: true, force: true });
    } catch (error) {
        console.error('Cleanup warning:', error.message);
    }
}

function rewriteMasterPlaylist(content, videoId, isPublicRoute) {
    const basePath = isPublicRoute
        ? `/api/videos/public/stream/${videoId}/asset?path=`
        : `/api/videos/stream/${videoId}/asset?path=`;

    return content
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            return `${basePath}${encodeURIComponent(trimmed)}`;
        })
        .join('\n');
}

function rewriteVariantPlaylist(content, videoId, variantPath, isPublicRoute) {
    const basePath = isPublicRoute
        ? `/api/videos/public/stream/${videoId}/asset?path=`
        : `/api/videos/stream/${videoId}/asset?path=`;

    const variantDir = path.posix.dirname(variantPath);

    return content
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            const absoluteAssetPath = path.posix.normalize(path.posix.join(variantDir, trimmed));
            return `${basePath}${encodeURIComponent(absoluteAssetPath)}`;
        })
        .join('\n');
}

exports.uploadVideo = async (req, res) => {
    let localFilePath = null;
    let hlsData = null;
    let thumbPath = null;

    ensureSseHeaders(req, res);

    try {
        if (!req.file) {
            sendSse(res, { error: 'No video file uploaded' });
            return res.end();
        }

        if (!req.user || !req.user.id) {
            sendSse(res, { error: 'User not authenticated' });
            return res.end();
        }

        localFilePath = req.file.path;
        sendSse(res, { phase: 'converting', percent: 2, message: 'Starting FFmpeg pipeline...' });

        const conversionPromise = hlsService.convertToHLS(localFilePath, {
            onProgress: (percent, timemark) => {
                const mapped = 5 + (Math.min(100, percent) * 0.6);
                sendSse(res, {
                    phase: 'converting',
                    percent: Math.round(mapped),
                    message: timemark
                        ? `Encoding adaptive streams (${timemark})...`
                        : 'Encoding adaptive streams...'
                });
            }
        });

        const thumbnailPromise = hlsService.generateThumbnail(localFilePath);

        [hlsData, thumbPath] = await Promise.all([conversionPromise, thumbnailPromise]);

        sendSse(res, { phase: 'storing', percent: 70, message: 'Uploading HLS assets to Telegram...' });

        const storageResult = await storageService.storeArtifacts({
            hlsFolder: hlsData.hlsFolder,
            thumbPath,
            onProgress: ({ percent, message }) => {
                const mapped = 70 + (Math.min(100, percent) * 0.25);
                sendSse(res, {
                    phase: 'storing',
                    percent: Math.round(mapped),
                    message
                });
            }
        });

        const masterAsset = (storageResult.assets || []).find((asset) => asset.path === MASTER_PLAYLIST_NAME);
        const chunkAssets = (storageResult.assets || []).filter((asset) => asset.path.endsWith('.ts'));

        sendSse(res, { phase: 'finalizing', percent: 96, message: 'Saving metadata...' });

        const videoData = new Video({
            id: hlsData.uniqueId,
            userId: req.user.id,
            filename: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            storageProvider: 'telegram',
            thumbnailFileId: storageResult.thumbnailFileId,
            thumbnailMessageId: storageResult.thumbnailMessageId,
            masterPlaylistPath: MASTER_PLAYLIST_NAME,
            assets: storageResult.assets,
            variants: hlsData.variants,
            availableQualities: hlsData.variants.map((variant) => variant.name),
            durationSeconds: hlsData.durationSeconds || undefined,
            playlistFileId: masterAsset?.fileId,
            playlistMessageId: masterAsset?.messageId,
            chunks: chunkAssets.map((asset) => ({
                name: asset.path,
                fileId: asset.fileId,
                messageId: asset.messageId
            })),
            uploadTime: new Date().toISOString(),
            originalSize: req.file.size,
            isPublic: false
        });

        await videoData.save();

        cleanupTempFiles(localFilePath, thumbPath, hlsData.hlsFolder);

        sendSse(res, { success: true, video: videoData, percent: 100, message: 'Upload complete' });
        res.end();
    } catch (error) {
        console.error('Upload process failed:', error);
        cleanupTempFiles(localFilePath, thumbPath, hlsData?.hlsFolder);
        sendSse(res, { error: error.message || 'Upload failed' });
        res.end();
    }
};

exports.getVideos = async (req, res) => {
    try {
        const userVideos = await Video.find({ userId: req.user.id }).sort({ uploadTime: -1 });
        res.json(userVideos);
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
};

exports.getVideoById = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = await Video.findOne({ id: videoId });

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (!canAccessVideo(video, req)) return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });

        res.json(video);
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
};

exports.renameVideo = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const { filename } = req.body;

        if (!filename || !filename.trim()) {
            return res.status(400).json({ error: 'Filename is required' });
        }

        const video = await Video.findOne({ id: videoId });

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (video.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });
        }

        video.filename = filename.trim();
        video.updatedAt = new Date();
        await video.save();

        res.json({ message: 'Video renamed successfully', video });
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ error: 'Failed to rename video' });
    }
};

exports.togglePrivacy = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = await Video.findOne({ id: videoId });

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (video.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });
        }

        video.isPublic = !video.isPublic;
        video.updatedAt = new Date();
        await video.save();

        res.json({ message: 'Video privacy toggled successfully', video });
    } catch (error) {
        console.error('Toggle privacy error:', error);
        res.status(500).json({ error: 'Failed to toggle video privacy' });
    }
};

exports.getThumbnail = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = await Video.findOne({ id: videoId });

        if (!video || !video.thumbnailFileId) return res.status(404).end();
        if (!canAccessVideo(video, req)) return res.status(403).end();

        const telegramUrl = await storageService.getTelegramThumbnailProxyUrl(video);
        const response = await axios.get(telegramUrl, { responseType: 'stream' });
        response.data.pipe(res);
    } catch (error) {
        console.error('Thumbnail error:', error.message);
        res.status(500).end();
    }
};

exports.getPlaylist = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = await Video.findOne({ id: videoId });

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (!canAccessVideo(video, req)) return res.status(403).json({ error: 'Unauthorized' });

        const isPublicRoute = req.path.includes('/public/');
        const masterPath = video.masterPlaylistPath || MASTER_PLAYLIST_NAME;
        const rawMaster = await storageService.getAssetText(video, masterPath);
        const rewritten = rewriteMasterPlaylist(rawMaster, videoId, isPublicRoute);

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewritten);
    } catch (error) {
        console.error('Playlist error:', error.message);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
};

exports.getAsset = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const requestedAssetPath = req.query.path;

        if (!requestedAssetPath) {
            return res.status(400).json({ error: 'Asset path is required' });
        }

        const assetPath = storageService.sanitizeRelativePath(requestedAssetPath);
        const video = await Video.findOne({ id: videoId });

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (!canAccessVideo(video, req)) return res.status(403).json({ error: 'Unauthorized' });

        if (assetPath.endsWith('.m3u8')) {
            const isPublicRoute = req.path.includes('/public/');
            const playlistContent = await storageService.getAssetText(video, assetPath);
            const rewritten = rewriteVariantPlaylist(playlistContent, videoId, assetPath, isPublicRoute);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(rewritten);
        }

        const telegramAssetUrl = await storageService.getTelegramAssetProxyUrl(video, assetPath);
        const workerUrl = process.env.CLOUDFLARE_WORKER_URL;

        if (workerUrl) {
            const targetUrl = new URL(workerUrl);
            targetUrl.searchParams.set('url', telegramAssetUrl);
            return res.redirect(302, targetUrl.toString());
        }

        return res.redirect(302, telegramAssetUrl);
    } catch (error) {
        console.error('Asset streaming error:', error.message);
        res.status(500).json({ error: 'Failed to stream asset' });
    }
};

exports.getChunk = async (req, res) => {
    const { videoId, chunkName } = req.params;
    req.query.path = chunkName;
    req.params.videoId = videoId;
    return exports.getAsset(req, res);
};

exports.deleteVideo = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = await Video.findOne({ id: videoId });

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (video.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized - this video belongs to another user' });
        }

        await storageService.deleteTelegramAssets(video);
        await Video.deleteOne({ id: videoId });

        res.json({ message: 'Video deleted successfully', videoId });
    } catch (error) {
        console.error('Delete error:', error.message);
        res.status(500).json({ error: 'Failed to delete video', details: error.message });
    }
};
