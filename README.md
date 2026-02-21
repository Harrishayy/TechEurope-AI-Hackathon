# FOV — Field of View

> AI-powered visual intelligence overlay and hands-on coaching system for frontline training.  
> Hackathon submission for **TechEurope London AI Hackathon** | February 2026

FOV combines live camera feeds with AI to identify equipment, generate step-by-step procedures (SOPs), and guide users through physical workflows in real time — a "mentor in your pocket" for baristas, electricians, and other hands-on roles.

---

## Table of Contents

- [FOV — Field of View](#fov--field-of-view)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Quick Start](#quick-start)
  - [Installation \& Setup](#installation--setup)
    - [Prerequisites](#prerequisites)
    - [Step 1: Install Dependencies](#step-1-install-dependencies)
    - [Step 2: Environment Configuration](#step-2-environment-configuration)
    - [Step 3: Run the Application](#step-3-run-the-application)
    - [Step 4: Verify Setup](#step-4-verify-setup)
  - [Architecture Overview](#architecture-overview)
  - [APIs, Frameworks \& Tools](#apis-frameworks--tools)
    - [AI / ML](#ai--ml)
    - [Frontend](#frontend)
    - [Browser APIs](#browser-apis)
    - [Third-Party Scripts (CDN)](#third-party-scripts-cdn)
    - [Backend](#backend)
  - [API Reference](#api-reference)
    - [Health Check](#health-check)
    - [SOP Generation (Server-Side, Dust)](#sop-generation-server-side-dust)
  - [Project Structure](#project-structure)
  - [Environment Variables](#environment-variables)
  - [Technical Documentation for Jury](#technical-documentation-for-jury)
    - [AI Integration](#ai-integration)
    - [SOP Schema](#sop-schema)

---

## Features

| Feature | Description |
|--------|-------------|
| **Create SOP** | Generate structured procedures from text, video upload, or live camera recording |
| **AI Coaching** | Point camera at equipment → FOV identifies context and guides you step-by-step |
| **Voice Commands** | Hands-free control: "skip", "done", "pause", "resume", "reset" |
| **Hand Tracking** | MediaPipe overlay shows hand skeleton and bounding box |
| **Tactical HUD** | Optional Iron Man–style heads-up display overlay demo |

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd TechEurope-AI-Hackathon
npm install

# 2. Configure API key (required for coaching & SOP generation)
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 3. Start the server
npm run dev
```

Then open:

- **[http://localhost:8080](http://localhost:8080)** — Landing page
- **[http://localhost:8080/extract.html](http://localhost:8080/extract.html)** — Create SOP from text/video/live recording
- **[http://localhost:8080/coach.html](http://localhost:8080/coach.html)** — AI coaching (camera required)
- **[http://localhost:8080/hud.html](http://localhost:8080/hud.html)** — Tactical HUD demo

For mobile testing on the same Wi‑Fi: `http://<your-local-ip>:8080`

---

## Installation & Setup

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (included with Node.js)
- Modern browser with camera access (Chrome, Safari, Edge)
- Optional: HTTPS for device sensors (Geolocation, DeviceOrientation) on mobile

### Step 1: Install Dependencies

```bash
npm install
```

The project has minimal dependencies — `package.json` lists no runtime packages; only Node.js built-ins are used.

### Step 2: Environment Configuration

Create a `.env` file in the project root:

```bash
# Required for AI features
GEMINI_API_KEY=your_google_gemini_api_key

# Optional: Dust API for server-side SOP generation (alternative to client-side Gemini)
# DUST_WORKSPACE_ID=your_dust_workspace_id
# DUST_API_KEY=your_dust_api_key
# DUST_AGENT_ID=your_dust_agent_id

# Optional: server port (default 8080)
# PORT=8080

# Optional: debug Dust API calls
# DEBUG_DUST=1
```

**Getting a Gemini API key:**

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key
3. Add it to `.env` as `GEMINI_API_KEY`

**Client-side config (fallback):** If `.env` is not used, the app reads `skilllens_api_key` from `localStorage`. You can set this via `js/config.js` for development.

### Step 3: Run the Application

```bash
npm run dev
```

This starts the backend server on port 8080 and serves all static assets.

**Optional: run frontend proxy** (for API proxying when frontend runs on different port):

```bash
npm run dev:frontend   # Runs on 8081, proxies /api/* to backend
```

### Step 4: Verify Setup

1. Open `http://localhost:8080`
2. Click **Start Coaching** — you should be prompted for camera access
3. Click **Create SOP** — paste sample text and click **Generate SOP**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                          │
├─────────────────────────────────────────────────────────────────┤
│  index.html    extract.html    coach.html    hud.html             │
│  (Landing)     (SOP Create)    (Coaching)    (HUD Demo)           │
│                                                                   │
│  js/gemini.js ──────────────► Google Gemini API (REST + Live WS)  │
│  js/sop/extract.js ─────────► SOP generation (text/images)       │
│  js/coaching/coach.js ──────► Frame analysis, voice, tracking   │
│  js/coaching/tracker.js ────► MediaPipe Hands (CDN)              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ HTTP /api/*
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js HTTP Server (server.js)               │
├─────────────────────────────────────────────────────────────────┤
│  • Static file serving (HTML, JS, CSS, SVG)                     │
│  • POST /api/sop/generate ──► Dust API (when configured)        │
│  • GET  /api/health ────────► Health check + config status       │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. **SOP Creation:** User provides text/video/live frames → Gemini (or Dust) extracts structured steps → JSON SOP stored in memory / localStorage.
2. **Coaching:** Camera frames captured periodically → Gemini analyzes against current SOP step → returns detected step + next instruction → displayed in HUD overlay.
3. **Voice:** Microphone → Gemini Live API (or Web Speech + Gemini REST fallback) → command classification → triggers skip/done/pause/resume/reset.

---

## APIs, Frameworks & Tools

### AI / ML

| Component | Purpose |
|-----------|---------|
| **Google Gemini API** | Text generation, image analysis, audio classification. Models: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-1.5-flash` (with automatic fallback). |
| **Gemini Live API** | WebSocket-based real-time voice command recognition (`gemini-2.5-flash-native-audio-preview`, `gemini-2.0-flash-live-001`). |
| **Dust (dust.tt)** | Optional server-side SOP generation via Dust Assistant API. Used when `DUST_*` env vars are set. |

### Frontend

| Component | Purpose |
|-----------|---------|
| **Vanilla JS** | No framework; plain HTML/CSS/JS for landing, extract, and coach pages. |
| **Tailwind CSS** | Utility-first CSS for HUD page (`hud.html`). Loaded via CDN with custom theme (colors, animations). |
| **CSS (style.css)** | Custom styles for extract, coach, and shared components. |
| **Google Fonts** | Orbitron (display), Share Tech Mono (monospace). |

### Browser APIs

| API | Usage |
|-----|-------|
| **MediaDevices.getUserMedia** | Camera stream for coaching and HUD. |
| **MediaRecorder** | Live recording for SOP generation from camera. |
| **Canvas 2D** | Frame capture, hand-tracking overlay. |
| **Geolocation API** | GPS coordinates in HUD. |
| **DeviceOrientation** | Compass heading on mobile. |
| **Web Speech API** | Fallback voice transcription when Gemini Live is unavailable. |
| **localStorage** | API key and account ID persistence. |

### Third-Party Scripts (CDN)

| Library | URL | Purpose |
|---------|-----|---------|
| MediaPipe Hands | `@mediapipe/hands` | Hand landmark detection and skeleton overlay. |
| MediaPipe Drawing Utils | `@mediapipe/drawing_utils` | Drawing connectors and landmarks. |
| Tailwind CSS | `cdn.tailwindcss.com` | HUD styling. |

### Backend

| Component | Purpose |
|-----------|---------|
| **Node.js** | Runtime. |
| **http** (built-in) | HTTP server, no Express. |
| **fs**, **path**, **crypto** | File serving, env loading, trace IDs. |

---

## API Reference

### Health Check

```
GET /api/health
```

**Response:**

```json
{
  "ok": true,
  "dustConfigured": false
}
```

### SOP Generation (Server-Side, Dust)

```
POST /api/sop/generate
Content-Type: application/json
```

**Request body:**

```json
{
  "mode": "text",
  "text": "Training content or procedure text...",
  "context": "Optional role, tooling, or safety context.",
  "accountId": "default",
  "frames": []
}
```

- **mode:** `"text"` | `"video"` | `"live"`
- **text:** Required for `mode: "text"`. Training content.
- **frames:** Base64-encoded JPEG strings for `mode: "video"` or `mode: "live"` (up to 6 used).

**Response (success):**

```json
{
  "ok": true,
  "accountId": "default",
  "sop": {
    "title": "Procedure name",
    "role": "job role",
    "steps": [
      {
        "step": 1,
        "action": "Action description",
        "look_for": "Visual cue",
        "common_mistakes": "Common error"
      }
    ]
  },
  "traceId": "abc123"
}
```

**Response (error):**

```json
{
  "error": "Error message",
  "traceId": "abc123"
}
```

**Note:** This endpoint requires `DUST_WORKSPACE_ID`, `DUST_API_KEY`, and `DUST_AGENT_ID` to be configured. If not set, the client falls back to direct Gemini calls from the browser.

---

## Project Structure

```
TechEurope-AI-Hackathon/
├── index.html              # Landing page (Create SOP / Start Coaching)
├── extract.html            # SOP creation (text, video, live modes)
├── coach.html              # AI coaching with camera + voice
├── hud.html                # Tactical HUD demo (TACNET)
├── favicon.svg
├── package.json
├── server.js               # Main HTTP server (static + /api/sop/generate)
├── frontend-server.js      # Optional frontend proxy
├── .env                    # Environment variables (create from .env.example)
├── .env.example            # Template for .env
│
├── css/
│   └── style.css           # Shared styles (extract, coach)
│
├── js/
│   ├── config.js           # Client config (API key, account ID)
│   ├── index.js            # Landing page logic
│   ├── gemini.js           # Gemini API client (text, images, audio)
│   ├── sop/
│   │   ├── extract.js      # SOP generation logic (Gemini + Dust fallback)
│   │   └── sop-barista.js  # Built-in barista demo SOP
│   └── coaching/
│       ├── coach.js        # Two-phase coaching engine (Identify → Track)
│       └── tracker.js      # MediaPipe hand tracking overlay
│
├── baseui/                 # Shared UI components (TSX, optional)
│   ├── Index.tsx
│   ├── LiveRecorder.tsx
│   ├── MessageBanner.tsx
│   ├── SOPPreview.tsx
│   └── ...
│
├── docs/
│   └── plans/              # Design and planning notes
│
├── PRD.md                  # Product Requirements Document
└── README.md               # This file
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes (for AI) | — | Google Gemini API key. |
| `DUST_WORKSPACE_ID` | No | — | Dust workspace for server-side SOP. |
| `DUST_API_KEY` | No | — | Dust API key. |
| `DUST_AGENT_ID` | No | — | Dust agent configuration ID. |
| `DUST_BASE_URL` | No | `https://dust.tt` | Dust API base URL. |
| `PORT` | No | `8080` | Server listen port. |
| `DEBUG_DUST` | No | `1` | Set to `0` to disable Dust API logging. |
| `FRONTEND_PORT` | No | `8081` | Port for `npm run dev:frontend`. |
| `BACKEND_ORIGIN` | No | `http://localhost:8080` | Backend URL for frontend proxy. |

---

## Technical Documentation for Jury

### AI Integration

1. **Gemini REST API** (`js/gemini.js`):
   - `generateText(systemPrompt, userMessage, options)` — SOP extraction, voice classification.
   - `analyzeImage(systemPrompt, userMessage, imageBase64)` — Single-frame analysis.
   - `analyzeImages(systemPrompt, userMessage, imagesBase64)` — Multi-frame SOP generation.
   - `analyzeAudio(prompt, audioBase64, mimeType)` — Audio command detection.
   - Model fallback: tries `gemini-2.5-flash`, then `gemini-2.5-flash-lite`, then `gemini-1.5-flash` on 404/400/403.

2. **Gemini Live API** (`js/coaching/coach.js`):
   - WebSocket: `wss://generativelanguage.googleapis.com/ws/...BidiGenerateContent`
   - Streams PCM audio (16 kHz mono) for real-time voice commands.
   - Fallback: Web Speech API + Gemini REST when Live fails or is unsupported.

3. **Coaching Pipeline** (`js/coaching/coach.js`):
   - **Phase 1 (Identify):** Send frame + SOP context → Gemini returns object type and suggested starting step.
   - **Phase 2 (Track):** Periodic frame analysis (2.5 s interval) against current step → next instruction or step advance.
   - Exponential backoff on errors (up to 2 min).
   - Hand tracker (MediaPipe) runs independently at ~30 fps.

### SOP Schema

```json
{
  "title": "string",
  "role": "string",
  "steps": [
    {
      "step": 1,
      "action": "string",
      "look_for": "string",
      "common_mistakes": "string"
    }
  ]
}
```


---

*Built at TechEurope London AI Hackathon | February 2026*
