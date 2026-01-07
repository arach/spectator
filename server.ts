import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

type SpectatorConfig = {
  roots: string[]
  maxDepth: number
  port: number
}

type SessionFile = {
  path: string
  mtimeMs: number
  size: number
}

const defaultConfig: SpectatorConfig = {
  roots: [join(process.env.HOME ?? '', '.claude', 'projects')],
  maxDepth: 5,
  port: 8787,
}

const fileHistoryRoot = join(process.env.HOME ?? '', '.claude', 'file-history')

const config = await loadConfig()
const sessionCache = new Map<string, string>()

const app = new Hono()
app.use('/api/*', cors())

app.get('/api/health', (c) => {
  return c.json({ ok: true })
})

app.get('/api/session/:id', async (c) => {
  const sessionId = c.req.param('id')
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
    return c.json({ error: 'Invalid session id format.' }, 400)
  }

  const filePath = await findSessionFile(sessionId)
  if (!filePath) {
    return c.json({ error: 'Session not found.' }, 404)
  }

  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return c.json({ error: 'Session file missing.' }, 404)
  }

  const text = await file.text()
  return c.json({
    sessionId,
    path: filePath,
    text,
  })
})

app.get('/api/file-history/:sessionId/:backup', async (c) => {
  const sessionId = c.req.param('sessionId')
  const backup = c.req.param('backup')
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
    return c.json({ error: 'Invalid session id format.' }, 400)
  }
  if (!/^[a-zA-Z0-9@._-]+$/.test(backup) || backup.includes('..')) {
    return c.json({ error: 'Invalid backup file format.' }, 400)
  }

  const filePath = join(fileHistoryRoot, sessionId, backup)
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return c.json({ error: 'Backup not found.' }, 404)
  }

  const text = await file.text()
  return c.json({ sessionId, backup, text })
})

app.get('/api/sessions', async (c) => {
  const limit = Number(c.req.query('limit') ?? 120)
  const files = await listSessionFiles(config.roots, config.maxDepth, limit)
  return c.json({ sessions: files })
})

app.get('/assets/*', serveStatic({ root: './dist' }))
app.get('*', async (c) => {
  const file = Bun.file('./dist/index.html')
  if (await file.exists()) {
    return c.html(await file.text())
  }
  return c.text('Build not found. Run `bun run build` first.', 404)
})

Bun.serve({
  port: config.port,
  fetch: app.fetch,
})

async function loadConfig(): Promise<SpectatorConfig> {
  const file = Bun.file('./spectator.config.json')
  if (!(await file.exists())) {
    return defaultConfig
  }

  try {
    const parsed = JSON.parse(await file.text()) as Partial<SpectatorConfig>
    const roots = (parsed.roots ?? defaultConfig.roots).map(expandHome)
    return {
      roots,
      maxDepth: parsed.maxDepth ?? defaultConfig.maxDepth,
      port: parsed.port ?? defaultConfig.port,
    }
  } catch {
    return defaultConfig
  }
}

function expandHome(value: string): string {
  if (value.startsWith('~/')) {
    return join(process.env.HOME ?? '', value.slice(2))
  }
  return value
}

async function findSessionFile(sessionId: string): Promise<string | null> {
  const cached = sessionCache.get(sessionId)
  if (cached) {
    return cached
  }

  const target = `${sessionId}.jsonl`
  for (const root of config.roots) {
    const direct = join(root, target)
    const directFile = Bun.file(direct)
    if (await directFile.exists()) {
      sessionCache.set(sessionId, direct)
      return direct
    }

    const found = await scanForFile(root, target, config.maxDepth)
    if (found) {
      sessionCache.set(sessionId, found)
      return found
    }
  }

  return null
}

async function scanForFile(
  directory: string,
  target: string,
  depth: number,
): Promise<string | null> {
  if (depth < 0) {
    return null
  }

  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name === target) {
      return join(directory, entry.name)
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const found = await scanForFile(join(directory, entry.name), target, depth - 1)
    if (found) {
      return found
    }
  }

  return null
}

async function listSessionFiles(
  roots: string[],
  maxDepth: number,
  limit: number,
): Promise<SessionFile[]> {
  const collected: SessionFile[] = []
  for (const root of roots) {
    await collectFiles(root, maxDepth, collected, limit)
    if (collected.length >= limit) {
      break
    }
  }
  return collected
}

async function collectFiles(
  directory: string,
  depth: number,
  collected: SessionFile[],
  limit: number,
): Promise<void> {
  if (depth < 0 || collected.length >= limit) {
    return
  }

  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (collected.length >= limit) {
      return
    }
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const fullPath = join(directory, entry.name)
      try {
        const stats = await stat(fullPath)
        collected.push({
          path: fullPath,
          mtimeMs: stats.mtimeMs,
          size: stats.size,
        })
      } catch {
        collected.push({
          path: fullPath,
          mtimeMs: 0,
          size: 0,
        })
      }
    }
  }

  for (const entry of entries) {
    if (collected.length >= limit) {
      return
    }
    if (entry.isDirectory()) {
      await collectFiles(join(directory, entry.name), depth - 1, collected, limit)
    }
  }
}
