/**
 * Video Processing Application
 * Clean Code Architecture with API Integration
 */

// Application Configuration
const AppConfig = {
    API_BASE_URL: 'http://localhost:3000/api',
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    SUPPORTED_FORMATS: ['mp4', 'webm', 'ogg', 'mov', 'avi'],
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000
};

// API Service Module
const ApiService = (() => {
    const headers = {
        'Content-Type': 'application/json',
    };

    const handleResponse = async (response) => {
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Network error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        return response.json();
    };

    const request = async (endpoint, options = {}) => {
        const url = `${AppConfig.API_BASE_URL}${endpoint}`;
        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers }
            });
            return await handleResponse(response);
        } catch (error) {
            console.error(`API Error: ${endpoint}`, error);
            throw error;
        }
    };

    return {
        get: (endpoint) => request(endpoint, { method: 'GET' }),
        post: (endpoint, data) => request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        put: (endpoint, data) => request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
        upload: async (endpoint, file, onProgress) => {
            const formData = new FormData();
            formData.append('file', file);

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && onProgress) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress(percentComplete);
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status}`));
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Upload failed'));
                });

                xhr.open('POST', `${AppConfig.API_BASE_URL}${endpoint}`);
                xhr.send(formData);
            });
        }
    };
})();

// State Management Module
const StateManager = (() => {
    const state = {
        videos: {
            first: null,
            second: null
        },
        processing: false,
        currentBranch: 'main',
        timeRange: {
            start: null,
            end: null
        },
        error: null,
        processedResult: null
    };

    const listeners = new Map();

    const notify = (key) => {
        const callbacks = listeners.get(key) || [];
        callbacks.forEach(callback => callback(state[key]));
    };

    return {
        get: (key) => state[key],
        set: (key, value) => {
            state[key] = value;
            notify(key);
        },
        subscribe: (key, callback) => {
            if (!listeners.has(key)) {
                listeners.set(key, []);
            }
            listeners.get(key).push(callback);
            return () => {
                const callbacks = listeners.get(key);
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            };
        },
        getState: () => ({ ...state })
    };
})();

// DOM Controller Module
const DOMController = (() => {
    const elements = {};

    const init = () => {
        // Cache DOM elements
        elements.firstTimeInput = document.getElementById('first-time-input');
        elements.secondTimeInput = document.getElementById('two-time-input');
        elements.branchSelect = document.getElementById('branch-select-input');
        elements.firstVideo = document.querySelector('.first_video');
        elements.secondVideo = document.querySelector('.two_video');
        elements.videoSwap = document.querySelector('.video_swap');
        elements.actionButtons = document.querySelectorAll('.action-btn');
        elements.container = document.querySelector('.container');
    };

    const showLoading = (element) => {
        element.classList.add('loading');
    };

    const hideLoading = (element) => {
        element.classList.remove('loading');
    };

    const showError = (message) => {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(errorDiv);
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    };

    const showSuccess = (message) => {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(successDiv);
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    };

    const updateVideoDisplay = (videoElement, file) => {
        const video = document.createElement('video');
        video.controls = false; // Remove default controls
        video.autoplay = false; // Disable autoplay
        video.muted = true; // Mute by default
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';

        if (typeof file === 'string') {
            // If file is a path string
            video.src = file;
        } else {
            // If file is a File object
            video.src = URL.createObjectURL(file);
        }

        // Make sure video doesn't autoplay
        video.addEventListener('loadeddata', () => {
            video.pause();
            // First video always starts from beginning
            video.currentTime = 0;
        });

        // Generate thumbnails for preview
        video.addEventListener('loadedmetadata', () => {
            video.pause(); // Ensure video is paused
            video.currentTime = 0; // Reset to beginning
            generateVideoThumbnails(video, videoElement);
        });

        // Add custom controls overlay
        const controlsOverlay = createVideoControls(video);

        videoElement.innerHTML = '';
        videoElement.appendChild(video);
        videoElement.appendChild(controlsOverlay);
    };

    const createVideoControls = (video) => {
        const controls = document.createElement('div');
        controls.className = 'custom-video-controls';
        controls.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
            padding: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
            opacity: 0;
            transition: opacity 0.3s;
        `;

        const playBtn = document.createElement('button');
        playBtn.style.cssText = `
            width: 32px;
            height: 32px;
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: white;
        `;
        playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

        const timeDisplay = document.createElement('span');
        timeDisplay.style.cssText = `
            color: white;
            font-size: 12px;
            flex: 1;
            text-align: center;
        `;

        // Add center play button
        const centerPlayBtn = document.createElement('div');
        centerPlayBtn.className = 'center-play-btn';
        centerPlayBtn.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 60px;
            height: 60px;
            background: rgba(0,0,0,0.7);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s;
            opacity: 0.8;
        `;
        centerPlayBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <polygon points="8 5 19 12 8 19 8 5"></polygon>
            </svg>
        `;

        // Click handler for both play buttons
        const togglePlay = () => {
            if (video.paused) {
                video.play();
                playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
                centerPlayBtn.style.opacity = '0';
                centerPlayBtn.style.pointerEvents = 'none';
            } else {
                video.pause();
                playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
                centerPlayBtn.style.opacity = '0.8';
                centerPlayBtn.style.pointerEvents = 'auto';
            }
        };

        playBtn.addEventListener('click', togglePlay);
        centerPlayBtn.addEventListener('click', togglePlay);

        // Video click to play/pause (no auto-play on load)
        video.addEventListener('click', (e) => {
            e.preventDefault();
            togglePlay();
        });

        video.addEventListener('timeupdate', () => {
            const current = formatTime(video.currentTime);
            const duration = formatTime(video.duration);
            timeDisplay.textContent = `${current} / ${duration}`;
        });

        // Show/hide controls
        const parent = video.parentElement;
        if (parent) {
            parent.addEventListener('mouseenter', () => {
                controls.style.opacity = '1';
                if (video.paused) {
                    centerPlayBtn.style.opacity = '1';
                }
            });
            parent.addEventListener('mouseleave', () => {
                controls.style.opacity = '0';
                if (video.paused) {
                    centerPlayBtn.style.opacity = '0.5';
                } else {
                    centerPlayBtn.style.opacity = '0';
                }
            });
        }

        // Add center play button to parent element
        if (parent) {
            parent.appendChild(centerPlayBtn);
        }

        controls.appendChild(playBtn);
        controls.appendChild(timeDisplay);

        return controls;
    };

    const generateVideoThumbnails = (video, container) => {
        // Generate thumbnails for the frame timeline
        generateFrameTimeline(video);
    };

    const generateFrameTimeline = (video) => {
        const framesStrip = document.getElementById('frames-strip');
        if (!framesStrip || !video) return;

        // Clear existing frames
        framesStrip.innerHTML = '';

        const duration = video.duration;
        if (!duration || duration === 0) {
            console.error('Video duration is 0 or undefined');
            return;
        }

        // Create more frames for better timeline
        const interval = 1; // Frame every 1 second
        const frameCount = Math.min(60, Math.floor(duration / interval));
        const frames = [];

        // Store selection boundaries
        let selectionStart = null;
        let selectionEnd = null;
        let isSelecting = false;
        let isDragging = false;

        console.log(`Generating ${frameCount} frames for ${duration}s video`);

        // Add selection overlay
        const selectionOverlay = document.createElement('div');
        selectionOverlay.className = 'selection-overlay';
        selectionOverlay.style.cssText = `
            position: absolute;
            background: rgba(99, 102, 241, 0.3);
            border: 2px solid var(--primary-color);
            pointer-events: none;
            display: none;
            top: 0;
            bottom: 0;
            z-index: 10;
        `;
        framesStrip.style.position = 'relative';
        framesStrip.appendChild(selectionOverlay);

        // Add start and end markers
        const startMarker = document.createElement('div');
        startMarker.className = 'selection-marker start-marker';
        startMarker.style.cssText = `
            position: absolute;
            width: 4px;
            height: 100%;
            background: var(--success-color);
            cursor: ew-resize;
            z-index: 12;
            display: none;
            top: 0;
        `;
        startMarker.innerHTML = `<span style="position: absolute; top: -20px; left: -20px; background: var(--success-color); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">START</span>`;
        framesStrip.appendChild(startMarker);

        const endMarker = document.createElement('div');
        endMarker.className = 'selection-marker end-marker';
        endMarker.style.cssText = `
            position: absolute;
            width: 4px;
            height: 100%;
            background: var(--danger-color);
            cursor: ew-resize;
            z-index: 12;
            display: none;
            top: 0;
        `;
        endMarker.innerHTML = `<span style="position: absolute; top: -20px; right: -15px; background: var(--danger-color); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">END</span>`;
        framesStrip.appendChild(endMarker);

        // Allow dragging markers
        let draggingMarker = null;

        startMarker.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            draggingMarker = 'start';
            isDragging = true;
        });

        endMarker.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            draggingMarker = 'end';
            isDragging = true;
        });

        // Create frames immediately
        for (let i = 0; i < frameCount; i++) {
            const time = i * interval;

            const frameDiv = document.createElement('div');
            frameDiv.className = 'frame-thumbnail';
            frameDiv.dataset.time = time;
            frameDiv.dataset.index = i;

            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.objectFit = 'cover';
            canvas.style.borderRadius = '2px';

            const timeLabel = document.createElement('div');
            timeLabel.className = 'frame-time';
            timeLabel.textContent = formatTime(time);

            frameDiv.appendChild(canvas);
            frameDiv.appendChild(timeLabel);

            // Frame selection logic with Shift key for setting boundaries
            frameDiv.addEventListener('mousedown', (e) => {
                e.preventDefault();

                if (isDragging && draggingMarker) {
                    // Dragging a marker
                    if (draggingMarker === 'start') {
                        selectionStart = i;
                    } else if (draggingMarker === 'end') {
                        selectionEnd = i;
                    }
                    updateSelection();
                } else if (e.shiftKey) {
                    // Shift+Click to set end point
                    if (selectionStart !== null) {
                        selectionEnd = i;
                        updateSelection();
                        applySelectionToSecondVideo();
                    }
                } else if (e.ctrlKey || e.metaKey) {
                    // Ctrl/Cmd+Click to set start point
                    selectionStart = i;
                    if (selectionEnd === null) {
                        selectionEnd = i;
                    }
                    updateSelection();
                } else {
                    // Normal click - start new selection
                    isSelecting = true;
                    selectionStart = i;
                    selectionEnd = i;
                    updateSelection();
                }
            });

            frameDiv.addEventListener('mouseenter', () => {
                if (isSelecting) {
                    selectionEnd = i;
                    updateSelection();
                } else if (isDragging && draggingMarker) {
                    if (draggingMarker === 'start') {
                        selectionStart = i;
                    } else if (draggingMarker === 'end') {
                        selectionEnd = i;
                    }
                    updateSelection();
                }
            });

            frameDiv.addEventListener('mouseup', () => {
                if (isSelecting) {
                    isSelecting = false;
                    applySelectionToSecondVideo();
                }
            });

            // Click to seek (single click)
            frameDiv.addEventListener('click', () => {
                if (!isSelecting) {
                    video.currentTime = time;
                    updateActiveFrame(frameDiv);

                    // Also update the main video if it exists
                    const mainVideo = document.querySelector('.first_video video');
                    if (mainVideo) {
                        mainVideo.currentTime = time;
                    }
                }
            });

            frames.push({ frameDiv, canvas, time });
            framesStrip.appendChild(frameDiv);
        }

        // Update selection visual
        const updateSelection = () => {
            if (selectionStart === null || selectionEnd === null) return;

            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);

            // Clear previous selection
            frames.forEach(f => f.frameDiv.classList.remove('selected'));

            // Mark selected frames
            for (let i = start; i <= end; i++) {
                if (frames[i]) {
                    frames[i].frameDiv.classList.add('selected');
                }
            }

            // Update selection overlay position
            const startFrame = frames[start] ? frames[start].frameDiv : null;
            const endFrame = frames[end] ? frames[end].frameDiv : null;

            if (startFrame && endFrame) {
                const startRect = startFrame.getBoundingClientRect();
                const endRect = endFrame.getBoundingClientRect();
                const stripRect = framesStrip.getBoundingClientRect();

                selectionOverlay.style.left = `${startRect.left - stripRect.left}px`;
                selectionOverlay.style.width = `${endRect.right - startRect.left}px`;
                selectionOverlay.style.display = 'block';

                // Update markers position
                startMarker.style.left = `${startRect.left - stripRect.left - 2}px`;
                startMarker.style.display = 'block';

                endMarker.style.left = `${endRect.right - stripRect.left - 2}px`;
                endMarker.style.display = 'block';
            }
        };

        // Apply selection to second video
        const applySelectionToSecondVideo = () => {
            if (selectionStart === null || selectionEnd === null) return;

            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);

            const startTime = frames[start].time;
            const endTime = frames[end].time + interval;

            // Update state
            StateManager.set('timeRange', {
                start: startTime,
                end: endTime
            });

            // Update time inputs
            const firstTimeInput = document.getElementById('first-time-input');
            const secondTimeInput = document.getElementById('two-time-input');

            if (firstTimeInput) {
                firstTimeInput.value = formatTimeForInput(startTime);
            }
            if (secondTimeInput) {
                secondTimeInput.value = formatTimeForInput(endTime);
            }

            // Show in second video container
            const secondVideoElement = document.querySelector('.two_video');
            if (secondVideoElement) {
                updateSecondVideoPreview(video, startTime, endTime, secondVideoElement);
            }

            DOMController.showSuccess(`Selected range: ${formatTime(startTime)} - ${formatTime(endTime)}`);
        };

        // Format time for input field
        const formatTimeForInput = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        // Update second video preview
        const updateSecondVideoPreview = (sourceVideo, startTime, endTime, container) => {
            // Create a new video element for the second container
            const previewVideo = document.createElement('video');
            previewVideo.src = sourceVideo.src;
            previewVideo.controls = false;
            previewVideo.autoplay = false;
            previewVideo.loop = false; // No looping
            previewVideo.muted = true;
            previewVideo.style.width = '100%';
            previewVideo.style.height = '100%';
            previewVideo.style.objectFit = 'cover';

            // Set the current time to start time for second video
            previewVideo.addEventListener('loadedmetadata', () => {
                previewVideo.currentTime = startTime;
                previewVideo.pause();

                // Create a visual indicator for the current position
                const seekBar = document.createElement('div');
                seekBar.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: rgba(255,255,255,0.2);
                `;

                const seekProgress = document.createElement('div');
                seekProgress.style.cssText = `
                    height: 100%;
                    width: 0%;
                    background: var(--primary-color);
                    transition: width 0.1s;
                `;
                seekBar.appendChild(seekProgress);
                container.appendChild(seekBar);

                // Update progress bar
                previewVideo.addEventListener('timeupdate', () => {
                    const progress = ((previewVideo.currentTime - startTime) / (endTime - startTime)) * 100;
                    seekProgress.style.width = `${Math.max(0, Math.min(100, progress))}%`;
                });
            });

            // Ensure video stays within bounds
            previewVideo.addEventListener('seeked', () => {
                if (previewVideo.currentTime < startTime) {
                    previewVideo.currentTime = startTime;
                } else if (previewVideo.currentTime > endTime) {
                    previewVideo.currentTime = endTime;
                }
            });

            // Add custom controls with range info
            const controlsOverlay = document.createElement('div');
            controlsOverlay.className = 'range-info-overlay';
            controlsOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);
                padding: 10px;
                color: white;
                pointer-events: none;
            `;
            controlsOverlay.innerHTML = `
                <div style="font-size: 12px; font-weight: bold;">Selected Range</div>
                <div style="font-size: 14px; margin-top: 5px;">${formatTime(startTime)} - ${formatTime(endTime)}</div>
                <div style="font-size: 11px; margin-top: 3px; opacity: 0.8;">Duration: ${formatTime(endTime - startTime)}</div>
            `;

            // Add play button overlay
            const playButton = document.createElement('div');
            playButton.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 60px;
                height: 60px;
                background: rgba(0,0,0,0.7);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.3s;
            `;
            playButton.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <polygon points="8 5 19 12 8 19 8 5"></polygon>
                </svg>
            `;

            let isPlaying = false;
            let playInterval = null;

            // Play only selected range (no auto-play)
            playButton.addEventListener('click', () => {
                if (!isPlaying) {
                    previewVideo.currentTime = startTime;
                    previewVideo.play();
                    isPlaying = true;
                    playButton.style.opacity = '0';

                    // Stop at end time and don't auto-replay
                    playInterval = setInterval(() => {
                        if (previewVideo.currentTime >= endTime) {
                            previewVideo.pause();
                            previewVideo.currentTime = startTime;
                            isPlaying = false;
                            playButton.style.opacity = '1';
                            clearInterval(playInterval);
                        }
                    }, 100);
                } else {
                    previewVideo.pause();
                    isPlaying = false;
                    playButton.style.opacity = '1';
                    clearInterval(playInterval);
                }
            });

            // Show/hide play button on hover
            container.addEventListener('mouseenter', () => {
                if (!isPlaying) {
                    playButton.style.opacity = '1';
                }
            });

            container.addEventListener('mouseleave', () => {
                if (!isPlaying) {
                    playButton.style.opacity = '0.5';
                }
            });

            // Clear container and add new elements
            container.innerHTML = '';
            container.style.position = 'relative';
            container.appendChild(previewVideo);
            container.appendChild(controlsOverlay);
            container.appendChild(playButton);

            // Store the range in state for processing
            StateManager.set('videos', {
                ...StateManager.get('videos'),
                second: {
                    element: previewVideo,
                    startTime: startTime,
                    endTime: endTime,
                    duration: endTime - startTime
                }
            });
        };

        // Global mouse up to stop selection
        document.addEventListener('mouseup', () => {
            if (isSelecting) {
                isSelecting = false;
                applySelectionToSecondVideo();
            }
            if (isDragging) {
                isDragging = false;
                draggingMarker = null;
                applySelectionToSecondVideo();
            }
        });

        // Add info text
        const infoText = document.createElement('div');
        infoText.style.cssText = `
            position: absolute;
            top: -40px;
            left: 0;
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--surface);
            padding: 4px 8px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        `;
        infoText.innerHTML = `<b>Tips:</b> Click & drag to select | Ctrl+Click: set start | Shift+Click: set end | Mouse wheel: scroll | Middle click & drag: pan`;
        framesStrip.appendChild(infoText);

        // Add drag scroll functionality
        let isScrollDragging = false;
        let scrollStartX = 0;
        let scrollLeft = 0;

        // Middle mouse button drag scroll
        framesStrip.addEventListener('mousedown', (e) => {
            // Middle mouse button (wheel click)
            if (e.button === 1) {
                e.preventDefault();
                isScrollDragging = true;
                framesStrip.style.cursor = 'grabbing';
                scrollStartX = e.pageX - framesStrip.offsetLeft;
                scrollLeft = framesStrip.scrollLeft;
            }
        });

        framesStrip.addEventListener('mousemove', (e) => {
            if (!isScrollDragging) return;
            e.preventDefault();
            const x = e.pageX - framesStrip.offsetLeft;
            const walk = (x - scrollStartX) * 2; // Scroll speed
            framesStrip.scrollLeft = scrollLeft - walk;
        });

        framesStrip.addEventListener('mouseup', (e) => {
            if (e.button === 1) {
                isScrollDragging = false;
                framesStrip.style.cursor = 'default';
            }
        });

        framesStrip.addEventListener('mouseleave', () => {
            if (isScrollDragging) {
                isScrollDragging = false;
                framesStrip.style.cursor = 'default';
            }
        });

        // Mouse wheel horizontal scroll
        framesStrip.addEventListener('wheel', (e) => {
            e.preventDefault();

            // Determine scroll direction and amount
            const delta = e.deltaY || e.deltaX;
            const scrollAmount = delta * 2; // Adjust scroll speed

            // Smooth scroll
            framesStrip.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
        });

        // Add visual feedback for scrollable area
        framesStrip.style.cursor = 'default';

        // Change cursor on middle mouse hover
        framesStrip.addEventListener('mouseenter', () => {
            if (!isSelecting && !isDragging) {
                framesStrip.style.cursor = 'grab';
            }
        });

        framesStrip.addEventListener('mouseleave', () => {
            framesStrip.style.cursor = 'default';
        });

        // Generate thumbnails from the actual video
        let currentIndex = 0;

        const captureFrame = () => {
            if (currentIndex >= frames.length) {
                setupTimelineControls(video, frames);
                return;
            }

            const { canvas, time } = frames[currentIndex];

            // Set video time and wait for seek
            video.currentTime = time;

            const captureCurrentFrame = () => {
                try {
                    const ctx = canvas.getContext('2d');
                    // Draw current video frame to canvas
                    ctx.drawImage(video, 0, 0, 160, 90);

                    console.log(`Captured frame at ${time}s`);
                    updateProgressBar(((currentIndex + 1) / frameCount) * 100);
                } catch (error) {
                    console.error(`Error capturing frame at ${time}s:`, error);
                    // Draw error placeholder
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#e0e0e0';
                    ctx.fillRect(0, 0, 160, 90);
                    ctx.fillStyle = '#999';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${time}s`, 80, 45);
                }

                currentIndex++;
                // Process next frame
                setTimeout(captureFrame, 100);
            };

            // Wait for seek to complete
            if (Math.abs(video.currentTime - time) < 0.1) {
                // Already at the right time
                setTimeout(captureCurrentFrame, 50);
            } else {
                // Wait for seek
                const seekHandler = () => {
                    video.removeEventListener('seeked', seekHandler);
                    setTimeout(captureCurrentFrame, 50);
                };
                video.addEventListener('seeked', seekHandler);
            }
        };

        // Start capturing frames after a short delay
        setTimeout(() => {
            // Make sure video is paused during capture
            const wasPlaying = !video.paused;
            video.pause();

            captureFrame();

            // Don't restore play state - keep video paused
        }, 200);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const updateActiveFrame = (activeFrame) => {
        document.querySelectorAll('.frame-thumbnail').forEach(frame => {
            frame.classList.remove('active');
        });
        activeFrame.classList.add('active');
    };

    const updateProgressBar = (percentage) => {
        const progressBar = document.getElementById('timeline-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
    };

    const setupTimelineControls = (video, frames) => {
        const playBtn = document.querySelector('[data-action="play-timeline"]');
        const pauseBtn = document.querySelector('[data-action="pause-timeline"]');
        const zoomInBtn = document.querySelector('[data-action="zoom-in"]');
        const zoomOutBtn = document.querySelector('[data-action="zoom-out"]');

        let currentZoom = 1;

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                video.play();
            });
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                video.pause();
            });
        }

        // Zoom controls
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                currentZoom = Math.min(currentZoom * 1.5, 5);
                applyZoom(currentZoom);
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                currentZoom = Math.max(currentZoom / 1.5, 0.5);
                applyZoom(currentZoom);
            });
        }

        const applyZoom = (zoom) => {
            const frameThumbnails = document.querySelectorAll('.frame-thumbnail');
            frameThumbnails.forEach(frame => {
                const baseWidth = 80;
                const baseHeight = 60;
                frame.style.minWidth = `${baseWidth * zoom}px`;
                frame.style.height = `${baseHeight * zoom}px`;
            });

            // Also zoom the canvases inside
            const frameCanvases = document.querySelectorAll('.frame-thumbnail canvas');
            frameCanvases.forEach(canvas => {
                canvas.style.transform = `scale(${zoom})`;
                canvas.style.transformOrigin = 'center';
            });
        };

        // Update active frame as video plays
        video.addEventListener('timeupdate', () => {
            const currentTime = video.currentTime;
            const activeFrame = frames.find(f => Math.abs(f.time - currentTime) < 0.5);
            if (activeFrame) {
                updateActiveFrame(activeFrame.frameDiv);
            }
            updateProgressBar((currentTime / video.duration) * 100);
        });
    };

    return {
        init,
        elements: () => elements,
        showLoading,
        hideLoading,
        showError,
        showSuccess,
        updateVideoDisplay
    };
})();

// Video Handler Module
const VideoHandler = (() => {
    const validateFile = (file) => {
        if (!file) {
            throw new Error('No file selected');
        }

        if (file.size > AppConfig.MAX_FILE_SIZE) {
            throw new Error(`File size exceeds ${AppConfig.MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
        }

        const extension = file.name.split('.').pop().toLowerCase();
        if (!AppConfig.SUPPORTED_FORMATS.includes(extension)) {
            throw new Error(`Unsupported format. Supported: ${AppConfig.SUPPORTED_FORMATS.join(', ')}`);
        }

        return true;
    };

    const uploadVideo = async (file, slot, onProgress) => {
        try {
            validateFile(file);
            const response = await ApiService.upload('/videos/upload', file, onProgress);
            StateManager.set('videos', {
                ...StateManager.get('videos'),
                [slot]: response.data
            });
            return response;
        } catch (error) {
            throw new Error(`Upload failed: ${error.message}`);
        }
    };

    const processVideos = async () => {
        const videos = StateManager.get('videos');
        const timeRange = StateManager.get('timeRange');
        const branch = StateManager.get('currentBranch');

        if (!videos.first || !videos.second) {
            throw new Error('Please upload both videos');
        }

        const payload = {
            firstVideoId: videos.first.id,
            secondVideoId: videos.second.id,
            startTime: timeRange.start,
            endTime: timeRange.end,
            branch: branch
        };

        const response = await ApiService.post('/videos/process', payload);
        StateManager.set('processedResult', response.data);
        return response;
    };


    const downloadResult = async () => {
        const result = StateManager.get('processedResult');
        if (!result) {
            throw new Error('No processed video available');
        }

        const response = await fetch(`${AppConfig.API_BASE_URL}/videos/download/${result.id}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `processed_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const clearAll = () => {
        StateManager.set('videos', { first: null, second: null });
        StateManager.set('processedResult', null);
        StateManager.set('timeRange', { start: null, end: null });

        const elements = DOMController.elements();
        elements.firstVideo.innerHTML = `
            <div class="video-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                </svg>
                <span>First Video</span>
            </div>
        `;
        elements.secondVideo.innerHTML = `
            <div class="video-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                </svg>
                <span>Second Video</span>
            </div>
        `;
        elements.firstTimeInput.value = '';
        elements.secondTimeInput.value = '';
        elements.branchSelect.value = 'main';
    };

    return {
        uploadVideo,
        processVideos,
        downloadResult,
        clearAll
    };
})();

// Event Handlers Module
const EventHandlers = (() => {
    const handleFileUpload = (slot) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = AppConfig.SUPPORTED_FORMATS.map(f => `.${f}`).join(',');

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const videoElement = slot === 'first'
                        ? DOMController.elements().firstVideo
                        : DOMController.elements().secondVideo;

                    DOMController.showLoading(videoElement);
                    DOMController.updateVideoDisplay(videoElement, file);

                    await VideoHandler.uploadVideo(file, slot, (progress) => {
                        console.log(`Upload progress: ${progress}%`);
                    });

                    DOMController.hideLoading(videoElement);
                    DOMController.showSuccess(`Video uploaded successfully`);
                } catch (error) {
                    DOMController.showError(error.message);
                    DOMController.hideLoading(DOMController.elements().container);
                }
            }
        });

        input.click();
    };

    const handleProcess = async () => {
        try {
            StateManager.set('processing', true);
            DOMController.showLoading(DOMController.elements().container);

            await VideoHandler.processVideos();

            DOMController.hideLoading(DOMController.elements().container);
            DOMController.showSuccess('Videos processed successfully');
            StateManager.set('processing', false);
        } catch (error) {
            DOMController.showError(error.message);
            DOMController.hideLoading(DOMController.elements().container);
            StateManager.set('processing', false);
        }
    };

    const handleDownload = async () => {
        try {
            await VideoHandler.downloadResult();
            DOMController.showSuccess('Download started');
        } catch (error) {
            DOMController.showError(error.message);
        }
    };

    const handleClear = () => {
        if (confirm('Are you sure you want to clear all data?')) {
            VideoHandler.clearAll();
            DOMController.showSuccess('All data cleared');
        }
    };

    const init = () => {
        const elements = DOMController.elements();

        // Time inputs
        elements.firstTimeInput.addEventListener('change', (e) => {
            StateManager.set('timeRange', {
                ...StateManager.get('timeRange'),
                start: e.target.value
            });
        });

        elements.secondTimeInput.addEventListener('change', (e) => {
            StateManager.set('timeRange', {
                ...StateManager.get('timeRange'),
                end: e.target.value
            });
        });

        // Branch select
        elements.branchSelect.addEventListener('change', (e) => {
            StateManager.set('currentBranch', e.target.value);
        });

        // Remove video container click events - they should only display videos
        // Videos are now loaded only via action buttons


        // Action buttons
        elements.actionButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const action = button.dataset.action;
                switch (action) {
                    case 'upload':
                        handleFileUpload('first');
                        break;
                    case 'process':
                        await handleProcess();
                        break;
                    case 'download':
                        await handleDownload();
                        break;
                    case 'clear':
                        handleClear();
                        break;
                }
            });
        });
    };

    return { init };
})();

// Application Initialization
const App = (() => {
    const loadTestVideo = () => {
        // Test video path - use file:// protocol for local files
        const testVideoPath = 'video.mp4'; // Use relative path

        // Create file input to load test video
        const video = document.createElement('video');
        video.src = testVideoPath;
        video.style.display = 'none';
        document.body.appendChild(video);

        video.addEventListener('loadedmetadata', () => {
            video.pause(); // Make sure test video doesn't autoplay
            const firstVideoElement = DOMController.elements().firstVideo;
            DOMController.updateVideoDisplay(firstVideoElement, testVideoPath);
            console.log('Test video loaded:', testVideoPath);
        });

        video.addEventListener('error', (e) => {
            console.log('Could not load test video, please upload manually');
        });
    };

    const init = () => {
        console.log('Initializing Video Processing Application...');

        // Initialize DOM Controller
        DOMController.init();

        // Initialize Event Handlers
        EventHandlers.init();

        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        // Auto-load test video if available
        setTimeout(() => {
            try {
                loadTestVideo();
            } catch(e) {
                console.log('Test video not found, skipping auto-load');
            }
        }, 500);

        console.log('Application initialized successfully');
    };

    return { init };
})();

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.init);
} else {
    App.init();
}

// Export modules for testing and external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ApiService,
        StateManager,
        VideoHandler,
        DOMController,
        EventHandlers,
        App
    };
}