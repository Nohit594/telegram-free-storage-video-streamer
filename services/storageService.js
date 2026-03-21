const fs = require('fs');
const path = require('path');
const axios = require('axios');
const telegramService = require('./telegramService');

const STORAGE_PROVIDER = 'telegram';
const DEFAULT_UPLOAD_DELAY_MS = Number(process.env.TELEGRAM_UPLOAD_DELAY_MS || 800);
const MAX_UPLOAD_RETRIES = Number(process.env.TELEGRAM_UPLOAD_MAX_RETRIES || 6);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTelegramRetryDelayMs(error, attempt) {
    const retryAfterSeconds = error?.response?.data?.parameters?.retry_after;
    if (retryAfterSeconds && Number.isFinite(Number(retryAfterSeconds))) {
        return (Number(retryAfterSeconds) * 1000) + 300;
    }

    const baseDelay = 1200;
    const backoff = Math.min(12000, baseDelay * Math.pow(2, Math.max(0, attempt - 1)));
    return backoff + Math.floor(Math.random() * 400);
}

function isRateLimitError(error) {
    return error?.response?.status === 429
        || error?.message?.includes('429')
        || error?.response?.data?.error_code === 429;
}

async function withTelegramRetry(task, label, onRetry) {
    for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
        try {
            return await task();
        } catch (error) {
            const retryable = isRateLimitError(error);
            const isLastAttempt = attempt === MAX_UPLOAD_RETRIES;

            if (!retryable || isLastAttempt) {
                throw error;
            }

            const delayMs = getTelegramRetryDelayMs(error, attempt);
            onRetry?.({ label, attempt, delayMs });
            await sleep(delayMs);
        }
    }
}

function listFilesRecursively(baseDir, relativeDir = '') {
    const currentDir = path.join(baseDir, relativeDir);
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            files.push(...listFilesRecursively(baseDir, relativePath));
        } else {
            files.push(relativePath);
        }
    }

    return files;
}

function sanitizeRelativePath(relativePath) {
    const normalized = path.posix.normalize((relativePath || '').replace(/\\/g, '/'));
    if (!normalized || normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
        throw new Error('Invalid asset path');
    }
    return normalized;
}

async function uploadToTelegram({ hlsFolder, thumbPath, onProgress }) {
    const files = listFilesRecursively(hlsFolder).sort();
    const assets = [];

    const totalAssetBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(hlsFolder, file)).size, 0);
    let uploadedBytes = 0;

    const thumbnail = await withTelegramRetry(
        () => telegramService.sendPhoto(thumbPath),
        'thumbnail',
        ({ attempt, delayMs }) => {
            onProgress?.({
                phase: 'storing',
                message: `Telegram busy, retrying thumbnail (attempt ${attempt + 1}) in ${Math.ceil(delayMs / 1000)}s...`,
                percent: 8
            });
        }
    );

    onProgress?.({
        phase: 'storing',
        message: 'Thumbnail uploaded',
        percent: 8
    });

    await sleep(DEFAULT_UPLOAD_DELAY_MS);

    for (let i = 0; i < files.length; i++) {
        const relativePath = files[i];
        const absolutePath = path.join(hlsFolder, relativePath);
        const result = await withTelegramRetry(
            () => telegramService.sendDocument(absolutePath),
            relativePath,
            ({ attempt, delayMs }) => {
                const percent = 8 + ((uploadedBytes / (totalAssetBytes || 1)) * 92);
                onProgress?.({
                    phase: 'storing',
                    message: `Telegram rate limit on ${relativePath}, retry ${attempt + 1} in ${Math.ceil(delayMs / 1000)}s...`,
                    percent: Math.min(100, percent)
                });
            }
        );
        const size = fs.statSync(absolutePath).size;

        assets.push({
            path: relativePath,
            fileId: result.fileId,
            messageId: result.messageId,
            size
        });

        uploadedBytes += size;
        const percent = 8 + ((uploadedBytes / (totalAssetBytes || 1)) * 92);
        onProgress?.({
            phase: 'storing',
            message: `Uploading assets (${i + 1}/${files.length})`,
            percent: Math.min(100, percent)
        });

        await sleep(DEFAULT_UPLOAD_DELAY_MS);
    }

    return {
        provider: 'telegram',
        thumbnailFileId: thumbnail.fileId,
        thumbnailMessageId: thumbnail.messageId,
        assets
    };
}

function getProvider() {
    return STORAGE_PROVIDER;
}

async function storeArtifacts({ hlsFolder, thumbPath, onProgress }) {
    return uploadToTelegram({ hlsFolder, thumbPath, onProgress });
}

async function getTelegramAssetText(video, assetPath) {
    const asset = (video.assets || []).find((item) => item.path === assetPath);
    if (!asset?.fileId) {
        throw new Error('Asset not found in Telegram storage');
    }

    const telegramFile = await telegramService.getFileUrl(asset.fileId);
    const response = await axios.get(telegramFile.url);
    return response.data;
}

async function getAssetText(video, assetPath) {
    const sanitizedPath = sanitizeRelativePath(assetPath);
    return getTelegramAssetText(video, sanitizedPath);
}

async function getTelegramAssetProxyUrl(video, assetPath) {
    const sanitizedPath = sanitizeRelativePath(assetPath);
    const asset = (video.assets || []).find((item) => item.path === sanitizedPath);
    if (!asset?.fileId) {
        throw new Error('Asset not found in Telegram storage');
    }

    const telegramFile = await telegramService.getFileUrl(asset.fileId);
    return telegramFile.url;
}

async function getTelegramThumbnailProxyUrl(video) {
    if (!video.thumbnailFileId) {
        throw new Error('Thumbnail not found in Telegram storage');
    }

    const telegramFile = await telegramService.getFileUrl(video.thumbnailFileId);
    return telegramFile.url;
}

async function deleteTelegramAssets(video) {
    const messageIds = new Set();

    if (video.thumbnailMessageId) messageIds.add(String(video.thumbnailMessageId));
    if (video.playlistMessageId) messageIds.add(String(video.playlistMessageId));

    for (const asset of (video.assets || [])) {
        if (asset.messageId) messageIds.add(String(asset.messageId));
    }

    for (const chunk of (video.chunks || [])) {
        if (chunk.messageId) messageIds.add(String(chunk.messageId));
    }

    for (const messageId of messageIds) {
        await telegramService.deleteFile(messageId);
    }
}

module.exports = {
    getProvider,
    storeArtifacts,
    getAssetText,
    getTelegramAssetProxyUrl,
    sanitizeRelativePath,
    getTelegramThumbnailProxyUrl,
    deleteTelegramAssets
};
