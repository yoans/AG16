# AG16

AG16 is a creative visual and musical grid instrument built with React and Vite. Draw arrows, generate evolving patterns, route notes over browser MIDI, and explore ideas with a built-in synth.

## Getting Started

### Prerequisites

- Node.js 20.x or later (recommended: use `nvm` to manage versions)
- npm

### Installation

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

`npm start` is kept as an alias for the same Vite dev server.

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload when you make edits.

### Build

Build the app for production:

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## MIDI Notes

- Browser MIDI output works with any Web MIDI-compatible browser setup.
- For DAW routing, use a virtual MIDI port such as loopMIDI on Windows or IAC Driver on macOS.
- The app also includes a built-in synth for quick testing without external devices.

## Features

- **Grid-based composition**: Place and route arrows to create evolving patterns
- **Browser MIDI output**: Send notes to connected devices, soft synths, or DAWs
- **16 channels**: Separate musical parts across independent channels
- **Built-in synth**: Audition ideas without external MIDI gear
- **Scales and keys**: Choose from 60+ scales with flexible key selection
- **Per-channel controls**: Adjust channel behavior and playback independently
- **Presets and sharing**: Load presets and share patterns by URL
- **High arrow counts**: Optimized logic supports much larger patterns than the original build

## Tech Stack

- React 18
- Vite 5
- p5.js for canvas animations
- Tone.js for audio synthesis
- intro.js for onboarding
- ramda for functional utilities
- Playwright scripts for responsive QA captures

## Project Structure

```
src/
├── index.jsx                 # React entry point
├── App.js                    # Top-level app shell
├── App.css                   # Global styles and responsive layout
└── arrow-grid/               # Core application
    ├── app.js                # Main instrument UI and state
    ├── animations.js         # p5.js canvas animations
    ├── arrows-logic*.js      # Arrow simulation logic
    ├── midi.js               # Browser MIDI integration
    ├── play-notes.js         # Note triggering and playback
    ├── synth-engine.js       # Tone.js synth engine
    ├── presets.js            # Preset definitions
    ├── scales.js             # Musical scale data
    └── buttons/              # UI button components

public/
├── CNAME                     # GitHub Pages custom domain
├── favicon.ico               # App favicon
└── images/                   # PWA, social, and splash assets

scripts/
├── responsive-audit.mjs      # Responsive QA audit runner
├── review.html               # Screenshot review template
└── screenshots.mjs           # Screenshot capture script
```

## License

MIT
