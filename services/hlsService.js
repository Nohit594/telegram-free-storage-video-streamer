const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// On Windows development: try to use local ffmpeg.exe if available
// On production (Railway): will use system-installed ffmpeg
const ffmpegPath = path.join(__dirname, '../ffmpeg.exe');
if (fs.existsSync(ffmpegPath)) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log('Using local ffmpeg.exe');
} else {
    console.log('Using system ffmpeg (no local exe found)');
}

// ffprobe is optional (full FFmpeg build). If not present, fixed timestamps are used.
const ffprobePath = path.join(__dirname, '../ffprobe.exe');
if (fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
    console.log('Using local ffprobe.exe');
}

const hlsOutputDir = path.join(__dirname, '../hls');
if (!fs.existsSync(hlsOutputDir)) {
    fs.mkdirSync(hlsOutputDir);
}

const HLS_VARIANTS = [
    { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', maxRate: '5350k', bufferSize: '7500k', audioBitrate: '192k', bandwidth: 5350000 },
    { name: '720p', width: 1280, height: 720, videoBitrate: '2800k', maxRate: '2996k', bufferSize: '4200k', audioBitrate: '128k', bandwidth: 2996000 },
    { name: '480p', width: 854, height: 480, videoBitrate: '1400k', maxRate: '1498k', bufferSize: '2100k', audioBitrate: '128k', bandwidth: 1498000 },
    { name: '360p', width: 640, height: 360, videoBitrate: '800k', maxRate: '856k', bufferSize: '1200k', audioBitrate: '96k', bandwidth: 856000 }
];

function getVideoDurationSeconds(inputFilePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(inputFilePath, (err, metadata) => {
            if (err) {
                console.warn('ffprobe failed, duration unavailable:', err.message);
                return resolve(null);
            }

            const duration = metadata?.format?.duration;
            resolve(typeof duration === 'number' ? duration : null);
        });
    });
}

/**
 * Converts a video file to HLS format (.m3u8 playlist + .ts chunks).
 * @param {string} inputFilePath 
 * @returns {Promise<Object>} Path to the generated .m3u8 file and the unique directory name.
 */
exports.convertToHLS = async (inputFilePath, options = {}) => {
    const { onProgress } = options;

    const durationSeconds = await getVideoDurationSeconds(inputFilePath);

    return new Promise((resolve, reject) => {
        const uniqueId = uuidv4();
        const outputFolder = path.join(hlsOutputDir, uniqueId);
        
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder);
        }

        HLS_VARIANTS.forEach((_, index) => {
            const variantFolder = path.join(outputFolder, `v${index}`);
            if (!fs.existsSync(variantFolder)) {
                fs.mkdirSync(variantFolder);
            }
        });

        const splitOutputs = HLS_VARIANTS.map((_, i) => `[v${i}]`).join('');
        const scaleFilters = HLS_VARIANTS.map((variant, i) => (
            `[v${i}]scale=w=${variant.width}:h=${variant.height}:force_original_aspect_ratio=decrease,pad=${variant.width}:${variant.height}:(ow-iw)/2:(oh-ih)/2:color=black[v${i}out]`
        )).join(';');
        const filterComplex = `[0:v]split=${HLS_VARIANTS.length}${splitOutputs};${scaleFilters}`;

        const outputOptions = [
            '-filter_complex', filterComplex,
            '-preset', 'veryfast',
            '-sc_threshold', '0',
            '-g', '48',
            '-keyint_min', '48',
            '-hls_time', '6',
            '-hls_playlist_type', 'vod',
            '-hls_flags', 'independent_segments',
            '-hls_segment_type', 'mpegts',
            '-hls_segment_filename', path.join(outputFolder, 'v%v', 'segment_%03d.ts'),
            '-master_pl_name', 'master.m3u8',
            '-f', 'hls'
        ];

        HLS_VARIANTS.forEach((variant, index) => {
            outputOptions.push('-map', `[v${index}out]`);
            outputOptions.push('-map', '0:a:0?');
            outputOptions.push(`-c:v:${index}`, 'libx264');
            outputOptions.push(`-profile:v:${index}`, 'main');
            outputOptions.push(`-b:v:${index}`, variant.videoBitrate);
            outputOptions.push(`-maxrate:v:${index}`, variant.maxRate);
            outputOptions.push(`-bufsize:v:${index}`, variant.bufferSize);
            outputOptions.push(`-c:a:${index}`, 'aac');
            outputOptions.push(`-b:a:${index}`, variant.audioBitrate);
            outputOptions.push(`-ac:${index}`, '2');
            outputOptions.push(`-ar:${index}`, '48000');
        });

        outputOptions.push(
            '-var_stream_map',
            HLS_VARIANTS.map((variant, index) => `v:${index},a:${index},name:${variant.name}`).join(' ')
        );

        ffmpeg(inputFilePath)
            .outputOptions(outputOptions)
            .output(path.join(outputFolder, 'v%v', 'index.m3u8'))
            .on('end', () => {
                const masterPath = path.join(outputFolder, 'master.m3u8');
                console.log(`Multi-bitrate HLS conversion completed to ${masterPath}`);
                resolve({
                    m3u8Path: masterPath,
                    hlsFolder: outputFolder,
                    uniqueId,
                    durationSeconds,
                    variants: HLS_VARIANTS.map((variant, i) => ({
                        index: i,
                        ...variant,
                        playlistPath: `v${i}/index.m3u8`
                    }))
                });
            })
            .on('error', (err) => {
                console.error('Full FFmpeg error:', err);
                const errorMsg = err.message.includes('ffmpeg') 
                    ? 'FFmpeg not found on this system. Please install FFmpeg.' 
                    : err.message;
                console.error('Error during FFmpeg HLS conversion:', errorMsg);
                reject(new Error(errorMsg));
            })
            .on('start', (cmd) => {
                console.log('FFmpeg command started:', cmd);
            })
            .on('progress', (progress) => {
                if (!onProgress) return;

                if (durationSeconds && progress.timemark) {
                    const [hh = 0, mm = 0, ss = 0] = progress.timemark.split(':').map(Number);
                    const encodedSeconds = (hh * 3600) + (mm * 60) + ss;
                    const percent = Math.min(100, (encodedSeconds / durationSeconds) * 100);
                    onProgress(percent, progress.timemark);
                    return;
                }

                if (typeof progress.percent === 'number') {
                    onProgress(Math.min(100, progress.percent), progress.timemark || null);
                }
            })
            .run();
    });
};

exports.HLS_VARIANTS = HLS_VARIANTS;

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
