# Spectator

Spectator is a local-first web app for reviewing Claude JSONL sessions directly from disk. Load a session by URL and explore the timeline with a raw JSON inspector.

## Setup

```bash
bun install
```

## Development

Run the UI and the local API server in separate terminals:

```bash
bun run dev
bun run dev:server
```

Then visit:

```
http://localhost:5173/s/<session-id>
```

## Configuration

Edit `spectator.config.json` to point at your local log roots:

```json
{
  "roots": ["~/.claude/projects"],
  "maxDepth": 5,
  "port": 8787
}
```

## Production

```bash
bun run build
bun run start
```
