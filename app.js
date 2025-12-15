// ==============================================================================
// 📦 核心依赖导入 (使用 jsDelivr CDN，版本锁定 0.10.0，避免未来API变动)
// ==============================================================================
import { FilesetResolver, HandLandmarker, FaceLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

// ==============================================================================
// 🎨 类定义：数字干扰特效 (Glitch Effect - 之前 glitch_fx.js 的内容)
// ==============================================================================
class DeadPixel {
    constructor(x, y, size, isPermanent) {
        this.x = x; this.y = y; this.size = size;
        this.isPermanent = isPermanent;
        this.opacity = 1.0; // 透明度
    }
    update() {
        // 非永久性坏点逐渐消失
        if (!this.isPermanent) this.opacity -= 0.033; // 约0.5秒
    }
    draw(ctx) {
        if (this.opacity <= 0) return;
        ctx.fillStyle = `rgba(0, 0, 0, ${this.opacity})`;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}

class DigitalInterference {
    constructor(width, height) {
        this.width = width; this.height = height;
        this.intensity = 0; // 干扰强度 (0.0 - 1.0)
        this.deadPixels = []; // 坏点列表
        this.frameCounter = 0; // 内部帧计数
    }

    setIntensity(val) {
        // 平滑过渡强度值，避免突变
        this.intensity = this.intensity * 0.9 + val * 0.1;
    }

    update() {
        this.frameCounter++;
        // 更新坏点生命周期
        for (let i = this.deadPixels.length - 1; i >= 0; i--) {
            let p = this.deadPixels[i];
            p.update();
            if (!p.isPermanent && p.opacity <= 0) {
                this.deadPixels.splice(i, 1);
            }
        }

        // 随机生成坏点 (强度越高，生成频率越高)
        if (this.intensity > 0.1) {
            const spawnCount = Math.floor(this.intensity * 5);
            for (let i = 0; i < spawnCount; i++) {
                if (Math.random() > 0.5) continue;

                // 2% 几率生成永久坏点
                const isPerm = Math.random() < 0.02;
                const size = Math.random() * 30 + 5; // 坏点大小
                // 随机位置
                this.deadPixels.push(new DeadPixel(Math.random() * this.width, Math.random() * this.height, size, isPerm));
            }
        }
    }

    draw(ctx, videoElement) {
        // 如果强度极低且没有坏点，则不绘制任何干扰
        if (this.intensity < 0.05 && this.deadPixels.length === 0) return;

        ctx.save(); // 保存当前Canvas状态

        // -----------------------------
        // 1. 屏幕翻转 (左右/上下) - 仅在强度高时随机触发
        // -----------------------------
        if (this.intensity > 0.8 && Math.random() < 0.05) { // 5% 概率触发
            const flipX = Math.random() > 0.5 ? -1 : 1;
            const flipY = Math.random() > 0.5 ? -1 : 1;

            ctx.translate(this.width / 2, this.height / 2);
            ctx.scale(flipX, flipY);
            ctx.translate(-this.width / 2, -this.height / 2);
        }

        // -----------------------------
        // 2. RGB 三色通道分离 (Chromatic Aberration) - 模拟色差
        // -----------------------------
        if (this.intensity > 0.3) {
            const offset = this.intensity * 25; // 偏移量随强度增加

            // 使用'screen'混合模式进行颜色叠加
            ctx.globalCompositeOperation = 'screen';

            // 绘制红色通道 (稍微偏移)
            ctx.globalAlpha = 0.8; // 透明度
            // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
            try { // 使用 try-catch 防止 videoElement 在特定状态下报错
                ctx.drawImage(videoElement, Math.random() * offset, Math.random() * offset, this.width, this.height);
            } catch (e) { /* ignore */ }

            // 绘制绿色通道 (稍微偏移)
            ctx.globalAlpha = 0.6;
            try {
                ctx.drawImage(videoElement, -Math.random() * offset, 0, this.width, this.height);
            } catch (e) { /* ignore */ }

            // 绘制蓝色通道 (稍微偏移)
            ctx.globalAlpha = 0.8;
            try {
                ctx.drawImage(videoElement, 0, -Math.random() * offset, this.width, this.height);
            } catch (e) { /* ignore */ }

            // 恢复默认混合模式和透明度
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
        }

        // -----------------------------
        // 3. 画面撕裂 (Tearing) - 包括横向和纵向
        // -----------------------------
        if (this.intensity > 0.2) {
            const sliceCount = Math.floor(this.intensity * 25); // 撕裂条数
            for (let i = 0; i < sliceCount; i++) {
                const isVertical = Math.random() > 0.5; // 随机横向或纵向撕裂

                if (!isVertical) {
                    // 横向撕裂
                    const sliceH = Math.random() * 50 + 5; // 切片高度
                    const sliceY = Math.random() * this.height;
                    const shiftX = (Math.random() - 0.5) * 120 * this.intensity; // 横向偏移量
                    try {
                        ctx.drawImage(videoElement, 0, sliceY, this.width, sliceH, shiftX, sliceY, this.width, sliceH);
                        // 偶尔添加绿色扫描线
                        if (Math.random() > 0.8) {
                            ctx.fillStyle = "rgba(0, 255, 0, 0.6)";
                            ctx.fillRect(0, sliceY, this.width, 2);
                        }
                    } catch (e) { }
                } else {
                    // 纵向撕裂
                    const sliceW = Math.random() * 50 + 5; // 切片宽度
                    const sliceX = Math.random() * this.width;
                    const shiftY = (Math.random() - 0.5) * 120 * this.intensity; // 纵向偏移量
                    try {
                        ctx.drawImage(videoElement, sliceX, 0, sliceW, this.height, sliceX, shiftY, sliceW, this.height);
                    } catch (e) { }
                }
            }
        }

        // -----------------------------
        // 4. 坏点绘制
        // -----------------------------
        for (let p of this.deadPixels) {
            p.draw(ctx);
        }

        ctx.restore(); // 恢复Canvas状态
    }

    // 重置所有坏点 (用于手势重置)
    reset() {
        this.deadPixels = [];
    }
}

// ==============================================================================
// ⚙️ 全局配置与DOM元素获取
// ==============================================================================
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const loadingLog = document.getElementById("loading-log");
const startOverlay = document.getElementById("start-overlay");
const loadingScreen = document.getElementById("loading");

// HUD 元素
const uiCount = document.getElementById("particle-count");
const uiGravity = document.getElementById("gravity-val");
const uiInfection = document.getElementById("infection-warning");
const uiMusicStatus = document.getElementById("music-status"); // 新增音乐状态UI

// 物理参数
const CELL_SIZE = 10; // 粒子像素大小
const CHARS = "01XYZ_█▓▒░ERROR#"; // 粒子字符集
let COLS, ROWS; // 网格列数和行数
let grid = [];      // 存储已堆积的静态粒子 (Cellular Automata)
let particles = []; // 存储空中动态粒子

// 交互状态
let gravityBias = 0; // 重力倾斜 (-1.0 ~ 1.0, 歪头控制)
let activeTotalCount = 0; // 当前屏幕上的粒子总数
let gazeTimer = 0; // 凝视计时器
let lastHeadRot = { x: 0, y: 0 }; // 上一帧头部旋转状态 (用于凝视检测)
let repulsors = [];  // 斥力场位置列表 (手掌张开时)
let fistCooldown = 0; // 握拳消除粒子的冷却时间 (防止频繁触发)

// AI 模型实例
let handLandmarker, faceLandmarker;
let glitchEffect; // 数字干扰特效模块实例

// 音频系统状态
let audioCtx; // Web Audio API 上下文
let isMusicPlaying = false;
let nextNoteTime = 0; // 下一个要播放的音符时间
let noteIndex = 0; // 音乐模式下的音符索引

// 帧同步
let lastVideoTime = -1; // 上一帧视频时间戳
let frameCount = 0; // 内部帧计数器

// MediaPipe手部连接点索引 (用于画骨骼线)
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // 拇指
    [0, 5], [5, 6], [6, 7], [7, 8], // 食指
    [0, 9], [9, 10], [10, 11], [11, 12], // 中指
    [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
    [0, 17], [17, 18], [18, 19], [19, 20], // 小指
    [5, 9], [9, 13], [13, 17], [0, 17] // 手掌连接
];

// ==============================================================================
// 🎵 音频系统 (Cyberpunk Bassline & SFX)
// ==============================================================================
function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    isMusicPlaying = true;
    scheduler(); // 启动音乐调度器
    uiMusicStatus.innerText = "ONLINE"; // 更新UI
    console.log("Audio System Initialized.");
}

// 音乐调度器 (保证节奏准确)
function scheduler() {
    if (!isMusicPlaying) return;
    const tempo = 120.0; // BPM
    const secondsPerBeat = 60.0 / tempo;
    const interval = secondsPerBeat * 0.25; // 16分音符的间隔

    // 提前调度音符，防止延迟
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(nextNoteTime);
        nextNoteTime += interval;
        noteIndex++;
        if (noteIndex === 16) noteIndex = 0; // 循环16个音符
    }
    setTimeout(scheduler, 25); // 每25ms检查一次
}

// 播放单个音符 (FM合成)
function scheduleNote(time) {
    let freq = 0;
    // 基础 Bassline 模式
    if (noteIndex % 4 === 0 || noteIndex % 4 === 2) {
        if (noteIndex < 8) freq = 41.20; // E1
        else if (noteIndex < 12) freq = 49.00; // G1
        else freq = 55.00; // A1

        // 粒子过多时，音乐变得更刺耳 (方波)
        let type = activeTotalCount > 6000 ? 'square' : 'sawtooth';
        playSynth(freq, time, 0.15, type);
    }
}

// 合成器核心 (生成声音)
function playSynth(freq, time, duration, type) {
    if (!audioCtx) return; // 确保音频上下文已初始化
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = type;
    osc.frequency.value = freq;

    // 滤波器类型根据粒子数量变化
    filter.type = activeTotalCount > 6000 ? 'highpass' : 'lowpass';
    filter.frequency.value = activeTotalCount > 6000 ? 1500 : 200; // 粒子多时高频更多

    // 增益包络 (Fade In/Out)
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    // 滤波器频率包络 (Wub-Wub效果)
    filter.frequency.setValueAtTime(100, time);
    filter.frequency.linearRampToValueAtTime(800, time + 0.05);
    filter.frequency.exponentialRampToValueAtTime(100, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(time);
    osc.stop(time + duration);
}

// 粒子湮灭音效
function playPurgeSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(t + 0.3);
}

// 重置音效
function playResetSfx() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.linearRampToValueAtTime(2000, t + 1);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0, t + 1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(t + 1);
}

// ==============================================================================
// 🧱 物理粒子系统 (Falling Sand / Cellular Automata)
// ==============================================================================
function initGrid() {
    COLS = Math.ceil(canvasElement.width / CELL_SIZE);
    ROWS = Math.ceil(canvasElement.height / CELL_SIZE);
    grid = new Array(COLS * ROWS).fill(null);
    particles = []; // 清空动态粒子
}

// 获取网格索引 (安全检查，防止越界)
function getGridIdx(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
}

// 从网格中获取某列的最高堆积点 (Row Index, 越小表示越靠上)
function getPileHeight(col) {
    if (col < 0 || col >= COLS) return ROWS;
    for (let r = 0; r < ROWS; r++) {
        if (grid[r * COLS + col] !== null) return r;
    }
    return ROWS; // 如果该列为空，则高度为底部
}

// 粒子湮灭函数 (由左手握拳触发)
function purgeParticles(amount) {
    let removed = 0;

    // 1. 优先移除空中的动态粒子
    if (particles.length > 0) {
        const toRemove = Math.min(amount, particles.length);
        particles.splice(0, toRemove);
        removed += toRemove;
    }

    // 2. 如果还有剩余数量，随机移除地上的静态粒子
    if (removed < amount) {
        let attempts = 0;
        // 尝试移除2倍目标数量，防止卡死
        while (removed < amount && attempts < amount * 2 && grid.length > 0) {
            const idx = Math.floor(Math.random() * grid.length);
            if (grid[idx] !== null) {
                grid[idx] = null; // 从网格中清除
                removed++;
            }
            attempts++;
        }
    }
    playPurgeSound(); // 播放湮灭音效
}

// Particle 类 (粒子的行为和绘制)
class Particle {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 4; // 初始随机水平速度
        this.vy = -3 - Math.random() * 3; // 初始向上喷射速度
        this.char = CHARS[Math.floor(Math.random() * CHARS.length)]; // 随机字符
        this.color = '#0f0'; // 初始绿色
        this.isStatic = false; // 是否已堆积固化
        this.col = 0; this.row = 0; // 对应的网格坐标
    }

    update() {
        // 1. 斥力场影响
        for (let r of repulsors) {
            const dx = this.x - r.x;
            const dy = this.y - r.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 150) { // 斥力作用范围
                if (this.isStatic) { // 如果是静态的，被斥力推开变成动态
                    this.isStatic = false;
                    grid[getGridIdx(this.col, this.row)] = null;
                }
                const force = (150 - dist) / 150; // 距离越近，力越大
                this.vx += (dx / dist) * force * 5; // 推开
                this.vy += (dy / dist) * force * 5;
            }
        }

        if (this.isStatic) return true; // 如果是静态粒子，不再更新物理

        // 2. 物理运动
        this.vy += 0.5; // 重力加速
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95; // 空气阻力减速

        // 3. 碰撞检测与堆积
        let c = Math.floor(this.x / CELL_SIZE);
        let r = Math.floor(this.y / CELL_SIZE);
        let idx = getGridIdx(c, r);

        // 如果粒子到达底部 或 碰撞到已有粒子
        if (r >= ROWS - 1 || (idx !== -1 && grid[idx] !== null)) {
            if (c >= 0 && c < COLS) {
                // 向上寻找最近的空位进行堆积
                while (r > 0 && grid[getGridIdx(c, r)] !== null) { r--; }
                let finalIdx = getGridIdx(c, r);

                if (finalIdx !== -1) { // 成功找到堆积位置
                    this.isStatic = true;
                    this.col = c;
                    this.row = r;

                    // 根据堆积高度改变颜色
                    let hRatio = r / ROWS;
                    if (hRatio < 0.5) this.color = '#ff2a2a'; // 高处红色 (危险)
                    else if (hRatio < 0.8) this.color = '#0ff'; // 中间青色
                    else this.color = '#0f0'; // 底部绿色

                    grid[finalIdx] = this; // 放入网格
                    this.vx = 0; this.vy = 0; // 停止运动
                }
            } else {
                return false; // 粒子出界，标记为死亡
            }
        }
        return true; // 粒子仍然存活
    }

    draw(ctx) {
        // 计算绘制的像素坐标
        let px = this.isStatic ? this.col * CELL_SIZE : this.x;
        let py = this.isStatic ? this.row * CELL_SIZE : this.y;

        ctx.fillStyle = this.color;
        // 动态粒子有发光效果，静态粒子没有
        if (!this.isStatic) {
            ctx.shadowBlur = 4; ctx.shadowColor = this.color;
        } else {
            ctx.shadowBlur = 0; // 清除阴影
        }
        ctx.fillText(this.char, px, py + CELL_SIZE); // 绘制字符
    }
}

// 更新整个物理世界
function updatePhysics() {
    // 1. 更新所有空中粒子
    for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].update()) { // 如果粒子死亡 (出界)，则移除
            particles.splice(i, 1);
        }
    }

    // 2. 更新网格中的静态粒子 (落沙算法)
    // 根据 `gravityBias` (歪头) 决定扫描方向，模拟倾斜重力
    let step = frameCount % 2 === 0 ? 1 : -1; // 奇偶帧交替扫描，防止偏向性
    let start = frameCount % 2 === 0 ? 0 : COLS - 1;
    let end = frameCount % 2 === 0 ? COLS : -1;

    // 根据头部倾斜方向调整扫描起始点
    if (gravityBias > 0.2) { step = -1; start = COLS - 1; end = -1; } // 向右倾斜，从右往左扫
    if (gravityBias < -0.2) { step = 1; start = 0; end = COLS; }     // 向左倾斜，从左往右扫

    let staticCount = 0; // 统计静态粒子数量

    for (let r = ROWS - 2; r >= 0; r--) { // 从倒数第二行开始向上遍历
        for (let c = start; c !== end; c += step) {
            let idx = getGridIdx(c, r);
            let p = grid[idx]; // 获取当前网格的粒子

            if (p) { // 如果有粒子
                staticCount++;
                let below = getGridIdx(c, r + 1);
                let belowL = getGridIdx(c - 1, r + 1);
                let belowR = getGridIdx(c + 1, r + 1);

                // 优先尝试直接下落
                if (grid[below] === null) {
                    grid[below] = p; grid[idx] = null; p.row++;
                }
                // 否则，根据重力偏向尝试向左右滑动
                else {
                    let tryL = (c > 0 && grid[belowL] === null);
                    let tryR = (c < COLS - 1 && grid[belowR] === null);
                    let goLeft = Math.random() > 0.5; // 默认随机方向

                    // 根据 `gravityBias` 强制偏向
                    if (gravityBias < -0.1) goLeft = true;
                    if (gravityBias > 0.1) goLeft = false;

                    if (goLeft) { // 尝试向左下滑
                        if (tryL) { grid[belowL] = p; grid[idx] = null; p.row++; p.col--; }
                        else if (tryR) { grid[belowR] = p; grid[idx] = null; p.row++; p.col++; } // 左边堵住，尝试右边
                    } else { // 尝试向右下滑
                        if (tryR) { grid[belowR] = p; grid[idx] = null; p.row++; p.col++; }
                        else if (tryL) { grid[belowL] = p; grid[idx] = null; p.row++; p.col--; } // 右边堵住，尝试左边
                    }
                }
            }
        }
    }

    // 更新粒子总数 UI
    activeTotalCount = staticCount + particles.length;
    uiCount.innerText = activeTotalCount;
}

// ==============================================================================
// 🧠 逻辑控制器 (处理面部和手势的 AI 识别结果)
// ==============================================================================

// 更新面部逻辑 (计算重力、凝视、感染状态)
function updateFaceLogic(face) {
    // 1. 计算头部倾斜 (左右眼角 Y 差值决定)
    const dy = face[263].y - face[33].y; // 右眼 Y - 左眼 Y
    const dx = face[263].x - face[33].x; // 右眼 X - 左眼 X
    gravityBias = Math.atan2(dy, dx) * 2.5; // 映射到 -1.0 到 1.0 左右
    uiGravity.innerText = gravityBias.toFixed(2); // 更新 HUD

    // 2. 检测凝视 (头部长时间静止且正对屏幕)
    const headRotX = Math.abs(dx);
    const headRotY = Math.abs(dy);
    const delta = Math.abs(headRotX - lastHeadRot.x) + Math.abs(headRotY - lastHeadRot.y);

    if (delta < 0.005) { // 如果头部角度变化很小，则计时
        gazeTimer++;
    } else {
        gazeTimer = 0; // 否则重置计时器
    }
    lastHeadRot = { x: headRotX, y: headRotY };

    // 3. 确定当前干扰强度 (多种触发条件)
    let currentIntensity = 0;

    // A. 粒子数量临界 (最高优先级，超过 6000 强制最大干扰)
    if (activeTotalCount > 6000) {
        currentIntensity = 1.0; // 满级破坏
        uiInfection.style.display = 'block';
        uiInfection.innerText = "CRITICAL OVERLOAD: >6000";
    }
    // B. 凝视深渊 (长时间凝视)
    else if (gazeTimer > 120) { // 约 2秒 (120帧)
        currentIntensity = Math.min((gazeTimer - 120) * 0.01, 1.0); // 逐渐增强
        uiInfection.style.display = 'block';
        uiInfection.innerText = "GAZE DETECTED";
    }
    // C. 默认轻微随机闪烁
    else {
        uiInfection.style.display = 'none';
    }

    // 将计算出的强度传递给干扰特效模块
    if (glitchEffect) glitchEffect.setIntensity(currentIntensity);
}

// 手部姿态检测：握拳 (用于消除粒子)
function isFist(landmarks) {
    const tips = [8, 12, 16, 20]; // 食指、中指、无名指、小指指尖
    const pips = [6, 10, 14, 18]; // 对应的关节 (PIP关节)
    let bentCount = 0; // 弯曲手指计数

    // 检查四指是否弯曲 (指尖Y坐标 > 关节Y坐标，表示弯向手掌)
    for (let i = 0; i < 4; i++) {
        if (landmarks[tips[i]] && landmarks[pips[i]] && landmarks[tips[i]].y > landmarks[pips[i]].y) bentCount++;
    }
    // 检查拇指是否弯曲 (简化：拇指尖离小指根部很近)
    const thumbTip = landmarks[4];
    const pinkyBase = landmarks[17];
    if (thumbTip && pinkyBase && Math.abs(thumbTip.x - pinkyBase.x) < 0.1) bentCount++;

    return bentCount >= 4; // 至少4根手指弯曲算握拳
}

// 手部姿态检测：伸开手指数量 (用于斥力场和重置手势)
function countFingers(landmarks) {
    let c = 0;
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    // 四指是否伸直
    for (let i = 0; i < 4; i++) {
        if (landmarks[tips[i]] && landmarks[pips[i]] && landmarks[tips[i]].y < landmarks[pips[i]].y) c++;
    }
    // 拇指伸直 (远离手掌)
    const thumbTip = landmarks[4];
    const pinkyBase = landmarks[17];
    if (thumbTip && pinkyBase && Math.abs(thumbTip.x - pinkyBase.x) > 0.15) c++;
    return c;
}

// 绘制手部骨骼连线和关节
function drawTechHand(landmarks) {
    canvasCtx.strokeStyle = "rgba(0, 255, 200, 0.4)"; // 连线颜色
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    for (let con of HAND_CONNECTIONS) {
        const s = landmarks[con[0]];
        const e = landmarks[con[1]];
        if (s && e) { // 安全检查
            canvasCtx.moveTo(s.x * canvasElement.width, s.y * canvasElement.height);
            canvasCtx.lineTo(e.x * canvasElement.width, e.y * canvasElement.height);
        }
    }
    canvasCtx.stroke();

    canvasCtx.strokeStyle = "#0ff"; // 关节颜色
    for (let pt of landmarks) {
        if (!pt) continue; // 安全检查
        const px = pt.x * canvasElement.width;
        const py = pt.y * canvasElement.height;
        // 绘制十字准星
        canvasCtx.beginPath();
        canvasCtx.moveTo(px - 2, py); canvasCtx.lineTo(px + 2, py);
        canvasCtx.moveTo(px, py - 2); canvasCtx.lineTo(px, py + 2);
        canvasCtx.stroke();
    }
}

// 检测重置手势 (左手2指 + 右手3指)
function checkResetGesture(handResults) {
    if (handResults.landmarks.length !== 2) return; // 必须检测到两只手

    // --- 修复点：安全读取 handedness ---
    let hand1Landmarks = handResults.landmarks[0];
    let hand2Landmarks = handResults.landmarks[1];

    let hand1Category = null;
    let hand2Category = null;

    if (handResults.handedness && handResults.handedness[0] && handResults.handedness[0][0]) {
        hand1Category = handResults.handedness[0][0].categoryName;
    }
    if (handResults.handedness && handResults.handedness[1] && handResults.handedness[1][0]) {
        hand2Category = handResults.handedness[1][0].categoryName;
    }

    if (!hand1Category || !hand2Category) return; // 如果无法识别左右手，跳过

    // 确定哪只手是“用户左手”，哪只手是“用户右手”
    // 在镜像模式下，MediaPipe Label "Right" 对应用户真实的左手
    // MediaPipe Label "Left" 对应用户真实的右手
    let userLeftHandLandmarks = null;
    let userRightHandLandmarks = null;

    if (hand1Category === "Right") userLeftHandLandmarks = hand1Landmarks;
    else if (hand1Category === "Left") userRightHandLandmarks = hand1Landmarks;

    if (hand2Category === "Right") userLeftHandLandmarks = hand2Landmarks;
    else if (hand2Category === "Left") userRightHandLandmarks = hand2Landmarks;

    if (!userLeftHandLandmarks || !userRightHandLandmarks) return; // 确保识别到左右手

    const userLeftFingerCount = countFingers(userLeftHandLandmarks);
    const userRightFingerCount = countFingers(userRightHandLandmarks);

    // 重置条件：用户左手2指 + 用户右手3指 (或反之)
    if ((userLeftFingerCount === 2 && userRightFingerCount === 3) ||
        (userLeftFingerCount === 3 && userRightFingerCount === 2)) {

        initGrid(); // 重置物理网格
        particles = []; // 清空动态粒子
        playResetSfx(); // 播放重置音效
        canvasCtx.fillStyle = "#fff"; // 屏幕闪白
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        if (glitchEffect) glitchEffect.reset(); // 重置干扰特效 (清除永久坏点)
    }
}

// ==============================================================================
// 🚀 系统初始化流程 (加载模型、启动摄像头)
// ==============================================================================
// 在屏幕上显示错误信息
function showError(msg) {
    const text = document.querySelector('.glitch');
    const bar = document.querySelector('.loader-bar');
    if (bar) bar.style.display = 'none'; // 隐藏进度条
    if (text) {
        text.innerText = "ERROR";
        text.style.color = "var(--neon-red)";
        console.error(msg);

        // 显示详细错误信息
        const div = document.createElement('div');
        div.innerText = msg;
        div.style.color = "var(--neon-red)";
        div.style.fontSize = "16px";
        div.style.marginTop = "10px";
        div.style.maxWidth = "80%";
        div.style.wordWrap = "break-word";
        document.getElementById('loading').appendChild(div);
    }
}

async function initAIModels() {
    try {
        loadingLog.innerText = "Connecting to CDN...";

        // 1. 加载 WASM (使用 jsDelivr 稳定源 v0.10.0)
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );

        loadingLog.innerText = "Loading AI Models (CPU Mode)...";

        // 2. 加载模型 (Hand Landmarker 和 Face Landmarker)
        [handLandmarker, faceLandmarker] = await Promise.all([
            HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "CPU" // 强制使用 CPU，提高兼容性
                },
                runningMode: "VIDEO",
                numHands: 2 // 检测两只手
            }),
            FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "CPU" // 强制使用 CPU
                },
                runningMode: "VIDEO",
                numFaces: 1 // 检测一张脸
            })
        ]);

        loadingLog.innerText = "Starting Camera Stream...";
        startCamera();

    } catch (e) {
        showError("AI Model Load Failed: " + e.message);
    }
}

function startCamera() {
    // 检查浏览器是否支持摄像头API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError("Webcam API is not supported by your browser.");
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", () => {
                // 确保 Canvas 尺寸与视频匹配
                canvasElement.width = video.videoWidth;
                canvasElement.height = video.videoHeight;
                initGrid(); // 初始化物理网格

                // 初始化干扰特效模块
                glitchEffect = new DigitalInterference(canvasElement.width, canvasElement.height);

                // 隐藏加载屏幕，显示开始交互按钮
                loadingScreen.style.display = 'none';
                startOverlay.style.display = 'flex';

                // 点击开始按钮后启动音频和渲染循环
                document.querySelector('.start-btn').addEventListener('click', () => {
                    initAudio(); // 启动音频
                    startOverlay.style.display = 'none';
                    renderLoop(); // 启动主渲染循环
                });
            });
        })
        .catch((err) => {
            showError("Camera Access Denied: " + err.message + ". Please allow webcam access in your browser settings.");
        });
}

// ==============================================================================
// 🔁 主渲染循环 (程序的“心跳”)
// ==============================================================================
async function renderLoop() {
    frameCount++; // 增加帧计数
    const now = performance.now(); // 获取当前时间戳

    // 握拳冷却计时
    if (fistCooldown > 0) fistCooldown--;

    // 确保视频帧有更新才进行AI检测和绘制
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;

        // 执行AI检测
        const handResults = handLandmarker.detectForVideo(video, now);
        const faceResults = faceLandmarker.detectForVideo(video, now);

        // 清空画布 (透明)
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // 1. 背景干扰特效 (最底层，在所有粒子和UI之下绘制)
        if (glitchEffect) {
            glitchEffect.update();
            glitchEffect.draw(canvasCtx, video);
        }

        // 2. 面部逻辑 (计算头部倾斜和凝视，不绘制任何东西)
        gravityBias = 0; // 重置重力偏向
        if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
            updateFaceLogic(faceResults.faceLandmarks[0]);
        } else {
            // 没有检测到人脸时，重置凝视计时和干扰强度
            gazeTimer = 0;
            if (activeTotalCount <= 6000 && glitchEffect) glitchEffect.setIntensity(0);
        }
        uiGravity.innerText = gravityBias.toFixed(2); // 更新HUD

        // 3. 手部逻辑 (检测手势、生成粒子、斥力场)
        repulsors = []; // 清空斥力场列表
        if (handResults.landmarks && handResults.landmarks.length > 0) {
            checkResetGesture(handResults); // 检测双手重置手势

            for (let i = 0; i < handResults.landmarks.length; i++) {
                const landmarks = handResults.landmarks[i];

                // --- 修复点：安全读取 handedness ---
                let isUserLeftHand = false;
                if (handResults.handedness && handResults.handedness[i] && handResults.handedness[i][0]) {
                    const category = handResults.handedness[i][0].categoryName;
                    // 在镜像模式下：MediaPipe Label "Right" 对应用户真实的左手
                    isUserLeftHand = (category === "Right");
                }

                drawTechHand(landmarks); // 绘制手部骨骼连线和关节

                // A. 左手握拳 -> 湮灭粒子
                if (isUserLeftHand && isFist(landmarks)) {
                    if (fistCooldown === 0) { // 冷却期内不重复触发
                        purgeParticles(1000); // 消除1000个粒子
                        fistCooldown = 30; // 设置冷却时间 (约0.5秒)

                        // 视觉反馈：在手掌位置画一个红色光圈
                        const palmX = landmarks[9].x * canvasElement.width;
                        const palmY = landmarks[9].y * canvasElement.height;
                        canvasCtx.fillStyle = "rgba(255, 0, 0, 0.5)";
                        canvasCtx.beginPath();
                        canvasCtx.arc(palmX, palmY, 100, 0, Math.PI * 2);
                        canvasCtx.fill();
                    }
                }

                // B. 原力斥力 (五指张开)
                if (countFingers(landmarks) === 5) {
                    // 计算手掌中心作为斥力源
                    const palmX = (landmarks[0].x + landmarks[9].x) / 2 * canvasElement.width;
                    const palmY = (landmarks[0].y + landmarks[9].y) / 2 * canvasElement.height;
                    repulsors.push({ x: palmX, y: palmY });

                    // 绘制斥力圈视觉反馈
                    canvasCtx.beginPath(); canvasCtx.arc(palmX, palmY, 80, 0, Math.PI * 2);
                    canvasCtx.strokeStyle = "rgba(255,255,255,0.5)"; canvasCtx.setLineDash([4, 4]); // 虚线
                    canvasCtx.stroke(); canvasCtx.setLineDash([]); // 恢复实线
                }

                // C. 粒子生成 (食指和拇指捏合)
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                const d = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                if (d < 0.1) { // 捏合阈值
                    const px = indexTip.x * canvasElement.width;
                    const py = indexTip.y * canvasElement.height;
                    for (let k = 0; k < 4; k++) { // 每次捏合生成4个粒子
                        particles.push(new Particle(px + (Math.random() - 0.5) * 30, py));
                    }
                }
            }
        }

        // 4. 物理世界更新与绘制 (粒子堆积)
        updatePhysics();
        canvasCtx.font = "10px monospace";
        canvasCtx.shadowBlur = 0; // 重置阴影
        for (let i = 0; i < grid.length; i++) {
            if (grid[i]) grid[i].draw(canvasCtx);
        }
        for (let p of particles) p.draw(canvasCtx);
    }

    // 请求下一帧动画
    requestAnimationFrame(renderLoop);
}

// ==============================================================================
// 🚀 启动应用程序
// ==============================================================================
initAIModels(); // 从AI模型加载开始

