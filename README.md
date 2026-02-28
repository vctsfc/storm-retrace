# Storm Retrace

Archived NEXRAD weather radar replay tool for storm chasers. Browse historical radar data from any NEXRAD site with full volume scan playback, SAILS/MESO-SAILS support, and multiple radar products.

## Local Setup

**Prerequisites:** [Node.js](https://nodejs.org/) (v18+) and Git

```bash
# Clone the repo
git clone https://github.com/vctsfc/storm-retrace.git
cd storm-retrace

# Install dependencies
npm install

# Run in browser (dev mode)
npm run dev

# Or run as a desktop app (Electron)
npm run electron:dev
```

Open `http://localhost:5173` if running in browser mode. Pick a NEXRAD site, set a date/time range, and hit Load to replay archived radar data.

## Building the Desktop App

```bash
# macOS .app bundle
npm run dist:dir

# macOS .dmg installer
npm run dist:dmg
```
