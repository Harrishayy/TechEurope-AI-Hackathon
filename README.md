# TACNET — Tactical Augmented Reality HUD

> Hackathon submission for TechEurope London AI Hackathon

A futuristic heads-up display overlaid on your live camera feed. Iron Man meets military tactical — rotating reticles, radar sweeps, biometric telemetry, compass headings, threat grids, and scrolling data streams. All running in the browser with zero dependencies.

## Quick Start

```bash
npm run dev
```

For Dust-backed SOP generation, set these environment variables before running:

```bash
DUST_WORKSPACE_ID=your_workspace_id
DUST_AGENT_ID=your_agent_configuration_id
DUST_API_KEY=your_dust_api_key
```

Open [http://localhost:8080/hud.html](http://localhost:8080/hud.html) — tap **INITIALIZE SYSTEM**, allow camera access, and watch the boot sequence.

SkillLens SOP flow is available at [http://localhost:8080/extract.html](http://localhost:8080/extract.html) and uses `POST /api/sop/generate`.

For mobile testing, open `http://<your-local-ip>:8080/hud.html` on your phone (same Wi-Fi network).

## What You Get

- **Boot sequence** — typewriter-style system initialization before the HUD appears
- **Full-screen camera feed** with scanlines and vignette overlay
- **Center targeting reticle** — triple rotating segmented arcs with crosshair
- **Live data** — real clock, date, GPS coordinates, FPS counter, mission timer
- **Compass heading strip** — uses device orientation API on mobile, simulated drift on desktop
- **Biometric telemetry** — heart rate, blood O2, core temp, power cell, altitude
- **Subsystem status panel** — optics, nav, comms, shield, weapons
- **Radar sweep** with animated blips
- **Threat assessment grid** with scanning lines
- **Scrolling hex data stream**

## Tech

| Layer | Choice |
|---|---|
| Frontend | Single HTML file, vanilla CSS + JS |
| Camera | `getUserMedia` API |
| Fonts | Orbitron + Share Tech Mono (Google Fonts) |
| Orientation | DeviceOrientation API |
| Geolocation | Geolocation API |

## Project Structure

```
├── hud.html        # The entire app — camera + HUD overlay
├── package.json    # npm run dev
└── README.md
```

---

*Built at TechEurope London AI Hackathon | February 2026*
