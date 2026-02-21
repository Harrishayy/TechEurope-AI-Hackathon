# SkillLens — Product Requirements Document
### Hackathon Build | v1.0

---

## Problem

Blue-collar onboarding is broken. Tradespeople — baristas, plumbers, electricians, solar installers — are trained through documentation, written tests, and classroom sessions before they're ever allowed on site. The result is a slow, expensive pipeline that separates learning from doing. Trainees absorb theory in isolation, then are thrown into the physical job and expected to perform.

The better model — learning while doing — has always been blocked by one constraint: there's no guide standing next to you at all times. SkillLens removes that constraint.

---

## Solution

SkillLens is a mobile-first AI coaching layer that watches what you're doing through your phone camera and tells you what to do next, in real time.

Point your phone at a coffee machine, a boiler, a circuit panel, or a solar inverter. SkillLens identifies where you are in the workflow and delivers the next instruction as a clean overlay on your screen. As you move and the scene changes, it updates. You learn by doing, with a mentor in your pocket.

---

## Target Users

**Primary:** Trainees in physical, procedural trades — hospitality, construction, renewables, facilities management. Typically 18–30, comfortable with mobile, time-poor, learning on their feet.

**Secondary:** Training managers and employers who need to reduce the cost and duration of onboarding, and want visibility into trainee progress without being physically present.

---

## Hackathon Scope (v0)

The demo focuses on a single, compelling use case: **barista onboarding**. This is deliberately chosen because it is universally relatable to judges, visually interesting on camera, and procedurally complex enough to demonstrate real value.

The demo shows a trainee standing at an espresso machine. The phone camera captures the scene. SkillLens overlays step-by-step instructions that update as the trainee progresses through making an espresso — from grounds to cup.

---

## Core Features (v0)

### 1. Live Vision Coaching
The camera feed is sent to Gemini 2.0 Flash every 2 seconds. Gemini is primed with a structured Standard Operating Procedure (SOP) for the task. It identifies the current state of the scene, matches it to the appropriate step in the SOP, and returns a single clear instruction. That instruction renders as an overlay on the live camera view.

### 2. SOP Extraction Pipeline
Before the session, a coach or training manager pastes a YouTube tutorial URL. SkillLens extracts the video transcript, sends it to Gemini, and generates a structured JSON SOP — a numbered sequence of steps with descriptions, what to look for, and common mistakes. This SOP is embedded into the system prompt for the live session.

### 3. Manual Step Advance
A "Next Step" button allows the trainee to manually progress if the AI misreads the scene. This is the safety net for demo reliability and a genuine UX feature — trainees shouldn't be blocked by a false negative.

### 4. Mobile-First Full-Screen UI
The app runs entirely in the mobile browser. No install required. Full-screen camera feed with a semi-transparent instruction panel at the bottom. Large, readable text. Designed for one-handed operation in a physical environment.

---

## Technical Architecture

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Vanilla HTML/JS | Zero setup, runs anywhere, no build step |
| Camera | `getUserMedia` API | Native browser, no permissions friction |
| AI Vision | Gemini 2.0 Flash | Multimodal, fast (<1s), generous free tier |
| SOP Extraction | Gemini 2.0 Flash (text) | Same API, batch process before session |
| Hosting | Vercel / GitHub Pages | One-command deploy, shareable URL |
| Demo capture | Phone screen record | Native POV, no extra hardware |

**Data flow:**
1. Browser captures video frame every 2 seconds
2. Frame converted to base64 JPEG
3. POST to Gemini API with frame + system prompt (SOP + task context)
4. Response text rendered to overlay div
5. Previous instruction fades, new instruction appears

---

## System Prompt Design

The quality of the experience lives in the prompt. The production prompt structure is:

```
You are an expert [role] trainer guiding a trainee in real time.
The trainee is working through the following standard procedure:

[SOP JSON — numbered steps with descriptions]

I will send you a camera frame every 2 seconds.

Your job:
1. Look at the image and identify which step the trainee appears to be on.
2. Respond with ONLY their next instruction in one short, clear sentence.
3. Be encouraging and specific.
4. If the image is unclear, ask them to show you the relevant part of the equipment.
5. Never repeat the same instruction twice in a row.
6. If they appear to have completed all steps, congratulate them.
```

---

## Demo Script

**Setup:** Phone propped or held pointing at an espresso machine. App open in Safari/Chrome. Screen record running.

**Flow:**
- Open app → camera activates → "Point your camera at the coffee machine to begin"
- Show portafilter → overlay: "Remove the portafilter and knock out any used grounds"
- Show group head → overlay: "Rinse the group head with a short flush"
- Show grinder → overlay: "Grind a fresh dose — aim for 18g"
- Continue through tamping, extraction, milk steaming
- Final shot pulled → overlay: "Your espresso is ready. Nice work."

**Video:** Screen-recorded on phone, 90 seconds, voiceover optional. Upload to GitHub repo `/demo`.

---

## Out of Scope (v0)

The following are genuine product directions but excluded from the hackathon build to protect delivery:

- User accounts and progress tracking
- Multi-trade SOP library
- Voice output / audio instructions
- Wearable / AR glasses integration
- Employer dashboard and analytics
- Offline mode

---

## Longer-Term Vision

SkillLens is infrastructure for physical work. Every procedural trade has a body of YouTube tutorials, training manuals, and institutional knowledge that currently lives in people's heads. SkillLens turns that knowledge into a deployable coaching layer that travels with the trainee.

The glasses form factor — Meta Ray-Ban, or purpose-built AR — is the natural endpoint. Hands-free, persistent overlay, voice I/O. The phone demo is a proof of concept for the AI layer. The hardware will catch up.

The business model is B2B: sell to employers, training providers, and trade bodies who want to reduce onboarding time and cost at scale. A solar installer firm onboarding 50 engineers a year, a hospitality group training 200 bar staff — these are the customers. The trainee experience is the product. The employer ROI is the pitch.

---

## Success Criteria (Hackathon)

- Live demo works end-to-end on a real coffee machine
- Gemini correctly identifies at least 5 distinct steps in sequence
- Demo video is under 2 minutes and tells a clear story
- GitHub repo is clean, README explains setup in under 5 minutes
- A non-technical judge can understand the value in 30 seconds

---

*Built at TechEurope London Hackathon | February 2026*
