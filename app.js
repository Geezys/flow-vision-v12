// ==============================================================================
// 📦 核心依赖导入 (使用国内镜像源 elemecdn)
// ==============================================================================
import { FilesetResolver, HandLandmarker, FaceLandmarker } from "https://npm.elemecdn.com/@mediapipe/tasks-vision@0.10.3/vision_bundle.js";

// ==============================================================================
// 🔧 错误处理工具
// ==============================================================================
function reportError(msg, detail = "") {
    const log = document.getElementById('loading-log');
    const title = document.querySelector('.glitch');
    const bar = document.querySelector('.loader-bar');
    
    if (bar) bar.style.display = 'none';
    if (title) {
        title.innerText = "SYSTEM FAILURE";
        title.style.color = "#ff2a2a";
    }
    if (log) {
        log.innerHTML = `<span style="color:#ff2a2a; font-weight:bold;">${msg}</span><br><br><span style="font-size:16px; color:#aaa;">${detail}</span>`;
    }
    console.error(msg, detail);
}

// ==============================================================================
// 🎨 类定义：干扰特效
// ==============================================================================
class DeadPixel {
    constructor(x, y, size, isPermanent) {
        this.x = x; this.y = y; this.size = size;
        this.isPermanent = isPermanent; this.opacity = 1.0;
    }
    update() { if (!this.isPermanent) this.opacity -= 0.033; }
    draw(ctx) {
        if (this.opacity <= 0) return;
        ctx.fillStyle = `rgba(0, 0, 0, ${this.opacity})`;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}

class DigitalInterference {
    constructor(width, height) {
        this.width = width; this.height = height;
        this.intensity = 0; this.deadPixels = [];
    }
    setIntensity(val) { this.intensity = this.intensity * 0.9 + val * 0.1; }
    update() {
        for (let i = this.deadPixels.length - 1; i >= 0; i--) {
            let p = this.deadPixels[i]; p.update();
            if (!p.isPermanent && p.opacity <= 0) this.deadPixels.splice(i, 1);
        }
        if (this.intensity > 0.1) {
            const spawnCount = Math.floor(this.intensity * 5);
            for(let i=0; i<spawnCount; i++) {
                if (Math.random() > 0.5) continue;
                const isPerm = Math.random() < 0.02;
                const size = Math.random() * 30 + 5;
                this.deadPixels.push(new DeadPixel(Math.random()*this.width, Math.random()*this.height, size, isPerm));
            }
        }
    }
    draw(ctx, videoElement) {
        if (this.intensity < 0.05 && this.deadPixels.length === 0) return;
        ctx.save();
        if (this.intensity > 0.8 && Math.random() < 0.05) {
            ctx.translate(this.width/2, this.height/2);
            ctx.scale(Math.random()>0.5?-1:1, Math.random()>0.5?-1:1);
            ctx.translate(-this.width/2, -this.height/2);
        }
        if (this.intensity > 0.3) {
            const offset = this.intensity * 25;
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.8; try{ ctx.drawImage(videoElement, Math.random()*offset, Math.random()*offset, this.width, this.height); }catch(e){}
            ctx.globalAlpha = 0.6; try{ ctx.drawImage(videoElement, -Math.random()*offset, 0, this.width, this.height); }catch(e){}
            ctx.globalAlpha = 0.8; try{ ctx.drawImage(videoElement, 0, -Math.random()*offset, this.width, this.height); }catch(e){}
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1.0;
        }
        if (this.intensity > 0.2) {
            const sliceCount = Math.floor(this.intensity * 25);
            for(let i=0; i<sliceCount; i++) {
                const isVertical = Math.random() > 0.5;
                if (!isVertical) {
                    const h = Math.random() * 50 + 5; const y = Math.random() * this.height;
                    const shift = (Math.random()-0.5) * 120 * this.intensity;
                    try{ ctx.drawImage(videoElement, 0, y, this.width, h, shift, y, this.width, h); }catch(e){}
                } else {
                    const w = Math.random() * 50 + 5; const x = Math.random() * this.width;
                    const shift = (Math.random()-0.5) * 120 * this.intensity;
                    try{ ctx.drawImage(videoElement, x, 0, w, this.height, x, shift, w, this.height); }catch(e){}
                }
            }
        }
        for(let p of this.deadPixels) p.draw(ctx);
        ctx.restore();
    }
    reset() { this.deadPixels = []; }
}

// ==============================================================================
// ⚙️ 全局变量
// ==============================================================================
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const loadingLog = document.getElementById("loading-log");
const startOverlay = document.getElementById("start-overlay");
const loadingScreen = document.getElementById("loading");

const uiCount = document.getElementById("particle-count");
const uiGravity = document.getElementById("gravity-val");
const uiInfection = document.getElementById("infection-warning");
const uiMusicStatus = document.getElementById("music-status");

const CELL_SIZE = 10;
const CHARS = "01XYZ_█▓▒░ERROR#";
let COLS, ROWS;
let grid = [];      
let particles = []; 
let gravityBias = 0; 
let activeTotalCount = 0;
let gazeTimer = 0;
let lastHeadRot = {x:0, y:0};
let repulsors = [];  
let fistCooldown = 0;

let handLandmarker, faceLandmarker;
let glitchEffect;
let audioCtx;
let isMusicPlaying = false;
let nextNoteTime = 0;
let noteIndex = 0;
let lastVideoTime = -1;
let frameCount = 0;

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17],[0,17]];

// ==============================================================================
// 🎵 音频系统
// ==============================================================================
function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    isMusicPlaying = true;
    scheduler();
    uiMusicStatus.innerText = "ONLINE";
}

function scheduler() {
    if(!isMusicPlaying) return;
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(nextNoteTime);
        nextNoteTime += 0.125; 
        noteIndex++;
        if(noteIndex === 16) noteIndex = 0;
    }
    setTimeout(scheduler, 25);
}

function scheduleNote(time) {
    let freq = 0;
    if (noteIndex % 4 === 0 || noteIndex % 4 === 2) {
        if(noteIndex < 8) freq = 41.20; 
        else if (noteIndex < 12) freq = 49.00;
        else freq = 55.00;
        let type = activeTotalCount > 6000 ? 'square' : 'sawtooth';
        playSynth(freq, time, 0.15, type);
    }
}

function playSynth(freq, time, duration, type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = type; osc.frequency.value = freq;
    filter.type = activeTotalCount > 6000 ? 'highpass' : 'lowpass';
    filter.frequency.value = activeTotalCount > 6000 ? 1500 : 200;
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    filter.frequency.setValueAtTime(100, time);
    filter.frequency.linearRampToValueAtTime(800, time + 0.05);
    filter.frequency.exponentialRampToValueAtTime(100, time + duration);
    osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    osc.start(time); osc.stop(time + duration);
}

function playPurgeSound() {
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(t + 0.3);
}

function playResetSfx() {
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.linearRampToValueAtTime(2000, t + 1);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0, t + 1);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(t + 1);
}

// ==============================================================================
// 🧱 物理粒子系统
// ==============================================================================
function initGrid() {
    COLS = Math.ceil(canvasElement.width / CELL_SIZE);
    ROWS = Math.ceil(canvasElement.height / CELL_SIZE);
    grid = new Array(COLS * ROWS).fill(null);
    particles = [];
}

function getGridIdx(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
}

function getPileHeight(col) {
    if (col < 0 || col >= COLS) return ROWS;
    for(let r=0; r<ROWS; r++) {
        if (grid[r * COLS + col] !== null) return r;
    }
    return ROWS;
}

function purgeParticles(amount) {
    let removed = 0;
    if (particles.length > 0) {
        const toRemove = Math.min(amount, particles.length);
        particles.splice(0, toRemove);
        removed += toRemove;
    }
    if (removed < amount) {
        let attempts = 0;
        while(removed < amount && attempts < amount * 2 && grid.length > 0) {
            const idx = Math.floor(Math.random() * grid.length);
            if (grid[idx] !== null) { grid[idx] = null; removed++; }
            attempts++;
        }
    }
    playPurgeSound();
}

class Particle {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 4; 
        this.vy = -3 - Math.random() * 3;
        this.char = CHARS[Math.floor(Math.random() * CHARS.length)];
        this.color = '#0f0'; 
        this.isStatic = false; this.col = 0; this.row = 0;
    }

    update() {
        for(let r of repulsors) {
            const dx = this.x - r.x; const dy = this.y - r.y;
            const dist = Math.hypot(dx, dy);
            if(dist < 150) {
                if(this.isStatic) {
                    this.isStatic = false;
                    grid[getGridIdx(this.col, this.row)] = null;
                }
                const force = (150 - dist) / 150;
                this.vx += (dx/dist) * force * 5;
                this.vy += (dy/dist) * force * 5;
            }
        }
        if(this.isStatic) return true;
        this.vy += 0.5; this.x += this.vx; this.y += this.vy; this.vx *= 0.95; 
        let c = Math.floor(this.x / CELL_SIZE);
        let r = Math.floor(this.y / CELL_SIZE);
        let idx = getGridIdx(c, r);
        if (r >= ROWS - 1 || (idx !== -1 && grid[idx] !== null)) {
            if (c >= 0 && c < COLS) {
                while (r > 0 && grid[getGridIdx(c, r)] !== null) { r--; }
                let finalIdx = getGridIdx(c, r);
                if (finalIdx !== -1) {
                    this.isStatic = true; this.col = c; this.row = r;
                    let hRatio = r / ROWS;
                    if (hRatio < 0.5) this.color = '#ff2a2a'; 
                    else if (hRatio < 0.8) this.color = '#0ff'; 
                    else this.color = '#0f0'; 
                    grid[finalIdx] = this; this.vx = 0; this.vy = 0;
                }
            } else { return false; }
        }
        return true;
    }

    draw(ctx) {
        let px = this.isStatic ? this.col * CELL_SIZE : this.x;
        let py = this.isStatic ? this.row * CELL_SIZE : this.y;
        ctx.fillStyle = this.color;
        if(!this.isStatic) { ctx.shadowBlur = 4; ctx.shadowColor = this.color; } 
        else { ctx.shadowBlur = 0; }
        ctx.fillText(this.char, px, py + CELL_SIZE);
    }
}

function updatePhysics() {
    for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].update()) particles.splice(i, 1);
    }
    let step = frameCount % 2 === 0 ? 1 : -1;
    let start = frameCount % 2 === 0 ? 0 : COLS - 1;
    let end = frameCount % 2 === 0 ? COLS : -1;
    if (gravityBias > 0.2) { step = -1; start = COLS - 1; end = -1; }
    if (gravityBias < -0.2) { step = 1; start = 0; end = COLS; }
    let staticCount = 0;
    for (let r = ROWS - 2; r >= 0; r--) {
        for (let c = start; c !== end; c += step) {
            let idx = r * COLS + c;
            let p = grid[idx];
            if (p) {
                staticCount++;
                let below = (r + 1) * COLS + c;
                let belowL = (r + 1) * COLS + (c - 1);
                let belowR = (r + 1) * COLS + (c + 1);
                if (grid[below] === null) {
                    grid[below] = p; grid[idx] = null; p.row++;
                } else {
                    let tryL = (c > 0 && grid[belowL] === null);
                    let tryR = (c < COLS - 1 && grid[belowR] === null);
                    let goLeft = Math.random() > 0.5;
                    if (gravityBias < -0.1) goLeft = true;
                    if (gravityBias > 0.1) goLeft = false;
                    if (goLeft) {
                        if (tryL) { grid[belowL] = p; grid[idx] = null; p.row++; p.col--; }
                        else if (tryR) { grid[belowR] = p; grid[idx] = null; p.row++; p.col++; }
                    } else {
                        if (tryR) { grid[belowR] = p; grid[idx] = null; p.row++; p.col++; }
                        else if (tryL) { grid[belowL] = p; grid[idx] = null; p.row++; p.col--; }
                    }
                }
            }
        }
    }
    activeTotalCount = staticCount + particles.length;
    uiCount.innerText = activeTotalCount;
}

// ==============================================================================
// 🧠 逻辑控制
// ==============================================================================
function updateFaceLogic(face) {
    const dy = face[263].y - face[33].y;
    const dx = face[263].x - face[33].x;
    gravityBias = Math.atan2(dy, dx) * 2.5; 
    uiGravity.innerText = gravityBias.toFixed(2);

    const headRotX = Math.abs(dx);
    const headRotY = Math.abs(dy);
    const delta = Math.abs(headRotX - lastHeadRot.x) + Math.abs(headRotY - lastHeadRot.y);
    if (delta < 0.005) gazeTimer++; else gazeTimer = 0;
    lastHeadRot = {x: headRotX, y: headRotY};

    let currentIntensity = 0;
    if (activeTotalCount > 6000) {
        currentIntensity = 1.0; 
        uiInfection.style.display = 'block';
        uiInfection.innerText = "CRITICAL MASS: >6000";
    } else if (gazeTimer > 120) { 
        currentIntensity = Math.min((gazeTimer - 120) * 0.01, 1.0); 
        uiInfection.style.display = 'block';
        uiInfection.innerText = "GAZE DETECTED";
    } else {
        uiInfection.style.display = 'none';
    }
    if(glitchEffect) glitchEffect.setIntensity(currentIntensity);
}

function drawFaceEffect(face) {
    const pupilL = face[468];
    const pupilR = face[473];
    canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.5)";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(pupilL.x * canvasElement.width, pupilL.y * canvasElement.height);
    canvasCtx.lineTo(pupilL.x * canvasElement.width + gravityBias * 200, canvasElement.height);
    canvasCtx.moveTo(pupilR.x * canvasElement.width, pupilR.y * canvasElement.height);
    canvasCtx.lineTo(pupilR.x * canvasElement.width + gravityBias * 200, canvasElement.height);
    canvasCtx.stroke();

    const chinY = face[152].y * canvasElement.height;
    const chinRow = Math.floor(chinY / CELL_SIZE);
    const noseX = face[1].x * canvasElement.width;
    const noseCol = Math.floor(noseX / CELL_SIZE);
    let pileHeight = getPileHeight(noseCol);
    pileHeight = Math.min(pileHeight, getPileHeight(noseCol-2), getPileHeight(noseCol+2));

    if (pileHeight <= chinRow) {
        let minX=1, minY=1, maxX=0, maxY=0;
        for(let pt of face) { if(pt.x<minX)minX=pt.x; if(pt.x>maxX)maxX=pt.x; if(pt.y<minY)minY=pt.y; if(pt.y>maxY)maxY=pt.y; }
        const x=minX*canvasElement.width, y=minY*canvasElement.height, w=(maxX-minX)*canvasElement.width, h=(maxY-minY)*canvasElement.height;
        canvasCtx.save(); canvasCtx.beginPath(); canvasCtx.rect(x, y, w, h); canvasCtx.clip();
        canvasCtx.fillStyle = "rgba(0,0,0,0.9)"; canvasCtx.fillRect(x, y, w, h);
        for(let i=0; i<40; i++) {
            canvasCtx.fillStyle = Math.random()>0.5 ? "#0f0" : "#fff";
            canvasCtx.fillRect(x + Math.random()*w, y + Math.random()*h, Math.random()*20, 2);
        }
        canvasCtx.fillStyle = "red"; canvasCtx.font = "30px monospace"; canvasCtx.fillText("INFECTED", x+10, y + h/2);
        canvasCtx.restore();
    }
}

function isFist(landmarks) {
    const tips = [8,12,16,20];
    const pips = [6,10,14,18];
    let bentCount = 0;
    for(let i=0; i<4; i++) {
        // 安全检查防止 undefined
        if(landmarks[tips[i]] && landmarks[pips[i]]) {
            if(landmarks[tips[i]].y > landmarks[pips[i]].y) bentCount++;
        }
    }
    const thumbDist = Math.abs(landmarks[4].x - landmarks[17].x);
    if(thumbDist < 0.1) bentCount++;
    return bentCount >= 4; 
}

function countFingers(landmarks) {
    let c = 0;
    const tips = [8,12,16,20];
    const pips = [6,10,14,18];
    for(let i=0; i<4; i++) if(landmarks[tips[i]].y < landmarks[pips[i]].y) c++;
    if(Math.abs(landmarks[4].x - landmarks[17].x) > 0.15) c++;
    return c;
}

function drawTechHand(landmarks) {
    canvasCtx.strokeStyle = "rgba(0, 255, 200, 0.4)";
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    for(let con of HAND_CONNECTIONS) {
        const s = landmarks[con[0]];
        const e = landmarks[con[1]];
        if(s && e) {
            canvasCtx.moveTo(s.x * canvasElement.width, s.y * canvasElement.height);
            canvasCtx.lineTo(e.x * canvasElement.width, e.y * canvasElement.height);
        }
    }
    canvasCtx.stroke();
    canvasCtx.strokeStyle = "#0ff";
    for(let pt of landmarks) {
        const px = pt.x * canvasElement.width;
        const py = pt.y * canvasElement.height;
        canvasCtx.beginPath();
        canvasCtx.moveTo(px-2, py); canvasCtx.lineTo(px+2, py);
        canvasCtx.moveTo(px, py-2); canvasCtx.lineTo(px, py+2);
        canvasCtx.stroke();
    }
}

function checkResetGesture(results) {
    if(results.landmarks.length !== 2) return;
    
    // 安全获取手部类别
    let hand1 = results.landmarks[0], hand2 = results.landmarks[1];
    
    // 假设第一个是左手，第二个是右手 (如果没有 handedness 数据)
    // 更好的方式是直接数手指，不管左右
    const h1 = countFingers(hand1);
    const h2 = countFingers(hand2);
    
    // 2指 + 3指 重置
    if ((h1===2 && h2===3) || (h1===3 && h2===2)) {
        initGrid(); particles = []; playResetSfx();
        canvasCtx.fillStyle = "#fff";
        canvasCtx.fillRect(0,0, canvasElement.width, canvasElement.height);
        if(glitchEffect) glitchEffect.setIntensity(0);
    }
}

// ==============================================================================
// 🚀 初始化与循环
// ==============================================================================
async function init() {
    try {
        loadingLog.innerText = "Connecting to China CDN...";

        // 1. 加载 WASM (从国内阿里镜像)
        const vision = await FilesetResolver.forVisionTasks(
            "https://npm.elemecdn.com/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        loadingLog.innerText = "Loading AI Models...";

        // 2. 加载模型 (强制 CPU 模式)
        [handLandmarker, faceLandmarker] = await Promise.all([
            HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                numHands: 2
            }),
            FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                numFaces: 1
            })
        ]);

        loadingLog.innerText = "Starting Camera...";
        startCamera();

    } catch (e) {
        reportError("AI Load Failed", e.message);
    }
}

function startCamera() {
    // 检查浏览器是否支持
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        reportError("Browser Not Supported", "Please use Chrome/Edge (HTTPS required)");
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", () => {
                canvasElement.width = video.videoWidth;
                canvasElement.height = video.videoHeight;
                initGrid();
                glitchEffect = new DigitalInterference(canvasElement.width, canvasElement.height);
                loadingScreen.style.display = 'none';
                startOverlay.style.display = 'flex';
                document.querySelector('.start-btn').addEventListener('click', () => {
                    initAudio();
                    startOverlay.style.display = 'none';
                    renderLoop();
                });
            });
        })
        .catch((err) => {
            reportError("Camera Access Denied", "Check browser permissions or HTTPS");
        });
}

async function renderLoop() {
    frameCount++;
    const now = performance.now();
    if (fistCooldown > 0) fistCooldown--;

    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const handResults = handLandmarker.detectForVideo(video, now);
        const faceResults = faceLandmarker.detectForVideo(video, now);

        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // 1. 干扰
        if (glitchEffect) {
            glitchEffect.update();
            glitchEffect.draw(canvasCtx, video);
        }

        // 2. 面部
        gravityBias = 0;
        if (faceResults.faceLandmarks.length > 0) {
            updateFaceLogic(faceResults.faceLandmarks[0]);
            drawFaceEffect(faceResults.faceLandmarks[0]);
        } else {
            gazeTimer = 0;
            if (activeTotalCount <= 6000 && glitchEffect) glitchEffect.setIntensity(0);
        }

        // 3. 手部
        repulsors = [];
        if (handResults.landmarks.length > 0) {
            checkResetGesture(handResults);

            for (let i = 0; i < handResults.landmarks.length; i++) {
                const landmarks = handResults.landmarks[i];
                
                // 简单的左右手判定
                let isLeftHand = false;
                if(handResults.handedness && handResults.handedness[i]) {
                    isLeftHand = (handResults.handedness[i][0].categoryName === "Right"); // Mirror mode
                }

                drawTechHand(landmarks);

                if (isLeftHand && isFist(landmarks)) {
                    if (fistCooldown === 0) {
                        purgeParticles(1000); fistCooldown = 30;
                        const pX = landmarks[9].x * canvasElement.width;
                        const pY = landmarks[9].y * canvasElement.height;
                        canvasCtx.fillStyle = "rgba(255,0,0,0.5)";
                        canvasCtx.beginPath(); canvasCtx.arc(pX, pY, 100, 0, Math.PI*2); canvasCtx.fill();
                    }
                }

                if (countFingers(landmarks) === 5) {
                    const palmX = (landmarks[0].x + landmarks[9].x)/2 * canvasElement.width;
                    const palmY = (landmarks[0].y + landmarks[9].y)/2 * canvasElement.height;
                    repulsors.push({x: palmX, y: palmY});
                    canvasCtx.beginPath(); canvasCtx.arc(palmX, palmY, 80, 0, Math.PI*2);
                    canvasCtx.strokeStyle = "rgba(255,255,255,0.5)"; canvasCtx.setLineDash([4, 4]);
                    canvasCtx.stroke(); canvasCtx.setLineDash([]);
                }

                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                const d = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                if (d < 0.1) {
                    const px = indexTip.x * canvasElement.width;
                    const py = indexTip.y * canvasElement.height;
                    for(let k=0; k<4; k++) particles.push(new Particle(px + (Math.random()-0.5)*30, py));
                }
            }
        }

        updatePhysics();
        canvasCtx.font = "10px monospace";
        canvasCtx.shadowBlur = 0;
        for (let i = 0; i < grid.length; i++) if (grid[i]) grid[i].draw(canvasCtx);
        for (let p of particles) p.draw(canvasCtx);
    }
    requestAnimationFrame(renderLoop);
}

// 启动
init();
