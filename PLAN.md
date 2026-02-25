
# AG16 Plan

## Strategy
**Goal**: Build AG16 as a free creative tool to attract users and grow a community — not monetized directly.
- Community hub (Discord or similar) for sharing creations, presets, feedback
- Share links drive organic growth — every shared grid is a mini-advertisement
- Track usage to understand behavior, guide feature development, and demonstrate traction

---

## 🔴 P0 — Critical (Ship Blockers)

### Mobile Responsiveness (iPhone 16 Pro / iPad)
- [ ] Fix iPhone 16 Pro (402×874) layout — header overflow, cramped controls
  - [ ] Collapse header into 2 clear rows: [logo + play + undo/redo] [presets + actions]
  - [ ] Hide text labels on all header buttons (icon-only on mobile)
  - [ ] Undo/redo group: icon-only, no text labels on mobile
  - [ ] Randomize/Clear buttons: icon-only on mobile, move into actions row
  - [ ] Ensure safe-area-inset for notch/dynamic island
  - [ ] Canvas should fill available width with no horizontal scroll
  - [ ] Side panels: fluid grid, no overflow, stacked vertically
  - [ ] Footer selects: full-width stacked on narrow screens
  - [ ] Touch targets: minimum 44×44px for all interactive elements
- [ ] Fix iPad (820×1180 portrait, 1180×820 landscape) layout
  - [ ] Portrait: use phone-style stacked layout but with more breathing room
  - [ ] Landscape: use desktop 3-column layout (panel–canvas–panel)
  - [ ] Test both orientations with rotation
- [ ] Add `env(safe-area-inset-*)` padding for iOS notch/home indicator
- [ ] Test slider overlays on mobile — fullscreen touch interaction
- [ ] Test channel select overlay on mobile — grid layout, touch targets

### Analytics (Usage Tracking)
- [ ] Add Plausible Analytics (privacy-friendly, no cookies, GDPR-compliant)
  - [ ] Script tag in index.html: `<script defer data-domain="ag16.sagaciasoft.com" src="https://plausible.io/js/script.js"></script>`
  - [ ] Custom events to track:
    - `Play` — user hits play
    - `Share` — user shares a grid
    - `Randomize` — user randomizes
    - `Preset-Load` — user loads a preset (with preset name)
    - `Save` — user saves a grid
    - `Load-Shared` — user opens a shared link
    - `Sound-Toggle` — sound on/off
    - `MIDI-Toggle` — MIDI on/off
    - `Channel-Change` — channel selected (with channel number)
    - `Synth-Preset-Change` — synth preset changed
    - `Grid-Size-Change` — grid size adjusted
    - `Speed-Change` — speed adjusted
    - `Intro-Dismissed` — intro modal closed (with sound choice)
  - [ ] Track page views automatically (Plausible default)
  - [ ] Dashboard at plausible.io — no login or self-hosting needed
- [ ] Verify analytics working in production

### Favicon & Icons
- [x] Favicon (ICO, PNG, SVG) ✅
- [x] Apple touch icon ✅
- [x] PWA manifest icons ✅

---

## 🟡 P1 — Important (Pre-Launch Polish)

### SEO & Social
- [ ] Open Graph meta tags in index.html
  - [ ] `og:title` — "AG16 — Arrow Grid: 16 Channel"
  - [ ] `og:description` — "Create rhythms and melodies with bouncing arrows on a grid. Free audio-visual instrument."
  - [ ] `og:image` — social preview image (1200×630px, logo + dark bg + tagline)
  - [ ] `og:url` — https://ag16.sagaciasoft.com
  - [ ] `og:type` — website
  - [ ] `twitter:card` — summary_large_image
  - [ ] `twitter:image` — same preview image
- [ ] Generate social preview image (1200×630) with pixel logo and tagline
- [ ] Meta description tag (already exists, refine copy)
- [ ] Canonical URL tag

### Legal / Compliance
- [ ] Privacy Policy page (inline modal or /privacy route)
  - What's collected: anonymous page views and events via Plausible (no cookies, no PII)
  - localStorage: saves grids locally on user's device only
  - No data sold, no third-party tracking, no ads
- [ ] Footer link to privacy policy
- [ ] Copyright notice: "© 2026 Nathaniel Young" in info modal
- [ ] No cookie banner needed (Plausible is cookie-free)

### Performance & Quality
- [ ] Lighthouse audit (target 90+ on Performance, Accessibility, Best Practices, SEO)
- [ ] Accessibility audit
  - [ ] All buttons have aria-labels or title attributes
  - [ ] Keyboard navigation works for all controls
  - [ ] Color contrast meets WCAG AA
  - [ ] Screen reader announces state changes (play/pause, channel, preset)
- [ ] Cross-browser testing: Chrome, Firefox, Safari (iOS + macOS), Edge
- [ ] Error boundary (React) — catch crashes gracefully, show "reload" instead of blank screen

### PWA Enhancement
- [ ] Service worker for offline support (Vite PWA plugin or custom)
- [ ] manifest.json: add `description`, `categories`, `orientation`
- [ ] Add to Home Screen prompt / install banner

---

## 🟢 P2 — Nice to Have (Post-Launch)

### Community Features
- [ ] Discord server for sharing creations, getting feedback
- [ ] "Gallery" page — curated collection of shared grids (static or CMS-powered)
- [ ] In-app "Explore" button linking to gallery or community
- [ ] Social sharing enhancements
  - [ ] Generate preview image per shared grid (canvas screenshot → blob URL)
  - [ ] Share with image on social platforms
- [ ] User-submitted presets (via form or Discord bot → reviewed → added to app)

### UI Polish
- [x] Saved Grids modal: add delete confirmation ✅
- [x] Saved Grids modal: load grid on row click ✅
- [ ] Haptic feedback on iOS (vibrate on tap for mobile)
- [ ] Animated transitions between presets
- [ ] Dark/light theme toggle (currently dark-only)
- [ ] Onboarding tour for first-time users (highlight key controls step-by-step)

### Audio
- [x] Per-channel browser synth (Web Audio API) ✅
- [x] Synth presets ✅
- [x] Custom synth parameters per channel ✅
- [x] Percussion synthesis ✅
- [ ] Enable/disable both sound and MIDI from inside channel popup
- [ ] Pull channel enable/disable and volume into channel popup
- [ ] Audio recording / export (MediaRecorder → WAV/MP3 download)
- [ ] Tempo sync / tap tempo

### Sharing
- [x] Fix link sharing ✅
- [x] Compact binary URL encoding ✅
- [x] MIDI program change sends preview note (middle C, 300ms) ✅
- [ ] URL shortener integration (optional — for even shorter share links)
- [ ] QR code generation for live sharing (show QR modal)

### Branding
- [x] Rename to AG16 ✅
- [x] Pixel-perfect logo (rect-based SVG, no font dependency) ✅
- [x] Press Start 2P font integration ✅
- [ ] Splash / loading screen with logo animation

### 404 / Error
- [ ] Custom 404 page for GitHub Pages
- [ ] Error boundary UI

---

## ✅ Completed
- [x] Git + GitHub remote
- [x] GitHub Pages deployment (Actions workflow)
- [x] Custom domain (ag16.sagaciasoft.com)
- [x] SSL/HTTPS
- [x] Memory leak audit & fixes
- [x] CSS fixes (.ch-select-arrow, arrow click, slider overlay)
- [x] Channel drag-to-select
- [x] Logo prototypes + parametric builder
- [x] Logo finalized (pixel-perfect SVG)
- [x] Favicon & icon generation
- [x] Logo in header, intro modal, info modal
- [x] Channel color theming
- [x] Header restructure (logo + 4-line title)
- [x] Speed shortcuts (+/-)
- [x] Share URL compression (binary encoding)

---

## Release Checklist
- [ ] All P0 items complete
- [ ] All P1 items complete
- [ ] Manual test on: iPhone 16 Pro (Safari), iPad (Safari), Chrome desktop, Firefox
- [ ] Plausible analytics verified
- [ ] DNS / GitHub Pages fully working
- [ ] Announce launch
