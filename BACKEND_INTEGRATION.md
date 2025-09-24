# Backend Integration Documentation

## Overview
This document provides comprehensive instructions for integrating the Video Processing Application with a backend API. The frontend is designed following clean code principles and modular architecture for easy API integration.

## Table of Contents
- [API Configuration](#api-configuration)
- [Required Endpoints](#required-endpoints)
- [Request/Response Formats](#requestresponse-formats)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [WebSocket Integration](#websocket-integration)
- [Testing](#testing)
- [Deployment](#deployment)

## API Configuration

### Base Configuration
The application uses a centralized configuration in `logic.js`:

```javascript
const AppConfig = {
    API_BASE_URL: 'http://localhost:3000/api', // Change this to your backend URL
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    SUPPORTED_FORMATS: ['mp4', 'webm', 'ogg', 'mov', 'avi'],
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000
};
```

### Environment Variables (Recommended)
For production, use environment variables:

```javascript
const AppConfig = {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000/api',
    // ... other configs
};
```

## Required Endpoints

### 1. Upload Video
**Endpoint:** `POST /api/videos/upload`

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: FormData with file field

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "video_123abc",
        "filename": "sample.mp4",
        "size": 15728640,
        "duration": 120,
        "url": "/uploads/video_123abc.mp4",
        "thumbnail": "/thumbnails/video_123abc.jpg",
        "uploadedAt": "2024-01-15T10:30:00Z"
    }
}
```

**Backend Implementation (Node.js/Express Example):**
```javascript
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/api/videos/upload', upload.single('file'), async (req, res) => {
    try {
        const video = await VideoService.processUpload(req.file);
        res.json({
            success: true,
            data: video
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
```

### 2. Process Videos
**Endpoint:** `POST /api/videos/process`

**Request:**
```json
{
    "firstVideoId": "video_123abc",
    "secondVideoId": "video_456def",
    "startTime": "00:00:10",
    "endTime": "00:01:30",
    "branch": "main"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "processed_789ghi",
        "status": "completed",
        "outputUrl": "/processed/output_789ghi.mp4",
        "processingTime": 5.2,
        "metadata": {
            "duration": 80,
            "resolution": "1920x1080",
            "fps": 30
        }
    }
}
```

**Backend Implementation:**
```javascript
app.post('/api/videos/process', async (req, res) => {
    try {
        const { firstVideoId, secondVideoId, startTime, endTime, branch } = req.body;

        // Queue processing job
        const job = await ProcessingQueue.add({
            firstVideoId,
            secondVideoId,
            startTime,
            endTime,
            branch
        });

        // Wait for completion or return job ID for polling
        const result = await job.finished();

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
```

### 3. Download Processed Video
**Endpoint:** `GET /api/videos/download/:id`

**Response:** Binary stream of video file

**Backend Implementation:**
```javascript
app.get('/api/videos/download/:id', async (req, res) => {
    try {
        const video = await VideoService.getProcessedVideo(req.params.id);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${video.filename}"`);

        const stream = fs.createReadStream(video.path);
        stream.pipe(res);
    } catch (error) {
        res.status(404).json({
            success: false,
            message: 'Video not found'
        });
    }
});
```

### 4. Get Processing Status (Optional)
**Endpoint:** `GET /api/videos/status/:jobId`

**Response:**
```json
{
    "success": true,
    "data": {
        "jobId": "job_123",
        "status": "processing", // queued, processing, completed, failed
        "progress": 65,
        "estimatedTime": 30
    }
}
```

## Request/Response Formats

### Standard Success Response
```json
{
    "success": true,
    "data": { /* resource data */ },
    "message": "Operation successful" // optional
}
```

### Standard Error Response
```json
{
    "success": false,
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid input parameters",
        "details": [ /* validation errors */ ]
    }
}
```

## Authentication

### JWT Token Implementation
Add authentication headers to API requests:

```javascript
// In logic.js - ApiService module
const ApiService = (() => {
    const getAuthToken = () => localStorage.getItem('authToken');

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
    };

    // ... rest of implementation
});
```

### Backend Middleware
```javascript
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Protected routes
app.post('/api/videos/upload', authenticateToken, upload.single('file'), ...);
```

## Error Handling

### Frontend Error Handling
The application includes comprehensive error handling:

```javascript
// Retry logic for network failures
const retryRequest = async (fn, retries = AppConfig.RETRY_ATTEMPTS) => {
    try {
        return await fn();
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, AppConfig.RETRY_DELAY));
            return retryRequest(fn, retries - 1);
        }
        throw error;
    }
};
```

### Backend Error Codes
Implement consistent error codes:

```javascript
const ErrorCodes = {
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    FILE_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};
```

## WebSocket Integration

### Real-time Processing Updates
For long-running video processing, implement WebSocket for real-time updates:

```javascript
// Frontend WebSocket connection
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'processing-update') {
        updateProgressBar(data.progress);
    }
};

// Backend WebSocket
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'subscribe-processing') {
            subscribeToProcessingUpdates(data.jobId, ws);
        }
    });
});
```

## Testing

### API Testing with Postman/Insomnia
Create a collection with the following requests:

1. **Upload Video Test**
   - URL: `{{base_url}}/api/videos/upload`
   - Method: POST
   - Body: form-data with file field

2. **Process Videos Test**
   - URL: `{{base_url}}/api/videos/process`
   - Method: POST
   - Body: JSON with video IDs and parameters

### Backend Unit Tests
```javascript
// test/api.test.js
describe('Video API', () => {
    it('should upload video successfully', async () => {
        const response = await request(app)
            .post('/api/videos/upload')
            .attach('file', 'test/fixtures/sample.mp4')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
    });

    it('should process videos', async () => {
        const response = await request(app)
            .post('/api/videos/process')
            .send({
                firstVideoId: 'test_id_1',
                secondVideoId: 'test_id_2',
                startTime: '00:00:00',
                endTime: '00:00:10'
            })
            .expect(200);

        expect(response.body.success).toBe(true);
    });
});
```

## Deployment

### Environment Configuration
Create `.env` file for production:

```env
NODE_ENV=production
API_BASE_URL=https://api.yourdomain.com
JWT_SECRET=your-secret-key
MONGODB_URI=mongodb://localhost:27017/video-app
REDIS_URL=redis://localhost:6379
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
S3_BUCKET=your-s3-bucket
```

### Docker Configuration
```dockerfile
# Dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    environment:
      - API_BASE_URL=http://backend:3000
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/video-app
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis

  mongo:
    image: mongo:5
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data

volumes:
  mongo-data:
  redis-data:
```

### NGINX Configuration
```nginx
# nginx.conf
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 100M;
    }

    # WebSocket Proxy
    location /ws {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

## Security Considerations

### Input Validation
```javascript
const validateVideoRequest = (req, res, next) => {
    const { startTime, endTime, branch } = req.body;

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid time format'
        });
    }

    // Validate branch
    const allowedBranches = ['main', 'develop', 'feature'];
    if (!allowedBranches.includes(branch)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid branch'
        });
    }

    next();
};
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many uploads, please try again later'
});

app.post('/api/videos/upload', uploadLimiter, ...);
```

### CORS Configuration
```javascript
const cors = require('cors');

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## Monitoring and Logging

### Logging Setup
```javascript
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Log API requests
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} - ${req.ip}`);
    next();
});
```

## Support and Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure backend CORS is properly configured
   - Check that API_BASE_URL matches backend URL

2. **File Upload Failures**
   - Verify file size limits in both frontend and backend
   - Check multer configuration for file types

3. **Processing Timeouts**
   - Implement job queue for long-running processes
   - Use WebSockets for real-time updates

4. **Authentication Failures**
   - Verify JWT secret is consistent
   - Check token expiration settings

### Contact
For technical support or questions about backend integration:
- Documentation: [API Docs Link]
- Support Email: support@example.com
- GitHub Issues: [Repository Link]

## License
This project is licensed under the MIT License.