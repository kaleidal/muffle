# Librespot Binary

This folder should contain the librespot binary for your platform.

## Getting Librespot

Since librespot doesn't provide pre-built Windows binaries, you have two options:

### Option 1: Build from source (recommended)

1. Install Rust: https://rustup.rs/
2. Clone librespot:
   ```bash
   git clone https://github.com/librespot-org/librespot.git
   cd librespot
   ```
3. Build for Windows:
   ```bash
   # Easiest: keep default features (includes native-tls)
   cargo build --release --features rodio-backend

   # If you really want --no-default-features, you MUST re-enable a TLS backend:
   # cargo build --release --no-default-features --features "rodio-backend native-tls"
   ```
4. Copy `target/release/librespot.exe` to this folder

### Option 2: Use spotifyd (alternative)

spotifyd is a Spotify daemon that uses librespot internally.

1. Build spotifyd with Windows support:
   ```bash
   git clone https://github.com/Spotifyd/spotifyd.git
   cd spotifyd
   cargo build --release --no-default-features --features rodio_backend
   ```
2. Rename `target/release/spotifyd.exe` to `librespot.exe` and place it here

Note: spotifyd uses slightly different command line arguments, so you may need
to adjust the spawn arguments in main.cjs accordingly.

## File Structure

After setup, this folder should contain:
- `librespot.exe` (Windows)
- `librespot` (macOS/Linux)

## Configuration

Librespot will be started with these defaults:
- Device name: "Muffle"
- Bitrate: 320kbps
- Backend: rodio (cross-platform audio)
- Device type: computer

Authentication is handled via Spotify Connect (zeroconf) - the app transfers
playback to the "Muffle" device using your existing Spotify access token.
