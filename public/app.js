document.addEventListener('DOMContentLoaded', () => {
    // ========== AUTHENTICATION SETUP ==========
    const checkAuth = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');
        const userIdFromUrl = urlParams.get('userId');
        const errorFromUrl = urlParams.get('error');
        
        // Handle authentication errors
        if (errorFromUrl) {
            console.error('Authentication error:', errorFromUrl);
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('user');
            alert('Authentication failed: ' + errorFromUrl);
            window.location.href = '/login.html';
            return;
        }
        
        // If token in URL (from Google OAuth callback), store it
        if (tokenFromUrl) {
            localStorage.setItem('token', tokenFromUrl);
            localStorage.setItem('userId', userIdFromUrl);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        const token = localStorage.getItem('token');
        const userBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const userName = document.getElementById('user-name');

        if (token) {
            // User is logged in
            userBtn.style.display = 'none';
            logoutBtn.style.display = 'block';
            
            // Fetch and display user info
            fetchUserInfo(token);
        } else {
            // User is not logged in - redirect to login
            userBtn.style.display = 'inline-block';
            logoutBtn.style.display = 'none';
            userName.style.display = 'none';
            
            // Redirect to login page
            window.location.href = '/login.html';
            return; // Stop further execution
        }
    };

    const fetchUserInfo = async (token) => {
        try {
            const response = await fetch('/auth/user?token=' + token);
            if (response.ok) {
                const data = await response.json();
                const userName = document.getElementById('user-name');
                const user = data.user;
                userName.textContent = user.firstName || user.email || 'User';
                userName.style.display = 'inline-block';
                localStorage.setItem('user', JSON.stringify(user));
            } else {
                // Token invalid, clear storage and redirect to login
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            // On error, redirect to login for safety
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        }
    };

    // Check auth on page load
    checkAuth();

    // Logout handler
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    });

    // ========== END AUTHENTICATION SETUP ==========

    // -------------------------------------------------------------
    // UI Elements
    // -------------------------------------------------------------
    const uploadNavBtn = document.getElementById('upload-nav-btn');
    const uploadModal = document.getElementById('upload-modal');
    const closeUploadBtn = document.getElementById('close-upload');
    const uploadForm = document.getElementById('upload-form');
    const videoInput = document.getElementById('video-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    const uploadBtn = document.getElementById('upload-btn');
    
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-status-text');
    
    const videosTableBody = document.getElementById('videos-table-body');
    const emptyDatabase = document.getElementById('empty-database');
    const searchInput = document.getElementById('search-input');
    const refreshBtn = document.getElementById('refresh-btn');
    
    // Stats elements
    const totalVideosEl = document.getElementById('total-videos');
    const storageUsedEl = document.getElementById('storage-used');
    const telegramFilesEl = document.getElementById('telegram-files');
    const storageInfoEl = document.getElementById('storage-info');

    const playerModal = document.getElementById('player-modal');
    const closePlayerBtn = document.getElementById('close-player');
    const deletePlayerBtn = document.getElementById('delete-player-btn');
    const videoElement = document.getElementById('hls-player');
    const playerLoader = document.getElementById('player-loader');

    // Share modal elements
    const shareModal = document.getElementById('share-modal');
    const closeShareBtn = document.getElementById('close-share');
    const shareLinkInput = document.getElementById('share-link-input');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const openLinkBtn = document.getElementById('open-link-btn');
    const playFromLinkBtn = document.getElementById('play-from-link-btn');
    const qrCodeCanvas = document.getElementById('qr-code');
    const linkTabs = document.querySelectorAll('.link-tab');
    const linkTypeLabel = document.getElementById('link-type-label');
    
    // Rename modal elements
    const renameModal = document.getElementById('rename-modal');
    const closeRenameBtn = document.getElementById('close-rename');
    const renameInput = document.getElementById('rename-input');
    const cancelRenameBtn = document.getElementById('cancel-rename-btn');
    const saveRenameBtn = document.getElementById('save-rename-btn');
    
    let currentLinkFormat = 'embed'; // Default to embed format
    let currentRenameVideoId = null; // Track video being renamed

    let hlsInstance = null;
    let currentVideoId = null;
    let currentShareVideoId = null;
    let allVideos = [];

    // Get base URL for sharing
    const getBaseUrl = () => {
        const origin = window.location.origin;
        // Ensure we have a proper http/https URL
        if (origin && (origin.startsWith('http://') || origin.startsWith('https://'))) {
            return origin;
        }
        // Fallback for development
        return 'http://localhost:3000';
    };

    // Helper function to get auth headers
    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
        };
    };

    // Generate shareable link for a video (2 formats available)
    const generateShareLink = (videoId, format = 'embed') => {
        const baseUrl = getBaseUrl();
        
        if (format === 'embed') {
            // Embed format - dedicated player page (better for sharing)
            return `${baseUrl}/watch?v=${videoId}`;
        } else {
            // App format - opens in main app with full UI
            return `${baseUrl}/?v=${videoId}`;
        }
    };

    // Parse URL parameters to check if we should play a video directly
    const parseUrlParams = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');
        if (videoId) {
            // Find video and play it
            const video = allVideos.find(v => v.id === videoId);
            if (video) {
                setTimeout(() => {
                    openPlayer(videoId, video.filename.replace(/\.[^/.]+$/, ''));
                }, 500);
            }
        }
    };

    // -------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------
    fetchVideos();
    parseUrlParams();

    // Nav Background on scroll
    window.addEventListener('scroll', () => {
        const nav = document.querySelector('.netflix-nav');
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });

    // -------------------------------------------------------------
    // Upload Flow
    // -------------------------------------------------------------
    uploadNavBtn.addEventListener('click', (e) => {
        e.preventDefault();
        uploadModal.classList.remove('hidden');
    });

    closeUploadBtn.addEventListener('click', () => {
        uploadModal.classList.add('hidden');
    });

    videoInput.addEventListener('change', () => {
        if (videoInput.files.length > 0) {
            const file = videoInput.files[0];
            
            if (file.size > 5 * 1024 * 1024 * 1024) {  // 5GB limit
                alert('File is too large. Max size is 5GB.');
                videoInput.value = '';
                return;
            }

            fileNameDisplay.textContent = file.name;
            uploadBtn.disabled = false;
            uploadBtn.classList.remove('disabled');
        }
    });

    uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (videoInput.files.length === 0) return;

        const file = videoInput.files[0];
        console.log(`Starting upload: ${file.name} (${file.size} bytes)`);
        
        const formData = new FormData();
        formData.append('video', file);

        // Lock UI
        uploadBtn.disabled = true;
        uploadBtn.classList.add('disabled');
        videoInput.disabled = true;
        progressContainer.classList.remove('hidden');
        progressText.textContent = 'Uploading to Server...';
        progressBar.style.width = '0%';
        progressBar.style.background = '#4a90e2';

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 30);
                progressBar.style.width = percentComplete + '%';
                console.log(`File upload progress: ${percentComplete}%`);
            }
        });

        xhr.onload = () => {
            console.log(`Upload request completed with status: ${xhr.status}`);
        };

        xhr.onerror = () => {
            console.error('Upload request error:', xhr.statusText);
            handleUploadError(xhr);
        };

        xhr.open('POST', '/api/videos/upload', true);
        const token = localStorage.getItem('token');
        if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        
        let lastProcessedLength = 0;
        
        xhr.onreadystatechange = () => {
            if (xhr.readyState >= 3 && xhr.status === 200) {
                console.log(`readyState: ${xhr.readyState}, responseText length: ${xhr.responseText.length}`);
                
                // Process only new data that hasn't been processed yet
                const newData = xhr.responseText.substring(lastProcessedLength);
                lastProcessedLength = xhr.responseText.length;
                
                const lines = newData.split('\n');
                
                lines.forEach(line => {
                    if (line.trim().startsWith('data: ')) {
                        try {
                            const jsonStr = line.substring(6);
                            const data = JSON.parse(jsonStr);
                            console.log('Received event:', data);
                            
                            if (data.error) {
                                console.error('Server error:', data.error);
                                progressText.textContent = 'Error: ' + data.error;
                                progressBar.style.background = '#e50914';
                                return;
                            }
                            
                            if (data.success) {
                                console.log('Upload successful!');
                                progressText.textContent = 'Upload Complete!';
                                progressBar.style.background = '#2ea043';
                                progressBar.style.width = '100%';
                                
                                setTimeout(() => {
                                    uploadModal.classList.add('hidden');
                                    resetUploadState();
                                    fetchVideos();
                                }, 2000);
                                return;
                            }
                            
                            if (data.percent !== undefined) {
                                const mappedPercent = 30 + (data.percent / 100) * 70;
                                progressBar.style.width = mappedPercent + '%';
                                progressText.textContent = data.message || 'Processing...';
                                
                                if (data.phase === 'converting') {
                                    progressBar.style.background = '#e5a909';
                                } else if (data.phase === 'uploading') {
                                    progressBar.style.background = '#e50914';
                                } else if (data.phase === 'finalizing') {
                                    progressBar.style.background = '#4a90e2';
                                }
                                console.log(`Progress: ${mappedPercent.toFixed(1)}% - ${data.message}`);
                            }
                        } catch (err) {
                            console.log('SSE parse error:', err, 'Line:', line);
                        }
                    }
                });
                
                // Handle completion on readyState 4
                if (xhr.readyState === 4) {
                    console.log('Upload request completed');
                    if (xhr.status !== 200) {
                        handleUploadError(xhr);
                    }
                }
            }
        };
        
        xhr.send(formData);
    });

    function handleUploadError(xhr) {
        console.error('Upload error:', xhr.status, xhr.statusText);
        progressText.textContent = 'Upload Failed.';
        progressBar.style.background = '#e50914';
        try {
            const res = JSON.parse(xhr.responseText);
            if(res.error) {
                progressText.textContent = 'Error: ' + res.error;
                console.error('Error from server:', res.error);
            }
            if(res.details) console.error('Error details:', res.details);
        } catch(e) {
            console.error('Could not parse error response:', xhr.responseText);
        }
        
        setTimeout(resetUploadState, 3000);
    }

    function resetUploadState() {
        uploadForm.reset();
        fileNameDisplay.textContent = 'Drag & drop or click to browse';
        uploadBtn.disabled = true;
        uploadBtn.classList.add('disabled');
        videoInput.disabled = false;
        progressContainer.classList.add('hidden');
        progressBar.style.background = 'var(--red)';
    }

    // -------------------------------------------------------------
    // Fetch & Display Videos in Database Format
    async function fetchVideos() {
        console.log('Fetching videos from server...');
        videosTableBody.innerHTML = '<tr><td colspan="6" class="loading-row">Loading from database...</td></tr>';
        
        try {
            const res = await fetch('/api/videos', {
                method: 'GET',
                headers: getAuthHeaders()
            });
            if (!res.ok) {
                if (res.status === 401) {
                    console.error('Authentication failed - redirecting to login');
                    localStorage.removeItem('token');
                    localStorage.removeItem('userId');
                    window.location.href = '/login.html';
                    return;
                }
                throw new Error(`Failed to fetch videos: ${res.status}`);
            }
            
            allVideos = await res.json();
            console.log(`Fetched ${allVideos.length} videos from database`);
            
            if (allVideos.length === 0) {
                emptyDatabase.classList.remove('hidden');
                videosTableBody.innerHTML = '';
                updateStats([]);
                return;
            }

            emptyDatabase.classList.add('hidden');
            updateStats(allVideos);
            renderTable(allVideos);

        } catch (error) {
            console.error('Fetch error:', error);
            videosTableBody.innerHTML = '<tr><td colspan="6" class="loading-row">📤 No videos yet. Click "Upload" to add your first video!</td></tr>';
        }
    }

    function updateStats(videos) {
        const totalSize = videos.reduce((sum, v) => sum + (v.originalSize || 0), 0);
        const totalChunks = videos.reduce((sum, v) => sum + (v.chunks?.length || 0), 0);
        
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
        const totalFiles = videos.length * 2 + totalChunks; // thumbnail + playlist + chunks
        
        totalVideosEl.textContent = videos.length;
        storageUsedEl.textContent = `${sizeMB} MB`;
        telegramFilesEl.textContent = totalFiles;
        storageInfoEl.textContent = `${sizeMB} MB used`;
    }

    function renderTable(videos) {
        videosTableBody.innerHTML = '';
        
        videos.forEach(video => {
            const row = document.createElement('tr');
            const uploadDate = new Date(video.uploadTime).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            const sizeMB = ((video.originalSize || 0) / (1024 * 1024)).toFixed(1);
            const chunkCount = video.chunks?.length || 0;
            const token = localStorage.getItem('token');
            const thumbnailUrl = `/api/videos/thumbnail/${video.id}${token ? '?token=' + token : ''}`;
            
            row.innerHTML = `
                <td>
                    <img src="${thumbnailUrl}" 
                         alt="${video.filename}" 
                         class="table-thumbnail"
                         onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22><rect fill=%22%23222%22 width=%22120%22 height=%2268%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23555%22 text-anchor=%22middle%22 dy=%22.35em%22 font-family=%22sans-serif%22 font-size=%2212%22>No Thumb</text></svg>'">
                </td>
                <td>
                    <div class="video-name">${video.filename}</div>
                </td>
                <td>${sizeMB} MB</td>
                <td>${uploadDate}</td>
                <td>${chunkCount} chunks</td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn primary play-btn" data-video-id="${video.id}">▶ Play</button>
                        <button class="action-btn secondary share-btn" data-video-id="${video.id}">🔗 Share</button>
                        <button class="action-btn secondary rename-btn" data-video-id="${video.id}" title="Rename video">✏️ Rename</button>
                        <button class="action-btn danger delete-btn" data-video-id="${video.id}">🗑️ Delete</button>
                    </div>
                </td>
            `;
            
            // Play button
            const playBtn = row.querySelector('.play-btn');
            playBtn.addEventListener('click', () => {
                openPlayer(video.id, video.filename.replace(/\.[^/.]+$/, ''));
            });
            
            // Share button
            const shareBtn = row.querySelector('.share-btn');
            shareBtn.addEventListener('click', () => {
                openShareModal(video.id);
            });
            
            // Rename button
            const renameBtn = row.querySelector('.rename-btn');
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openRenameModal(video.id, video.filename);
            });
            
            // Delete button
            const deleteBtn = row.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteVideo(video.id);
            });
            
            // Click on thumbnail to play
            const thumbnail = row.querySelector('.table-thumbnail');
            thumbnail.addEventListener('click', () => {
                openPlayer(video.id, video.filename.replace(/\.[^/.]+$/, ''));
            });
            
            videosTableBody.appendChild(row);
        });
    }

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (!searchTerm) {
            renderTable(allVideos);
            return;
        }
        
        const filtered = allVideos.filter(v => 
            v.filename.toLowerCase().includes(searchTerm)
        );
        renderTable(filtered);
    });

    // Refresh button
    refreshBtn.addEventListener('click', () => {
        fetchVideos();
    });

    // -------------------------------------------------------------
    // Share Modal Functions
    // -------------------------------------------------------------
    function openShareModal(videoId) {
        currentShareVideoId = videoId;
        const video = allVideos.find(v => v.id === videoId);
        
        if (!video) return;
        
        updateShareLink(videoId);
        shareModal.classList.remove('hidden');
    }
    
    function updateShareLink(videoId) {
        const shareLink = generateShareLink(videoId, currentLinkFormat);
        
        // Validate and display the link
        console.log('Generated share link:', shareLink);
        shareLinkInput.value = shareLink;
        
        // Update label based on format
        if (currentLinkFormat === 'embed') {
            linkTypeLabel.textContent = '✓ Works in all apps • Auto-plays video';
        } else {
            linkTypeLabel.textContent = '✓ Opens in StreamFlix app • Full features';
        }
        
        // Generate QR code
        generateQRCode(shareLink);
    }

    function generateQRCode(url) {
        // Clear previous QR code
        qrCodeCanvas.innerHTML = '';
        
        // Generate new QR code using QRCode library
        new QRCode(qrCodeCanvas, {
            text: url,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    closeShareBtn.addEventListener('click', () => {
        shareModal.classList.add('hidden');
    });

    // Link tab switching
    linkTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const format = tab.dataset.tab;
            
            // Update active state
            linkTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update format and regenerate link
            currentLinkFormat = format;
            if (currentShareVideoId) {
                updateShareLink(currentShareVideoId);
            }
        });
    });

    copyLinkBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(shareLinkInput.value);
            copyLinkBtn.textContent = '✓ Copied!';
            setTimeout(() => {
                copyLinkBtn.textContent = '📋 Copy';
            }, 2000);
        } catch (err) {
            alert('Failed to copy link');
        }
    });

    openLinkBtn.addEventListener('click', () => {
        window.open(shareLinkInput.value, '_blank');
    });

    playFromLinkBtn.addEventListener('click', () => {
        if (currentShareVideoId) {
            openPlayer(currentShareVideoId);
            shareModal.classList.add('hidden');
        }
    });

    // Close modals on outside click
    shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) {
            shareModal.classList.add('hidden');
        }
    });

    // Rename Modal Functions
    function openRenameModal(videoId, currentFilename) {
        currentRenameVideoId = videoId;
        renameInput.value = currentFilename;
        renameModal.classList.remove('hidden');
        renameInput.focus();
        renameInput.select();
    }

    function closeRenameModal() {
        renameModal.classList.add('hidden');
        currentRenameVideoId = null;
        renameInput.value = '';
    }

    closeRenameBtn.addEventListener('click', closeRenameModal);
    cancelRenameBtn.addEventListener('click', closeRenameModal);

    saveRenameBtn.addEventListener('click', async () => {
        if (!currentRenameVideoId) return;
        
        const newName = renameInput.value.trim();
        if (!newName) {
            alert('Please enter a valid video name');
            return;
        }

        try {
            const res = await fetch(`/api/videos/${currentRenameVideoId}/rename`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ filename: newName })
            });

            const data = await res.json();

            if (res.ok) {
                alert('Video renamed successfully!');
                closeRenameModal();
                fetchVideos(); // Refresh the video list
            } else {
                alert('Failed to rename video: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Rename error:', error);
            alert('Failed to rename video. Please try again later.');
        }
    });

    // Allow pressing Enter to save rename
    renameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveRenameBtn.click();
        }
    });

    // Close rename modal on outside click
    renameModal.addEventListener('click', (e) => {
        if (e.target === renameModal) {
            closeRenameModal();
        }
    });

    // -------------------------------------------------------------
    // HLS Proxy Streaming + Custom Player Controls
    // -------------------------------------------------------------
    const playerContainer  = document.getElementById('player-container');
    const playPauseBtn     = document.getElementById('play-pause-btn');
    const rewindBtn        = document.getElementById('rewind-btn');
    const forwardBtn       = document.getElementById('forward-btn');
    const muteBtn          = document.getElementById('mute-btn');
    const volumeSlider     = document.getElementById('volume-slider');
    const timeDisplay      = document.getElementById('time-display');
    const progressTrack    = document.getElementById('progress-track');
    const progressPlayed   = document.getElementById('progress-played');
    const progressBuffered = document.getElementById('progress-buffered');
    const progressThumb    = document.getElementById('progress-thumb');
    const speedBtn         = document.getElementById('speed-btn');
    const speedMenu        = document.getElementById('speed-menu');
    const qualityBtn       = document.getElementById('quality-btn');
    const qualityMenu      = document.getElementById('quality-menu');
    const fullscreenBtn    = document.getElementById('fullscreen-btn');
    const playerTitleEl    = document.getElementById('player-title');

    function formatTime(s) {
        if (isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    function updateProgress() {
        if (!videoElement.duration) return;
        const pct = (videoElement.currentTime / videoElement.duration) * 100;
        progressPlayed.style.width = pct + '%';
        progressThumb.style.left = pct + '%';
        if (videoElement.buffered.length > 0) {
            const bPct = (videoElement.buffered.end(videoElement.buffered.length - 1) / videoElement.duration) * 100;
            progressBuffered.style.width = bPct + '%';
        }
        timeDisplay.textContent = `${formatTime(videoElement.currentTime)} / ${formatTime(videoElement.duration)}`;
    }

    videoElement.addEventListener('timeupdate', updateProgress);
    videoElement.addEventListener('progress', updateProgress);

    progressTrack.addEventListener('click', (e) => {
        const rect = progressTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        videoElement.currentTime = ratio * videoElement.duration;
    });

    let dragging = false;
    progressTrack.addEventListener('mousedown', () => dragging = true);
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = progressTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        videoElement.currentTime = ratio * videoElement.duration;
    });
    document.addEventListener('mouseup', () => dragging = false);

    playPauseBtn.addEventListener('click', () => {
        if (videoElement.paused) {
            videoElement.play();
        } else {
            videoElement.pause();
        }
    });
    videoElement.addEventListener('play', () => {
        playPauseBtn.textContent = '⏸';
        playerContainer.classList.remove('paused');
    });
    videoElement.addEventListener('pause', () => {
        playPauseBtn.textContent = '▶';
        playerContainer.classList.add('paused');
    });
    videoElement.addEventListener('click', () => {
        if (videoElement.paused) videoElement.play(); else videoElement.pause();
    });

    rewindBtn.addEventListener('click', () => videoElement.currentTime = Math.max(0, videoElement.currentTime - 10));
    forwardBtn.addEventListener('click', () => videoElement.currentTime = Math.min(videoElement.duration, videoElement.currentTime + 10));

    document.addEventListener('keydown', (e) => {
        if (playerModal.classList.contains('hidden')) return;
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        switch(e.key) {
            case ' ':
            case 'k': e.preventDefault(); if (videoElement.paused) videoElement.play(); else videoElement.pause(); break;
            case 'ArrowLeft': videoElement.currentTime -= 10; break;
            case 'ArrowRight': videoElement.currentTime += 10; break;
            case 'ArrowUp': videoElement.volume = Math.min(1, videoElement.volume + 0.1); volumeSlider.value = videoElement.volume; break;
            case 'ArrowDown': videoElement.volume = Math.max(0, videoElement.volume - 0.1); volumeSlider.value = videoElement.volume; break;
            case 'm': videoElement.muted = !videoElement.muted; break;
            case 'f': toggleFullscreen(); break;
            case 'Escape': closePlayer(); break;
        }
    });

    volumeSlider.addEventListener('input', () => {
        videoElement.volume = parseFloat(volumeSlider.value);
        videoElement.muted = videoElement.volume === 0;
        muteBtn.textContent = videoElement.muted ? '🔇' : (videoElement.volume < 0.5 ? '🔉' : '🔊');
    });
    muteBtn.addEventListener('click', () => {
        videoElement.muted = !videoElement.muted;
        muteBtn.textContent = videoElement.muted ? '🔇' : (videoElement.volume < 0.5 ? '🔉' : '🔊');
    });

    speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speedBtn.closest('.dropdown-group').classList.toggle('open');
        qualityBtn.closest('.dropdown-group').classList.remove('open');
    });
    speedMenu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const speed = parseFloat(btn.dataset.speed);
            videoElement.playbackRate = speed;
            speedBtn.textContent = `${speed}× Speed`;
            speedMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            btn.closest('.dropdown-group').classList.remove('open');
        });
    });

    qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        qualityBtn.closest('.dropdown-group').classList.toggle('open');
        speedBtn.closest('.dropdown-group').classList.remove('open');
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-group').forEach(g => g.classList.remove('open'));
    });

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            playerContainer.requestFullscreen().catch(() => {});
            fullscreenBtn.textContent = '⛶ Exit';
        } else {
            document.exitFullscreen();
            fullscreenBtn.textContent = '⛶';
        }
    }
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) fullscreenBtn.textContent = '⛶';
    });

    function openPlayer(videoId, videoTitle) {
        playerModal.classList.remove('hidden');
        playerContainer.classList.add('paused');
        playerLoader.classList.remove('hidden');
        playerTitleEl.textContent = videoTitle || '';
        currentVideoId = videoId;

        progressPlayed.style.width = '0%';
        progressBuffered.style.width = '0%';
        progressThumb.style.left = '0%';
        timeDisplay.textContent = '0:00 / 0:00';
        speedBtn.textContent = '1× Speed';
        videoElement.playbackRate = 1;

        const token = localStorage.getItem('token');
        const m3u8Url = `/api/videos/stream/${videoId}/master.m3u8${token ? '?token=' + token : ''}`;

        if (Hls.isSupported()) {
            if (hlsInstance) hlsInstance.destroy();

            hlsInstance = new Hls({
                capLevelToPlayerSize: true,
                maxBufferLength: 30,
                xhrSetup: (xhr, url) => {
                    // Add token to all HLS segment requests
                    if (token) {
                        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                    }
                }
            });

            hlsInstance.loadSource(m3u8Url);
            hlsInstance.attachMedia(videoElement);

            hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                playerLoader.classList.add('hidden');

                qualityMenu.innerHTML = '<button data-level="-1" class="active">Auto</button>';
                data.levels.forEach((level, i) => {
                    const label = level.height ? `${level.height}p` : `Level ${i}`;
                    const btn = document.createElement('button');
                    btn.dataset.level = i;
                    btn.textContent = label;
                    btn.addEventListener('click', () => {
                        hlsInstance.currentLevel = i;
                        qualityBtn.textContent = label;
                        qualityMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        btn.closest('.dropdown-group').classList.remove('open');
                    });
                    qualityMenu.appendChild(btn);
                });

                qualityMenu.querySelector('[data-level="-1"]').addEventListener('click', () => {
                    hlsInstance.currentLevel = -1;
                    qualityBtn.textContent = 'Auto Quality';
                    qualityMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    qualityMenu.querySelector('[data-level="-1"]').classList.add('active');
                    qualityMenu.closest('.dropdown-group').classList.remove('open');
                });

                videoElement.play().catch(() => {});
            });

            hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hlsInstance.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hlsInstance.recoverMediaError();
                    } else {
                        hlsInstance.destroy();
                    }
                }
            });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            videoElement.src = m3u8Url;
            videoElement.addEventListener('loadedmetadata', () => {
                playerLoader.classList.add('hidden');
                videoElement.play().catch(() => {});
            });
        } else {
            alert('Your browser does not support HLS streaming.');
        }
    }

    function closePlayer() {
        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
        videoElement.pause();
        videoElement.src = '';
        playerModal.classList.add('hidden');
        if (document.fullscreenElement) document.exitFullscreen();
    }

    closePlayerBtn.addEventListener('click', closePlayer);
    playerModal.addEventListener('click', (e) => {
        if (e.target === playerModal) closePlayer();
    });

    deletePlayerBtn.addEventListener('click', () => {
        if (currentVideoId) {
            deleteVideo(currentVideoId);
        }
    });

    async function deleteVideo(videoId) {
        const confirmed = confirm('Are you sure you want to delete this video? This will remove it from both the app and Telegram. This action cannot be undone!');
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/videos/${videoId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            const data = await res.json();

            if (res.ok) {
                alert('Video deleted successfully!');
                fetchVideos();
            } else {
                alert('Failed to delete video: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('Failed to delete video. Please try again later.');
        }
    }

    window.deleteVideo = deleteVideo;
});
