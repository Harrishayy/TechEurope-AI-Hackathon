// SkillLens — MediaPipe Hand Tracking + Object Detection Overlay
//
// Two visual layers, both running at requestAnimationFrame speed (~30 fps):
//   Green  → MediaPipe Hands  (legacy @mediapipe/hands CDN)
//   Amber  → MediaPipe Object Detector (tasks-vision, EfficientDet-Lite0)
//
// Gemini passes one hint: the COCO class name of the SOP object (e.g. "cup").
// The Object Detector uses that to highlight the right detection in amber.
// Without a class hint it still shows all detections (dimly) — fully standalone.
//
// Gemini's 2.5 s coaching loop is NEVER blocked or touched by this file.

class HandTracker {
  constructor(videoEl, overlayCanvas) {
    this.video   = videoEl;
    this.overlay = overlayCanvas;
    this.ctx     = overlayCanvas.getContext('2d');

    this.hands          = null;   // MediaPipe Hands instance
    this.objectDetector = null;   // MediaPipe Object Detector instance
    this.isRunning      = false;

    this.currentStep  = null;  // { action, look_for } — set by coach.js on step change
    this._targetClass = null;  // COCO class hint from Gemini (e.g. "cup", "bottle")

    this._lastDetections = null; // latest ObjectDetector results
    this._lastTimestamp  = 0;    // must be strictly increasing for detectForVideo

    this._smoothedLandmarks = new Map(); // per-hand EMA state
    this._rafId = null;
  }

  // ── Public API ────────────────────────────────────────────────

  async init() {
    await Promise.all([
      this._initHands(),
      this._initObjectDetector()
    ]);
    this._syncSize();
    window.addEventListener('resize', () => this._syncSize());
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
    console.log('[Tracker] Started.');
  }

  stop() {
    this.isRunning = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._smoothedLandmarks.clear();
    this._lastDetections = null;
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    console.log('[Tracker] Stopped.');
  }

  // Called by coach.js when Gemini advances a step.
  setCurrentStep(step) {
    this.currentStep = step || null;
  }

  // Called by coach.js after Gemini identifies the object.
  // className should be the COCO class Gemini recommends (e.g. "cup").
  setTargetClass(className) {
    this._targetClass = className ? className.toLowerCase().trim() : null;
    console.log('[Tracker] Target class:', this._targetClass);
  }

  // ── Initialisation ────────────────────────────────────────────

  async _initHands() {
    if (typeof Hands === 'undefined') {
      console.warn('[Tracker] MediaPipe Hands CDN not loaded — hand overlay disabled.');
      return;
    }
    try {
      this.hands = new Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
      });
      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      // onResults drives the main draw call each frame
      this.hands.onResults((r) => this._draw(r));
      console.log('[Tracker] MediaPipe Hands ready.');
    } catch (e) {
      console.warn('[Tracker] Hands init failed:', e);
      this.hands = null;
    }
  }

  async _initObjectDetector() {
    try {
      // Load tasks-vision bundle as an ES module (no extra <script> tag needed)
      const vision = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js'
      );
      const { ObjectDetector, FilesetResolver } = vision;

      const wasm = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      this.objectDetector = await ObjectDetector.createFromOptions(wasm, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/object_detector/' +
            'efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
          delegate: 'GPU'
        },
        scoreThreshold: 0.45,
        runningMode: 'VIDEO'
      });
      console.log('[Tracker] MediaPipe Object Detector ready.');
    } catch (e) {
      console.warn('[Tracker] Object Detector init failed:', e);
      this.objectDetector = null;
    }
  }

  // ── Main Loop ─────────────────────────────────────────────────

  async _loop(timestamp) {
    if (!this.isRunning) return;

    try {
      if (this.video.readyState >= 2) {
        // detectForVideo requires a strictly-increasing timestamp
        const ts = Math.max(timestamp, this._lastTimestamp + 1);
        this._lastTimestamp = ts;

        // Object detection — synchronous in VIDEO mode, result available immediately
        if (this.objectDetector) {
          this._lastDetections = this.objectDetector.detectForVideo(this.video, ts);
        }

        // Hand detection — async; fires onResults → _draw when done
        if (this.hands) {
          await this.hands.send({ image: this.video });
        } else {
          // No Hands model but still need to repaint (object detector only)
          this._draw(null);
        }
      }
    } catch (e) {
      console.warn('[Tracker] Frame error:', e);
    }

    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
  }

  // ── Draw ──────────────────────────────────────────────────────

  _draw(handsResults) {
    const ctx = this.ctx;
    const w   = this.overlay.width;
    const h   = this.overlay.height;

    ctx.clearRect(0, 0, w, h);

    // Layer 1 (bottom): object detections from MediaPipe Object Detector
    this._drawDetections(w, h);

    // Layer 2 (top): hand skeleton from MediaPipe Hands
    if (handsResults && handsResults.multiHandLandmarks && handsResults.multiHandLandmarks.length > 0) {
      for (let i = 0; i < handsResults.multiHandLandmarks.length; i++) {
        const smoothed = this._smooth(i, handsResults.multiHandLandmarks[i]);
        this._drawHand(smoothed, w, h);
      }
    }
  }

  // Draw all ObjectDetector results for this frame.
  _drawDetections(w, h) {
    if (!this._lastDetections || !this._lastDetections.detections) return;

    const transform = this._videoTransform(w, h);

    for (const det of this._lastDetections.detections) {
      const isTarget = this._matchesTarget(det);
      const mapped   = this._mapBbox(det.boundingBox, transform);
      const label    = det.categories[0]?.categoryName || '';
      const score    = det.categories[0]?.score        || 0;

      if (isTarget) {
        // Highlighted amber box — this is the object Gemini told us to track
        this._drawBox(mapped, `${label} ${Math.round(score * 100)}%`, '#fbbf24', 22, 2.5, true);
      } else if (!this._targetClass) {
        // No class hint yet — show everything dimly so the user can see what's detected
        this._drawBox(mapped, label, 'rgba(255,255,255,0.35)', 0, 1.5, false);
      }
      // If _targetClass is set but this isn't it, skip — reduces visual clutter
    }
  }

  // Draws a detection box with corner accents, a label pill, and optionally a step annotation.
  _drawBox(mapped, labelText, color, glowBlur, lineWidth, showStepAnnotation) {
    const ctx        = this.ctx;
    const { x, y, w, h } = mapped;
    const CL         = 14; // corner accent length

    // Glow rect
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = glowBlur;
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // Corner L-accents
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth + 0.5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x,         y + CL);    ctx.lineTo(x,         y);    ctx.lineTo(x + CL,     y);
    ctx.moveTo(x + w - CL, y);       ctx.lineTo(x + w,     y);    ctx.lineTo(x + w,       y + CL);
    ctx.moveTo(x + w,   y + h - CL); ctx.lineTo(x + w,   y + h); ctx.lineTo(x + w - CL, y + h);
    ctx.moveTo(x + CL,   y + h);     ctx.lineTo(x,       y + h); ctx.lineTo(x,         y + h - CL);
    ctx.stroke();
    ctx.restore();

    // Object label above the box
    if (labelText) {
      this._drawPill(x + w / 2, y - 4, labelText, 36, 'rgba(0,0,0,0.72)', color, color);
    }

    // Step look_for annotation below the box (amber target only)
    if (showStepAnnotation && this.currentStep && this.currentStep.look_for) {
      // bottomY = top-of-pill, so add pillH (≈25) so top of pill lands at y+h+4
      this._drawPill(x + w / 2, y + h + 29, this.currentStep.look_for, 44,
        'rgba(0,0,0,0.65)', 'rgba(251,191,36,0.5)', '#fff');
    }
  }

  // Returns true if this detection matches the Gemini-provided target class.
  _matchesTarget(det) {
    if (!this._targetClass) return false;
    const t = this._targetClass;
    return det.categories.some((c) => {
      const n = c.categoryName.toLowerCase();
      return n.includes(t) || t.includes(n);
    });
  }

  // Compute object-fit:cover scale + offset to map video coords → canvas coords.
  _videoTransform(cw, ch) {
    const vw = this.video.videoWidth  || cw;
    const vh = this.video.videoHeight || ch;
    const scale = Math.max(cw / vw, ch / vh);
    return { scale, offsetX: (cw - vw * scale) / 2, offsetY: (ch - vh * scale) / 2 };
  }

  _mapBbox(bb, { scale, offsetX, offsetY }) {
    return {
      x: bb.originX * scale + offsetX,
      y: bb.originY * scale + offsetY,
      w: bb.width   * scale,
      h: bb.height  * scale
    };
  }

  // ── Hand Drawing ─────────────────────────────────────────────

  // EMA smoothing: 70% current + 30% previous — eliminates jitter on fast movement.
  _smooth(idx, landmarks) {
    const ALPHA = 0.7;
    const prev  = this._smoothedLandmarks.get(idx);
    if (!prev) {
      this._smoothedLandmarks.set(idx, landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z })));
      return landmarks;
    }
    const s = landmarks.map((l, j) => ({
      x: ALPHA * l.x + (1 - ALPHA) * prev[j].x,
      y: ALPHA * l.y + (1 - ALPHA) * prev[j].y,
      z: ALPHA * l.z + (1 - ALPHA) * prev[j].z
    }));
    this._smoothedLandmarks.set(idx, s);
    return s;
  }

  _drawHand(landmarks, w, h) {
    const ctx = this.ctx;

    if (typeof drawConnectors === 'function') {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00e5a0', lineWidth: 2 });
    }
    if (typeof drawLandmarks === 'function') {
      drawLandmarks(ctx, landmarks, {
        color: '#00e5a0', fillColor: 'rgba(0,229,160,0.3)', radius: 4, lineWidth: 1
      });
    }

    // Bounding box around the hand
    const xs  = landmarks.map((l) => l.x * w);
    const ys  = landmarks.map((l) => l.y * h);
    const pad = 16;
    const bx  = Math.max(0, Math.min(...xs) - pad);
    const by  = Math.max(0, Math.min(...ys) - pad);
    const bw  = Math.min(w - bx, Math.max(...xs) - Math.min(...xs) + pad * 2);
    const bh  = Math.min(h - by, Math.max(...ys) - Math.min(...ys) + pad * 2);

    ctx.save();
    ctx.shadowColor = '#00e5a0';
    ctx.shadowBlur  = 16;
    ctx.strokeStyle = '#00e5a0';
    ctx.lineWidth   = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.restore();
  }

  // ── Helpers ───────────────────────────────────────────────────

  _syncSize() {
    const w = this.video.clientWidth  || window.innerWidth;
    const h = this.video.clientHeight || window.innerHeight;
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width  = w;
      this.overlay.height = h;
    }
  }

  // Pill label. bottomY = y coordinate where the pill's bottom edge sits.
  _drawPill(cx, bottomY, rawText, maxChars, bg, border, textColor) {
    const ctx  = this.ctx;
    const text = rawText.length > maxChars ? rawText.slice(0, maxChars - 1) + '…' : rawText;
    const fs   = 13;
    const padX = 10;
    const padY = 6;

    ctx.font = `${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const pillW = ctx.measureText(text).width + padX * 2;
    const pillH = fs + padY * 2;

    let px = cx - pillW / 2;
    let py = bottomY - pillH;
    px = Math.max(4, Math.min(this.overlay.width  - pillW - 4, px));
    py = Math.max(4, Math.min(this.overlay.height - pillH - 4, py));

    ctx.save();
    ctx.fillStyle = bg;
    this._roundRect(ctx, px, py, pillW, pillH, 6);
    ctx.fill();
    ctx.strokeStyle  = border;
    ctx.lineWidth    = 1;
    this._roundRect(ctx, px, py, pillW, pillH, 6);
    ctx.stroke();
    ctx.fillStyle    = textColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px + padX, py + pillH / 2);
    ctx.restore();
  }

  // Safari < 16 polyfill
  _roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
