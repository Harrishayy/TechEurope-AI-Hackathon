# FOV Rebrand + HUD UI Design

**Date:** 2026-02-21
**Scope:** `index.html` + `coach.html` only
**Approach:** Clip-path angular panels (Option A)

## Brand

- **Name:** FOV (Field of View)
- **Tagline:** VISUAL INTELLIGENCE OVERLAY
- **Logo:** `[FOV]` monogram in angular clip-path badge with cyan corner notches + glow
- **Fonts:** Orbitron (headings) + Share Tech Mono (data/labels) — keep existing

## Color System

```css
--hud:          #00f0ff   /* primary cyan */
--hud-dim:      #007a8a   /* dimmed cyan */
--hud-mid:      #00b8cc   /* mid cyan */
--bg:           #00080e   /* near-black navy */
--surface:      #020f1a   /* panel background */
--danger:       #ff3355   /* alerts */
--text:         #e0f8ff   /* soft cyan-white */
```

## index.html Redesign

- Full dark navy background with subtle scanline CSS texture
- FOV logo: angular clip-path badge, cyan glow pulse animation
- 2 action cards ("Create SOP", "Start Coaching"): clip-path frames with chamfered corners top-right + bottom-left, cyan border stroke, hover glow pulse
- Input fields: angular left-cut clip-path, cyan focus ring
- API key section: smaller secondary HUD panel style

## coach.html Rebrand

- Replace all "SkillLens" text → "FOV"
- Align all colors to `#00f0ff` cyan (remove teal-green remnants from old brand)
- Step cards / status panels: clip-path angular frames consistent with index
- Camera viewport: corner bracket decorations (already partially present)

## Implementation Plan

1. Update `css/style.css` — add HUD CSS variables + clip-path utility classes
2. Restyle `index.html` — full HUD panel layout with FOV branding
3. Restyle `coach.html` — update brand name + unify color/panel styles
