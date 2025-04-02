# Girl Streamer - Twitch-Inspired Dashboard

A modern, clean dashboard skin with a Twitch streaming interface that provides at-a-glance status information.

## Features
- Twitch-inspired layout with main video area and chat sidebar
- Streaming metrics displayed as viewers and donations
- Pulsing animations for critical indicators
- Modern gauge visualization
- Smooth transitions between states
- Dark theme with vibrant accents for optimal visibility
- RPM-controlled center animation with dynamic behavior:
  - Gentle pulsing at idle (below 2000 RPM)
  - Responsive movement at normal driving speeds (2000-4500 RPM)
  - Energetic animation at high RPM (4500-6000 RPM)

## Setup Instructions
1. Create a sprite sheet named `drop.png` with all animation frames laid out horizontally
2. Place it in the skin's directory
3. The skin is configured for a sprite sheet with.23 frames across 11270 pixels
4. If your sprite sheet has different dimensions, update the configuration constants in `script.js`

## Animation Behavior
- Below 2000 RPM: Ping-pong animation between frames 1-7
- 2000-4500 RPM: Frame directly matches the RPM value
- 4500-6000 RPM: Ping-pong animation between frames 11-23

## Screenshots
(Add screenshots once the skin is finalized)

## Inspiration
Inspired by modern streaming interfaces like Twitch, adapted for vehicle dashboards to provide an engaging and intuitive user experience.
