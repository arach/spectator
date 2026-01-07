# Spectator Packaging + Import Enhancements Plan

## Goals
- Add local JSONL import (drop zone + folder picker) with session browsing parity.
- Expand landing page content with install, features, and local-first/privacy copy.
- Package as an installable NPM CLI that auto-opens a browser and resolves port conflicts.

## Steps
1. Build local import pipeline and UI
   - Add local session store/context.
   - Add drag-and-drop JSONL + folder picker controls.
   - Add source toggle (Configured Roots vs Local Imports) and scope project/session lists.
2. Enable local session playback
   - Add `/local/:sessionId` route.
   - Load local file content into the session viewer with graceful errors.
   - Keep shareable per-entry anchors intact.
3. Landing page content + styling
   - Add a feature/installation section with copy.
   - Add privacy/local-first messaging and quick-start commands.
4. NPM packaging + CLI
   - Add a Node-compatible server entry and CLI.
   - Auto-open browser and probe ports.
   - Update package metadata (bin, version, files).

