document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('hls-player');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const playerControls = document.getElementById('player-controls');
    
    // Button Elements
    const playPauseBtn = document.getElementById('play-pause-btn');
    const rewindBtn = document.getElementById('rewind-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const muteBtn = document.getElementById('mute-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const timeDisplay = document.getElementById('time-display');
    const speedBtn = document.getElementById('speed-btn');
    const speedMenu = document.getElementById('speed-menu');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    
    // Progress Elements
    const progressTrack = document.getElementById('progress-track');
    const progressPlayed = document.getElementById('progress-played');
    const progressBuffered = document.getElementById('progress-buffered');
    const progressThumb = document.getElementById('progress-thumb');
    
    let currentSpeed = 1;
    let hideControlsTimeout;
    
    // ========== CORE FUNCTIONALITY ==========
    
    // Get video ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    
    if (!videoId) {
        showError('No video ID provided');
    } else {
        updateMetaTags(videoId);
        loadVideo(videoId);
    }
    
    // ========== VIDEO LOADING ==========
    
    async function updateMetaTags(videoId) {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/videos/${videoId}${token ? '?token=' + token : ''}`);
            if (res.ok) {
                const video = await res.json();
                const videoTitle = video.filename?.replace(/\.[^/.]+$/, '') || 'StreamFlix Video';
                const thumbnailUrl = `/api/videos/thumbnail/${videoId}`;
                
                document.title = `${videoTitle} - StreamFlix`;
                document.querySelector('meta[property="og:title"]').content = videoTitle;
                document.querySelector('meta[property="og:image"]').content = `${window.location.origin}${thumbnailUrl}`;
                document.querySelector('meta[property="og:url"]').content = window.location.href;
            }
        } catch (err) {
            console.error('Failed to update meta tags:', err);
        }
    }
    
    async function loadVideo(videoId) {
        try {
            const token = localStorage.getItem('token');
            const m3u8Url = `/api/videos/stream/${videoId}/master.m3u8${token ? '?token=' + token : ''}`;
            
            if (Hls.isSupported()) {
                const hls = new Hls({
                    capLevelToPlayerSize: true,
                    maxBufferLength: 30,
                    autoStartLoad: true,
                    xhrSetup: (xhr, url) => {
                        if (token) {
                            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                        }
                    }
                });
                
                hls.loadSource(m3u8Url);
                hls.attachMedia(videoElement);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    loader.classList.add('hidden');
                    videoElement.play().catch(err => {
                        console.log('Auto-play prevented');
                    });
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        loader.classList.add('hidden');
                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            showError('Network error - video may not be available');
                        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            showError('Media error - video cannot be played');
                        } else {
                            showError('Error loading video');
                        }
                    }
                });
            } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                videoElement.src = m3u8Url;
                loader.classList.add('hidden');
                videoElement.play();
            } else {
                showError('HLS streaming not supported');
            }
        } catch (err) {
            console.error('Video load error:', err);
            showError('Failed to load video');
        }
    }
    
    function showError(message) {
        loader.classList.add('hidden');
        errorMessage.classList.remove('hidden');
        if (message) {
            errorMessage.querySelector('.error-text').textContent = message;
        }
    }
    
    // ========== PLAYBACK CONTROLS ==========
    
    playPauseBtn.addEventListener('click', () => {
        if (videoElement.paused) {
            videoElement.play();
            playPauseBtn.textContent = '⏸';
        } else {
            videoElement.pause();
            playPauseBtn.textContent = '▶';
        }
        showControls();
    });
    
    rewindBtn.addEventListener('click', () => {
        videoElement.currentTime -= 10;
        showControls();
    });
    
    forwardBtn.addEventListener('click', () => {
        videoElement.currentTime += 10;
        showControls();
    });
    
    videoElement.addEventListener('play', () => {
        playPauseBtn.textContent = '⏸';
    });
    
    videoElement.addEventListener('pause', () => {
        playPauseBtn.textContent = '▶';
    });
    
    // ========== VOLUME CONTROL ==========
    
    volumeSlider.addEventListener('input', (e) => {
        const volume = parseFloat(e.target.value);
        videoElement.volume = volume;
        updateMuteIcon(volume);
    });
    
    muteBtn.addEventListener('click', () => {
        if (videoElement.volume > 0) {
            videoElement.volume = 0;
            volumeSlider.value = 0;
        } else {
            videoElement.volume = 0.5;
            volumeSlider.value = 0.5;
        }
        updateMuteIcon(videoElement.volume);
        showControls();
    });
    
    function updateMuteIcon(volume) {
        if (volume === 0) {
            muteBtn.textContent = '🔇';
        } else if (volume < 0.5) {
            muteBtn.textContent = '🔉';
        } else {
            muteBtn.textContent = '🔊';
        }
    }
    
    // ========== PROGRESS BAR ==========
    
    videoElement.addEventListener('timeupdate', () => {
        updateProgressBar();
        updateTimeDisplay();
    });
    
    videoElement.addEventListener('progress', () => {
        updateBufferedProgress();
    });
    
    function updateProgressBar() {
        if (videoElement.duration) {
            const percent = (videoElement.currentTime / videoElement.duration) * 100;
            progressPlayed.style.width = percent + '%';
            progressThumb.style.left = percent + '%';
        }
    }
    
    function updateBufferedProgress() {
        if (videoElement.buffered.length > 0) {
            const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
            const percent = (bufferedEnd / videoElement.duration) * 100;
            progressBuffered.style.width = percent + '%';
        }
    }
    
    function updateTimeDisplay() {
        const current = formatTime(videoElement.currentTime);
        const total = formatTime(videoElement.duration);
        timeDisplay.textContent = `${current} / ${total}`;
    }
    
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }
    
    // Seek functionality
    progressTrack.addEventListener('click', (e) => {
        const rect = progressTrack.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        videoElement.currentTime = percent * videoElement.duration;
        showControls();
    });
    
    // ========== SPEED CONTROL ==========
    
    speedBtn.addEventListener('click', () => {
        speedMenu.classList.toggle('active');
        showControls();
    });
    
    speedMenu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const speed = parseFloat(btn.dataset.speed);
            currentSpeed = speed;
            videoElement.playbackRate = speed;
            speedBtn.textContent = speed === 1 ? '1×' : speed + '×';
            
            speedMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            speedMenu.classList.remove('active');
            showControls();
        });
    });
    
    // ========== FULLSCREEN ==========
    
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Fullscreen error:', err);
            });
        } else {
            document.exitFullscreen();
        }
        showControls();
    });
    
    // ========== CONTROLS AUTO-HIDE ==========
    
    document.addEventListener('mousemove', showControls);
    document.addEventListener('touchstart', showControls);
    
    function showControls() {
        playerControls.classList.remove('hidden');
        clearTimeout(hideControlsTimeout);
        hideControlsTimeout = setTimeout(() => {
            if (!videoElement.paused) {
                playerControls.classList.add('hidden');
            }
        }, 3000);
    }
    
    // Prevent auto-hide when paused
    videoElement.addEventListener('pause', () => {
        clearTimeout(hideControlsTimeout);
        playerControls.classList.remove('hidden');
    });
});
