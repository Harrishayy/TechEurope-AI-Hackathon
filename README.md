# SkillLens

> Hackathon submission for TechEurope London Hackathon

**AI coaching for physical work. Learn by doing, with a mentor in your pocket.**

SkillLens is a mobile-first AI coaching layer that watches what you're doing through your phone camera and tells you what to do next, in real time. Point your phone at a coffee machine, a boiler, or any equipment — SkillLens identifies where you are in the workflow and delivers the next instruction as a clean overlay.

## Quick Start (< 5 minutes)

### 1. Get a Gemini API Key

Go to [Google AI Studio](https://aistudio.google.com/apikey) and create a free API key.

### 2. Serve the App

Any static file server works. The simplest options:

```bash
# Option A: Python
cd skilllens
python3 -m http.server 8000

# Option B: Node
npx serve .

# Option C: VS Code Live Server extension
# Just right-click index.html → Open with Live Server
```

### 3. Open on Your Phone

Open `http://<your-local-ip>:8000` on your phone's browser (same Wi-Fi network).

Or deploy to Vercel / GitHub Pages for a public URL — see Deployment below.

### 4. Enter Your API Key

Paste your Gemini key on the home screen and tap **Save**.

### 5. Start Coaching

- **Quick Demo**: Tap "Quick Demo — Barista" to try with a pre-built espresso SOP
- **Custom SOP**: Tap "Create SOP", paste any training content, and generate a custom procedure

Point your camera at the relevant equipment and follow the live instructions.

## How It Works

1. Browser captures a video frame every 2 seconds via `getUserMedia`
2. Frame is converted to base64 JPEG
3. Frame + SOP context is sent to Gemini 2.0 Flash (multimodal)
4. Gemini identifies the current step and returns the next instruction
5. Instruction renders as an overlay on the live camera feed

## Features

- **Live Vision Coaching** — Real-time AI analysis of camera frames matched against SOP steps
- **SOP Generation** — Paste any training text and AI generates a structured procedure
- **Manual Step Advance** — "Next Step" button as a safety net if AI misreads the scene
- **Mobile-First UI** — Full-screen camera with semi-transparent overlay, designed for one-handed use
- **Zero Install** — Runs entirely in the mobile browser, no app download needed

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML / CSS / JS |
| Camera | `getUserMedia` API |
| AI Vision | Gemini 2.0 Flash (multimodal) |
| SOP Extraction | Gemini 2.0 Flash (text) |

## Deployment

### Vercel

```bash
npm i -g vercel
cd skilllens
vercel
```

### GitHub Pages

Push the repo to GitHub, go to Settings → Pages → set source to root of `main` branch.

## Project Structure

```
skilllens/
├── index.html          # Landing page — API key setup + navigation
├── extract.html        # SOP extraction — paste content, generate procedure
├── coach.html          # Live coaching — camera feed + AI overlay
├── css/
│   └── style.css       # All styles — dark theme, mobile-first
├── js/
│   ├── gemini.js       # Gemini API wrapper (text + multimodal)
│   ├── index.js        # Landing page logic
│   ├── extract.js      # SOP generation logic
│   ├── coach.js        # Live coaching engine
│   └── sop-barista.js  # Default barista SOP for demo
├── demo/               # Demo video goes here
└── README.md
```

## Demo

The demo showcases barista onboarding — a trainee making espresso guided by SkillLens in real time.

**To record the demo:**
1. Open the app on your phone pointing at an espresso machine
2. Start a screen recording (built into iOS/Android)
3. Walk through the espresso workflow — the overlay updates as you progress
4. Save the recording to the `/demo` folder

---

*Built at Hackathon | February 2026*
>>>>>>> 5068fc6 (Initial build of SkillLens — AI coaching for physical work)
