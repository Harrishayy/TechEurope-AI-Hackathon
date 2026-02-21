// SkillLens — MediaPipe Hand Tracking Overlay
//
// Draws a green hand skeleton + bounding box over the camera feed.
// Runs at requestAnimationFrame speed (~30 fps), independent of Gemini.

class HandTracker {
  constructor(videoEl, overlayCanvas) {
    this.video   = videoEl;
    this.overlay = overlayCanvas;
    this.ctx     = overlayCanvas.getContext('2d');

    this.hands     = null;   // MediaPipe Hands instance
    this.isRunning = false;

    this._smoothedLandmarks = new Map(); // per-hand EMA state
    this._rafId = null;
  }

  // ── Public API ────────────────────────────────────────────────

  async init() {
    await this._initHands();
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
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    console.log('[Tracker] Stopped.');
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
      this.hands.onResults((r) => this._draw(r));
      console.log('[Tracker] MediaPipe Hands ready.');
    } catch (e) {
      console.warn('[Tracker] Hands init failed:', e);
      this.hands = null;
    }
  }

  // ── Main Loop ─────────────────────────────────────────────────

  async _loop(_timestamp) {
    if (!this.isRunning) return;

    try {
      if (this.video.readyState >= 2 && this.hands) {
        await this.hands.send({ image: this.video });
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

    if (handsResults && handsResults.multiHandLandmarks && handsResults.multiHandLandmarks.length > 0) {
      for (let i = 0; i < handsResults.multiHandLandmarks.length; i++) {
        const smoothed = this._smooth(i, handsResults.multiHandLandmarks[i]);
        this._drawHand(smoothed, w, h);
      }
    }
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
}
