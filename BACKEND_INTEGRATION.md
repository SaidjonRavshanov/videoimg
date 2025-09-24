# Backend Integratsiya Qo'llanmasi

## Umumiy Ma'lumot
Bu qo'llanma video qayta ishlash dasturini backend server bilan qanday ulashni tushuntiradi.

## Asosiy Tarkib
- [Server Sozlamalari](#server-sozlamalari)
- [API Endpointlar](#api-endpointlar)
- [Video Yuklash](#video-yuklash)
- [Video Qayta Ishlash](#video-qayta-ishlash)
- [Xatoliklar Bilan Ishlash](#xatoliklar-bilan-ishlash)

## Server Sozlamalari

### API Manzilini O'zgartirish
`logic.js` faylida API manzilini o'zgartiring:

```javascript
const AppConfig = {
    API_BASE_URL: 'http://localhost:3000/api', // O'z serveringiz manzilini kiriting
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB maksimal fayl hajmi
    SUPPORTED_FORMATS: ['mp4', 'webm', 'ogg', 'mov', 'avi']
};
```

## API Endpointlar

### 1. Video Yuklash

**Endpoint:** `POST /api/videos/upload`

**So'rov:**
```javascript
// FormData orqali video yuborish
const formData = new FormData();
formData.append('file', videoFile);
```

**Javob:**
```json
{
    "success": true,
    "data": {
        "id": "video_123",
        "filename": "video.mp4",
        "size": 15728640,
        "duration": 120,
        "url": "/uploads/video_123.mp4"
    }
}
```

**Node.js Backend Misol:**
```javascript
const express = require('express');
const multer = require('multer');
const app = express();

// Fayllarni saqlash uchun sozlama
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Noto\'g\'ri fayl turi'));
        }
    }
});

// Video yuklash endpoint
app.post('/api/videos/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'Fayl yuklanmadi'
        });
    }

    res.json({
        success: true,
        data: {
            id: req.file.filename,
            filename: req.file.originalname,
            size: req.file.size,
            url: `/uploads/${req.file.filename}`
        }
    });
});
```

### 2. Video Qayta Ishlash

**Endpoint:** `POST /api/videos/process`

**So'rov:**
```json
{
    "videoUrl": "/uploads/video.mp4",
    "startTime": 10,    // Soniyalarda
    "endTime": 30,      // Soniyalarda
    "operation": "trim" // trim, merge, compress
}
```

**Javob:**
```json
{
    "success": true,
    "data": {
        "processedUrl": "/processed/output.mp4",
        "duration": 20,
        "status": "completed"
    }
}
```

**FFmpeg Bilan Video Kesish:**
```javascript
const ffmpeg = require('fluent-ffmpeg');

app.post('/api/videos/process', async (req, res) => {
    const { videoUrl, startTime, endTime, operation } = req.body;

    const inputPath = `./uploads${videoUrl}`;
    const outputPath = `./processed/output_${Date.now()}.mp4`;

    if (operation === 'trim') {
        // Video kesish
        ffmpeg(inputPath)
            .setStartTime(startTime)  // Boshlang'ich vaqt
            .setDuration(endTime - startTime) // Davomiyligi
            .output(outputPath)
            .on('end', () => {
                res.json({
                    success: true,
                    data: {
                        processedUrl: outputPath,
                        duration: endTime - startTime,
                        status: 'completed'
                    }
                });
            })
            .on('error', (err) => {
                res.status(500).json({
                    success: false,
                    message: err.message
                });
            })
            .run();
    }
});
```

### 3. Qayta Ishlangan Videoni Yuklab Olish

**Endpoint:** `GET /api/videos/download/:filename`

```javascript
app.get('/api/videos/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'processed', filename);

    // Fayl mavjudligini tekshirish
    if (fs.existsSync(filepath)) {
        res.download(filepath);
    } else {
        res.status(404).json({
            success: false,
            message: 'Fayl topilmadi'
        });
    }
});
```

## Frontend Integratsiya

### Video Yuklash Funksiyasi
```javascript
// Upload tugmasi bosilganda
async function uploadVideo(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('http://localhost:3000/api/videos/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            console.log('Video yuklandi:', result.data);
            return result.data;
        }
    } catch (error) {
        console.error('Xatolik:', error);
    }
}
```

### Video Qayta Ishlash
```javascript
// Process tugmasi bosilganda
async function processVideo(videoUrl, startTime, endTime) {
    try {
        const response = await fetch('http://localhost:3000/api/videos/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                videoUrl: videoUrl,
                startTime: startTime,
                endTime: endTime,
                operation: 'trim'
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('Video qayta ishlandi:', result.data);
            // Download tugmasini faollashtirish
            enableDownloadButton(result.data.processedUrl);
        }
    } catch (error) {
        console.error('Xatolik:', error);
    }
}
```

## Xatoliklar Bilan Ishlash

### CORS Xatoligi
Agar CORS xatoligi bo'lsa, serverga quyidagini qo'shing:

```javascript
const cors = require('cors');

app.use(cors({
    origin: 'http://localhost:8080', // Frontend manzili
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
```

### Fayl Hajmi Xatoligi
```javascript
// Fayl hajmini tekshirish
if (file.size > 100 * 1024 * 1024) {
    alert('Fayl juda katta! Maksimal 100MB');
    return;
}
```

### Server Ulanish Xatoligi
```javascript
// Serverga ulanishni tekshirish
fetch('http://localhost:3000/api/health')
    .then(res => res.json())
    .then(data => {
        console.log('Server ishlayapti');
    })
    .catch(err => {
        console.error('Server ishlamayapti:', err);
        alert('Serverga ulanib bo\'lmadi!');
    });
```

## Kerakli Paketlar

### Backend uchun
```bash
npm install express multer fluent-ffmpeg cors
```

### FFmpeg O'rnatish
Windows uchun:
1. https://ffmpeg.org/download.html dan yuklab oling
2. ZIP faylni oching
3. `ffmpeg.exe` ni PATH ga qo'shing

Linux/Mac uchun:
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# Mac
brew install ffmpeg
```

## Test Qilish

### 1. Serverni Ishga Tushirish
```bash
node server.js
# Server http://localhost:3000 da ishlaydi
```

### 2. Frontend'ni Ochish
```bash
# index.html faylini brauzerda oching
# Yoki Live Server bilan
```

### 3. Video Yuklash va Test Qilish
1. "Upload" tugmasini bosing
2. Video tanlang (100MB dan kichik)
3. Frame timeline'da oraliq tanlang
4. "Process" tugmasini bosing
5. "Download" bilan natijani yuklab oling

## Muammolar va Yechimlar

### Video Yuklanmayapti
- Fayl hajmini tekshiring (100MB dan kichik bo'lishi kerak)
- Server ishlayotganini tekshiring
- Network konsolda xatoliklarni ko'ring

### Frame'lar Ko'rinmayapti
- Video formati to'g'ri ekanligini tekshiring (MP4, WebM, OGG)
- CORS sozlamalarini tekshiring
- Video faylga ruxsat borligini tekshiring

### Process Qilganda Xatolik
- FFmpeg o'rnatilganligini tekshiring
- Server loglarni ko'ring
- Start va End time to'g'ri ekanligini tekshiring

## Qo'shimcha Imkoniyatlar

### Video Sifatini O'zgartirish
```javascript
ffmpeg(input)
    .outputOptions([
        '-vcodec libx264',
        '-crf 28', // Sifat (0-51, kam = yaxshi)
        '-preset fast'
    ])
    .save(output);
```

### Video O'lchamini O'zgartirish
```javascript
ffmpeg(input)
    .size('640x480') // Yangi o'lcham
    .save(output);
```

### Audio Qo'shish/O'chirish
```javascript
// Audio o'chirish
ffmpeg(input)
    .noAudio()
    .save(output);

// Audio qo'shish
ffmpeg(input)
    .input(audioFile)
    .complexFilter([
        '[0:v][1:a]concat=n=1:v=1:a=1[out]'
    ])
    .save(output);
```

## Xavfsizlik

1. **Fayl Tiplari Tekshiruvi**
   - Faqat video fayllarni qabul qiling
   - MIME type tekshiring

2. **Fayl Hajmi Limiti**
   - Maksimal hajm belgilang
   - Server diskini to'ldirishdan saqlaning

3. **Authentication**
   - Kerak bo'lsa JWT token ishlating
   - Rate limiting qo'shing

4. **Validatsiya**
   - Barcha input'larni tekshiring
   - SQL injection'dan saqlaning

## Yordam

Savollar bo'lsa:
- GitHub: [Loyiha repository]
- Email: support@example.com

## Litsenziya
MIT License