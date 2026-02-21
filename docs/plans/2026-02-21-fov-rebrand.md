# FOV Rebrand + HUD UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebrand "SkillLens" → "FOV" and apply the angular cyan HUD frame aesthetic (clip-path chamfered panels, glowing borders) to `index.html` and `coach.html`.

**Architecture:** Pure CSS + HTML edits. No JS changes needed. The coach page already uses the HUD palette — the landing page needs to be fully restyled. We extend the existing `.coach-wrapper` HUD CSS variables globally and add new clip-path utility classes for panels, cards, inputs, and buttons.

**Tech Stack:** Vanilla HTML5 / CSS3, Orbitron + Share Tech Mono (Google Fonts), clip-path polygons for angular frames, CSS custom properties.

---

## Files touched
- Modify: `index.html`
- Modify: `coach.html`
- Modify: `css/style.css`

---

### Task 1: Update index.html — fonts, title, brand text

**Files:**
- Modify: `index.html`

**Step 1: Add Google Fonts + update meta**

Replace in `index.html` `<head>`:

```html
<!-- replace line 6 theme-color -->
<meta name="theme-color" content="#00080e">
<!-- replace line 9 title -->
<title>FOV — Field of View</title>
<!-- add after line 10 (stylesheet link) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@500;700&display=swap" rel="stylesheet">
```

**Step 2: Update brand text in body**

In `index.html` body, make these replacements:
- Line 16: `SL` → `FOV`
- Line 17: `SkillLens` → `FOV`
- Line 19: tagline → `VISUAL INTELLIGENCE OVERLAY<br><span style="font-size:0.8em;opacity:0.6">FIELD OF VIEW // AI COACHING SYSTEM</span>`
- Line 49: `SkillLens will identify it` → `FOV will identify it`
- Line 53: `Built for Hackathon | February 2026` → `FOV // FIELD OF VIEW // TECH EUROPE 2026`

**Step 3: Commit**

```bash
git add index.html
git commit -m "rebrand: update index.html text to FOV"
```

---

### Task 2: Update coach.html — title + brand label

**Files:**
- Modify: `coach.html`

**Step 1: Update title and brand label**

- Line 9: `<title>SkillLens — Coaching</title>` → `<title>FOV — Coaching</title>`
- Line 36 (coach-title span): `SKILLLENS` → `FOV`

**Step 2: Commit**

```bash
git add coach.html
git commit -m "rebrand: update coach.html to FOV"
```

---

### Task 3: Replace CSS root variables with HUD palette

**Files:**
- Modify: `css/style.css` lines 1–16

**Step 1: Replace `:root` block**

Replace the entire `:root { ... }` block (lines 1–16) with:

```css
/* FOV — Field of View // Global Styles */

:root {
  /* HUD palette — used everywhere */
  --hud:              #00f0ff;
  --hud-dim:          #007a8a;
  --hud-mid:          #00b8cc;
  --hud-glow:         rgba(0, 240, 255, 0.12);
  --hud-glow-strong:  rgba(0, 240, 255, 0.45);
  --hud-border:       rgba(0, 240, 255, 0.55);
  --hud-border-dim:   rgba(0, 240, 255, 0.2);
  --hud-bg:           rgba(0, 8, 14, 0.92);
  --hud-font:         'Share Tech Mono', 'Courier New', monospace;
  --hud-font-display: 'Orbitron', 'Share Tech Mono', monospace;
  --hud-danger:       #ff3355;
  --hud-cut:          14px;

  /* Semantic aliases (used in landing/extract page rules) */
  --bg:               #00080e;
  --surface:          #020f1a;
  --surface-2:        #041825;
  --accent:           #00f0ff;
  --accent-dim:       #007a8a;
  --accent-glow:      rgba(0, 240, 255, 0.12);
  --text:             #d0f4ff;
  --text-secondary:   rgba(0, 184, 204, 0.55);
  --danger:           #ff3355;
  --overlay-bg:       rgba(0, 8, 14, 0.88);
  --radius:           0px;
  --radius-lg:        0px;
}
```

Note: `--radius` and `--radius-lg` are set to `0px` — all rounded corners become angular.

**Step 2: Update `html, body` font stack**

Replace the `html, body` rule's `font-family` line (line 26):

```css
font-family: var(--hud-font);
```

**Step 3: Add scanline + grid background to `body`**

After the `html, body` rule, add:

```css
body {
  background-image:
    repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 3px,
      rgba(0, 240, 255, 0.015) 3px,
      rgba(0, 240, 255, 0.015) 4px
    );
}
```

**Step 4: Commit**

```bash
git add css/style.css
git commit -m "style: replace root vars with HUD palette, add scanlines"
```

---

### Task 4: Restyle landing page logo + tagline

**Files:**
- Modify: `css/style.css` — `.logo`, `.logo-icon`, `.logo h1`, `.tagline`

**Step 1: Replace logo styles**

Replace the `.logo-icon` rule (lines 60–71):

```css
.logo-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--hud-font-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--bg);
  background: var(--hud);
  clip-path: polygon(
    10px 0%, calc(100% - 10px) 0%, 100% 10px,
    100% calc(100% - 10px), calc(100% - 10px) 100%,
    10px 100%, 0% calc(100% - 10px), 0% 10px
  );
  box-shadow: 0 0 20px var(--hud-glow-strong), 0 0 40px var(--hud-glow);
  letter-spacing: 1px;
}
```

Replace `.logo h1` rule (lines 73–77):

```css
.logo h1 {
  font-family: var(--hud-font-display);
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--hud);
  text-shadow: 0 0 20px var(--hud-glow-strong), 0 0 40px var(--hud-glow);
  text-transform: uppercase;
}
```

Replace `.tagline` rule (lines 79–83):

```css
.tagline {
  font-family: var(--hud-font);
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.6;
  letter-spacing: 1px;
  text-transform: uppercase;
}
```

**Step 2: Commit**

```bash
git add css/style.css
git commit -m "style: HUD logo and tagline for landing page"
```

---

### Task 5: Restyle API key section as HUD panel

**Files:**
- Modify: `css/style.css` — `.api-key-section`, `.input-group input`, `.btn-small`

**Step 1: Replace `.api-key-section` rule (lines 87–92)**

```css
.api-key-section {
  position: relative;
  background: var(--hud-bg);
  border: 2px solid var(--hud-border);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  clip-path: polygon(
    0% var(--hud-cut),
    var(--hud-cut) 0%,
    calc(100% - var(--hud-cut)) 0%,
    100% var(--hud-cut),
    100% calc(100% - var(--hud-cut)),
    calc(100% - var(--hud-cut)) 100%,
    var(--hud-cut) 100%,
    0% calc(100% - var(--hud-cut))
  );
  box-shadow: 0 0 16px var(--hud-glow), inset 0 0 20px rgba(0, 240, 255, 0.02);
}
```

**Step 2: Replace `.api-key-section label` (lines 94–102)**

```css
.api-key-section label {
  font-family: var(--hud-font-display);
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--hud-mid);
  display: block;
  margin-bottom: 0.5rem;
  text-shadow: 0 0 8px var(--hud-glow);
}
```

**Step 3: Replace `.input-group input` (lines 113–123)**

```css
.input-group input {
  flex: 1;
  background: rgba(0, 240, 255, 0.03);
  border: 1px solid var(--hud-border-dim);
  border-left: 3px solid var(--hud-border);
  padding: 0.65rem 0.85rem;
  color: var(--text);
  font-family: var(--hud-font);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  clip-path: polygon(
    8px 0%, 100% 0%, 100% 100%, 8px 100%, 0% calc(100% - 8px), 0% 8px
  );
}

.input-group input:focus {
  border-color: var(--hud);
  box-shadow: 0 0 10px var(--hud-glow);
}
```

**Step 4: Replace `.btn-small` (lines 129–142)**

```css
.btn-small {
  position: relative;
  background: rgba(0, 240, 255, 0.06);
  color: var(--hud);
  border: 2px solid var(--hud-border);
  padding: 0.65rem 1rem;
  font-family: var(--hud-font-display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
  clip-path: polygon(
    6px 0%, calc(100% - 6px) 0%, 100% 6px,
    100% calc(100% - 6px), calc(100% - 6px) 100%,
    6px 100%, 0% calc(100% - 6px), 0% 6px
  );
  white-space: nowrap;
}

.btn-small:hover {
  background: rgba(0, 240, 255, 0.15);
  box-shadow: 0 0 12px var(--hud-glow);
}
```

**Step 5: Replace `.hint` (lines 144–148)**

```css
.hint {
  font-family: var(--hud-font);
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  letter-spacing: 0.5px;
}
```

**Step 6: Replace `.key-status` rules**

```css
.key-status {
  display: inline-block;
  font-family: var(--hud-font);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-top: 0.5rem;
}

.key-status.saved  { color: var(--hud); text-shadow: 0 0 8px var(--hud-glow); }
.key-status.missing { color: var(--hud-danger); }
```

**Step 7: Commit**

```bash
git add css/style.css
git commit -m "style: HUD panel + inputs for API key section"
```

---

### Task 6: Restyle action cards with HUD clip-path frames

**Files:**
- Modify: `css/style.css` — `.card`, `.card-primary`, `.card-icon`, `.card h2`, `.card p`

**Step 1: Replace `.card` rules (lines 169–209)**

```css
.card {
  display: block;
  position: relative;
  background: var(--hud-bg);
  border: 2px solid var(--hud-border-dim);
  padding: 1.5rem;
  text-decoration: none !important;
  color: var(--text);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
  clip-path: polygon(
    0% var(--hud-cut),
    var(--hud-cut) 0%,
    calc(100% - 24px) 0%,
    100% 24px,
    100% 100%,
    calc(100% - var(--hud-cut)) 100%,
    var(--hud-cut) 100%,
    0% calc(100% - var(--hud-cut))
  );
}

/* Top-right corner accent line */
.card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 40px;
  height: 2px;
  background: var(--hud-border-dim);
  transform-origin: top right;
  transform: rotate(45deg) translateX(14px) translateY(-7px);
  transition: background 0.2s;
  pointer-events: none;
}

.card:hover {
  transform: translateY(-2px);
  border-color: var(--hud-border);
  box-shadow: 0 0 18px var(--hud-glow), inset 0 0 20px rgba(0, 240, 255, 0.02);
}

.card:hover::before {
  background: var(--hud-border);
}

.card-primary {
  border-color: var(--hud-border);
  background: rgba(0, 240, 255, 0.04);
  box-shadow: 0 0 16px var(--hud-glow);
}

.card-primary::before {
  background: var(--hud-border);
}

.card-primary:hover {
  box-shadow: 0 0 28px var(--hud-glow-strong);
}

.card-icon {
  font-size: 1.8rem;
  margin-bottom: 0.75rem;
  filter: drop-shadow(0 0 8px var(--hud-glow));
}

.card h2 {
  font-family: var(--hud-font-display);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--hud);
  text-shadow: 0 0 10px var(--hud-glow);
  margin-bottom: 0.5rem;
}

.card p {
  font-family: var(--hud-font);
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.5;
  letter-spacing: 0.3px;
}
```

**Step 2: Update footer**

Replace `.footer` rule (lines 211–216):

```css
footer {
  text-align: center;
  padding: 1.5rem 0 0.5rem;
  font-family: var(--hud-font);
  font-size: 0.68rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-secondary);
}
```

**Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: HUD clip-path action cards on landing page"
```

---

### Task 7: Remove duplicate HUD vars from .coach-wrapper + unify

**Files:**
- Modify: `css/style.css` — `.coach-wrapper` block (lines 515–536)

The `.coach-wrapper` block re-declares HUD variables that now live in `:root`. Remove the variable declarations from it, keeping only the layout properties.

**Step 1: Replace `.coach-wrapper` CSS variable block**

Replace lines 515–536:

```css
.coach-wrapper {
  position: fixed;
  inset: 0;
  background: #000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--hud-font);
}
```

(All the `--hud-*` custom property declarations inside `.coach-wrapper` are removed — they're now global in `:root`.)

**Step 2: Verify coach page still renders** — open `http://localhost:8080/coach.html` and confirm HUD colors are intact.

**Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: deduplicate HUD vars, promote to :root"
```

---

### Task 8: Add HUD primary button style (for any future use + extract page)

**Files:**
- Modify: `css/style.css` — `.btn`, `.btn-primary`, `.btn-secondary`

**Step 1: Replace `.btn` rules (lines 377–408)**

```css
.btn {
  width: 100%;
  padding: 0.9rem;
  border: 2px solid var(--hud-border);
  font-family: var(--hud-font-display);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
  clip-path: polygon(
    var(--hud-cut) 0%, calc(100% - var(--hud-cut)) 0%, 100% var(--hud-cut),
    100% calc(100% - var(--hud-cut)), calc(100% - var(--hud-cut)) 100%,
    var(--hud-cut) 100%, 0% calc(100% - var(--hud-cut)), 0% var(--hud-cut)
  );
}

.btn:active { transform: scale(0.98); }

.btn-primary {
  background: rgba(0, 240, 255, 0.07);
  color: var(--hud);
  text-shadow: 0 0 8px var(--hud-glow-strong);
  border-color: var(--hud-border);
  box-shadow: 0 0 12px var(--hud-glow), inset 0 0 12px rgba(0, 240, 255, 0.02);
}

.btn-primary:hover {
  background: rgba(0, 240, 255, 0.16);
  box-shadow: 0 0 20px var(--hud-glow-strong);
}

.btn-primary:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-secondary {
  background: rgba(0, 240, 255, 0.02);
  color: var(--text-secondary);
  border-color: var(--hud-border-dim);
}

.btn-secondary:hover {
  background: rgba(0, 240, 255, 0.06);
  border-color: var(--hud-border);
}
```

**Step 2: Commit**

```bash
git add css/style.css
git commit -m "style: HUD-style primary and secondary buttons"
```

---

### Task 9: Visual QA

**Step 1: Start dev server**

```bash
npx serve . -l 8080
```

**Step 2: Check each page**

1. `http://localhost:8080/` — Verify:
   - Dark navy background with scanlines
   - FOV logo badge (octagonal clip-path, cyan glow)
   - "FOV" title in Orbitron font, cyan glow
   - API key section has angular HUD panel (clip-path chamfered octagon)
   - Both cards have chamfered top-right corner + bottom-left corner, cyan border
   - Cards glow on hover
   - Buttons are angular with HUD style

2. `http://localhost:8080/coach.html` — Verify:
   - Title bar shows "FOV" not "SKILLLENS"
   - All HUD colors still correct (cyan)
   - No visual regression

**Step 3: Fix any issues found, commit fixes**

---

### Task 10: Final commit + memory update

```bash
git add -A
git commit -m "feat: FOV rebrand complete — HUD UI on landing + coach pages"
```

Save to `/Users/ajt/.claude/projects/-Users-ajt-Repos-projects-hacking-TechEurope-AI-Hackathon/memory/MEMORY.md`:
- Project is now branded "FOV (Field of View)"
- HUD palette is in `:root` of `css/style.css`
- All clip-path panel styles use `--hud-cut: 14px`
