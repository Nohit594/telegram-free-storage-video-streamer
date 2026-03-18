const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ffmpegPath = path.join(__dirname, '../ffmpeg.exe');
if (fs.existsSync(ffmpegPath)) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

// ffprobe is optional (full FFmpeg build). If not present, fixed timestamps are used.
const ffprobePath = path.join(__dirname, '../ffprobe.exe');
if (fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
}

const hlsOutputDir = path.join(__dirname, '../hls');
if (!fs.existsSync(hlsOutputDir)) {
    fs.mkdirSync(hlsOutputDir);
}

/**
 * Converts a video file to HLS format (.m3u8 playlist + .ts chunks).
 * @param {string} inputFilePath 
 * @returns {Promise<Object>} Path to the generated .m3u8 file and the unique directory name.
 */
exports.convertToHLS = (inputFilePath) => {
    return new Promise((resolve, reject) => {
        const uniqueId = uuidv4();
        const outputFolder = path.join(hlsOutputDir, uniqueId);
        
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder);
        }

        const m3u8Path = path.join(outputFolder, 'index.m3u8');

        // We use 10-second segments to keep file sizes well under the 20MB limit
        // Video bitrate ~2500k, Audio ~128k = ~3-4MB per 10s chunk.
        ffmpeg(inputFilePath)
            .outputOptions([
                '-profile:v main',
                '-vf scale=-2:720', // Scale to 720p to maintain reasonable file sizes
                '-c:v libx264',
                '-preset ultrafast', // Faster processing for this demo
                '-crf 23',
                '-maxrate 2500k',
                '-bufsize 5000k',
                '-c:a aac',
                '-b:a 128k',
                '-ac 2',
                '-f hls',
                '-hls_time 10',      // 10 second chunks
                '-hls_playlist_type vod',
                '-hls_segment_filename', path.join(outputFolder, 'segment_%03d.ts')
            ])
            .output(m3u8Path)
            .on('end', () => {
                console.log(`HLS conversion completed to ${m3u8Path}`);
                resolve({ m3u8Path, hlsFolder: outputFolder, uniqueId });
            })
            .on('error', (err) => {
                const errorMsg = err.message.includes('ffmpeg') ? 'FFmpeg not found on this system. Please install FFmpeg.' : err.message;
                console.error('Error during FFmpeg HLS conversion:', errorMsg);
                reject(new Error(errorMsg));
            })
            .run();
    });
};

/**
 * Extracts a thumbnail from the video.
 * @param {string} inputFilePath 
 * @returns {Promise<string>} Path to the generated thumbnail file.
 */
exports.generateThumbnail = (inputFilePath) => {
    return new Promise((resolve, reject) => {
        const uniqueId = uuidv4();
        const thumbnailName = `thumb_${uniqueId}.jpg`;
        const tempThumbDir = path.join(__dirname, '../uploads');
        const thumbPath = path.join(tempThumbDir, thumbnailName);

        // Use raw output options to seek to 5s and grab exactly 1 frame
        // This avoids the .screenshots() helper which internally calls ffprobe
        ffmpeg(inputFilePath)
            .seekInput(5)           // Seek input before decoding (fast)
            .outputOptions([
                '-vframes 1',       // Extract exactly 1 frame
                '-q:v 2'            // High quality JPEG
            ])
            .output(thumbPath)
            .on('end', () => {
                console.log(`Thumbnail generated at ${thumbPath}`);
                resolve(thumbPath);
            })
            .on('error', (err) => {
                console.error('Error generating thumbnail:', err.message);
                reject(err);
            })
            .run();
    });
};
