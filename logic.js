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
        video.controls = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.src = URL.createObjectURL(file);

        videoElement.innerHTML = '';
        videoElement.appendChild(video);
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

    const swapVideos = () => {
        const videos = StateManager.get('videos');
        StateManager.set('videos', {
            first: videos.second,
            second: videos.first
        });

        // Update UI
        const elements = DOMController.elements();
        const firstVideoContent = elements.firstVideo.innerHTML;
        elements.firstVideo.innerHTML = elements.secondVideo.innerHTML;
        elements.secondVideo.innerHTML = firstVideoContent;
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
        swapVideos,
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

        // Video containers
        elements.firstVideo.addEventListener('click', () => {
            if (!StateManager.get('videos').first) {
                handleFileUpload('first');
            }
        });

        elements.secondVideo.addEventListener('click', () => {
            if (!StateManager.get('videos').second) {
                handleFileUpload('second');
            }
        });

        // Swap button
        elements.videoSwap.addEventListener('click', () => {
            VideoHandler.swapVideos();
            DOMController.showSuccess('Videos swapped');
        });

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