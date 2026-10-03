// script.js - Camera + OpenCV.js demo

let video = document.getElementById('video');
let canvasInput = document.getElementById('canvasInput'); // hidden canvas for grabbing frames
let canvasOutput = document.getElementById('canvasOutput');
let ctxInput = canvasInput.getContext('2d');
let ctxOutput = canvasOutput.getContext('2d');

let stream = null;
let processing = false;
let currentMode = 'original';
let fpsCounter = [];
let lastTimestamp = performance.now();

// UI elements
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnCapture = document.getElementById('btnCapture');
const modeButtons = document.querySelectorAll('.mode-btn');

const cameraStatus = document.getElementById('cameraStatus');
const opencvStatus = document.getElementById('opencvStatus');
const resolutionSpan = document.getElementById('resolution');
const fpsSpan = document.getElementById('fps');
const processModeSpan = document.getElementById('processMode');

/** ---------- OpenCV.js loading ---------- */
function onOpenCvReady() {
    if (cv && cv['ready']) {
        opencvStatus.className = 'status-dot ready';
        opencvStatus.title = 'OpenCV.js ready';
        enableControls();
    } else {
        // Fallback if cv object exists but not yet ready
        setTimeout(onOpenCvReady, 100);
    }
}

function enableControls() {
    btnStart.disabled = false;
    // mode buttons stay disabled until camera started
}

/** ---------- Camera handling ---------- */
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            // Set canvas sizes to match video resolution (limit size for performance)
            const width = video.videoWidth;
            const height = video.videoHeight;
            // If resolution is too large, downscale to ~640x480
            const maxWidth = 640;
            const scale = Math.min(1, maxWidth / width);
            canvasInput.width = width * scale;
            canvasInput.height = height * scale;
            canvasOutput.width = canvasInput.width;
            canvasOutput.height = canvasInput.height;
            resolutionSpan.textContent = `${canvasInput.width} × ${canvasInput.height}`;
            cameraStatus.className = 'status-dot ready';
            cameraStatus.title = 'Camera ready';
            btnStop.disabled = false;
            btnCapture.disabled = false;
            modeButtons.forEach(b => b.disabled = false);
            processing = true;
            requestAnimationFrame(processFrame);
        };
    } catch (err) {
        console.error('Camera error:', err);
        cameraStatus.className = 'status-dot error';
        cameraStatus.title = err.message;
    }
}

function stopCamera() {
    if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(t => t.stop());
        stream = null;
    }
    processing = false;
    cameraStatus.className = 'status-dot pending';
    cameraStatus.title = 'Camera stopped';
    btnStop.disabled = true;
    btnCapture.disabled = true;
    modeButtons.forEach(b => b.disabled = true);
}

function captureFrame() {
    // Draw current video frame onto hidden canvas and then download as image
    ctxInput.drawImage(video, 0, 0, canvasInput.width, canvasInput.height);
    canvasInput.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `capture_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}

/** ---------- Processing ---------- */
function processFrame() {
    if (!processing) return;
    // Draw video frame onto hidden canvas
    ctxInput.drawImage(video, 0, 0, canvasInput.width, canvasInput.height);
    // Read the canvas into OpenCV Mat
    let src = cv.imread(canvasInput);
    let dst = new cv.Mat();

    switch (currentMode) {
        case 'original':
            src.copyTo(dst);
            break;
        case 'grayscale':
            cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
            break;
        case 'blur':
            cv.GaussianBlur(src, dst, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);
            break;
        case 'threshold':
            cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
            cv.threshold(dst, dst, 127, 255, cv.THRESH_BINARY);
            break;
        case 'canny':
            cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
            cv.Canny(dst, dst, 50, 150);
            break;
        default:
            src.copyTo(dst);
    }

    // Show result on output canvas. For single‑channel mats we need to convert back to RGBA.
    if (dst.type() === cv.CV_8UC1) {
        cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA);
    }
    cv.imshow('canvasOutput', dst);

    // Clean up
    src.delete();
    dst.delete();

    // FPS calculation (simple moving average over last few frames)
    const now = performance.now();
    const delta = now - lastTimestamp;
    lastTimestamp = now;
    const fps = 1000 / delta;
    fpsCounter.push(fps);
    if (fpsCounter.length > 30) fpsCounter.shift();
    const avgFps = fpsCounter.reduce((a, b) => a + b, 0) / fpsCounter.length;
    fpsSpan.textContent = avgFps.toFixed(1);

    requestAnimationFrame(processFrame);
}

/** ---------- UI wiring ---------- */
btnStart.addEventListener('click', () => {
    btnStart.disabled = true;
    startCamera();
});
btnStop.addEventListener('click', () => {
    stopCamera();
    btnStart.disabled = false;
});
btnCapture.addEventListener('click', captureFrame);

modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        processModeSpan.textContent = btn.textContent;
    });
});

// Initialize UI state
cameraStatus.className = 'status-dot pending';
cameraStatus.title = 'Waiting for permission';
opencvStatus.className = 'status-dot pending';
opencvStatus.title = 'Loading OpenCV.js...';
processModeSpan.textContent = 'None';

// If the browser does not support getUserMedia, show error
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Your browser does not support the Media Devices API required for camera access.');
    cameraStatus.className = 'status-dot error';
    cameraStatus.title = 'Unsupported browser';
}
