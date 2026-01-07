import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serveStatic as baseServeStatic } from 'hono/serve-static'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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

type StartOptions = {
  port?: number
}

const defaultConfig: SpectatorConfig = {
  roots: [join(process.env.HOME ?? '', '.claude', 'projects')],
  maxDepth: 5,
  port: 8787,
}

const fileHistoryRoot = join(process.env.HOME ?? '', '.claude', 'file-history')

export async function startServer(options: StartOptions = {}) {
  const config = await loadConfig()
  const app = buildApp(config)
  const port = options.port ?? config.port
  const server = serve({ fetch: app.fetch, port })
  return { port, close: () => server.close() }
}

function buildApp(config: SpectatorConfig) {
  const sessionCache = new Map<string, string>()
  const app = new Hono()
  app.use('/api/*', cors())

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.get('/api/session/:id', async (c) => {
    const sessionId = c.req.param('id')
    if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
      return c.json({ error: 'Invalid session id format.' }, 400)
    }

    const filePath = await findSessionFile(sessionId, config, sessionCache)
    if (!filePath) {
      return c.json({ error: 'Session not found.' }, 404)
    }

    try {
      const text = await readFile(filePath, 'utf-8')
      return c.json({ sessionId, path: filePath, text })
    } catch {
      return c.json({ error: 'Session file missing.' }, 404)
    }
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
    if (!(await fileExists(filePath))) {
      return c.json({ error: 'Backup not found.' }, 404)
    }

    try {
      const text = await readFile(filePath, 'utf-8')
      return c.json({ sessionId, backup, text })
    } catch {
      return c.json({ error: 'Backup not found.' }, 404)
    }
  })

  app.get('/api/sessions', async (c) => {
    const limit = Number(c.req.query('limit') ?? 120)
    const files = await listSessionFiles(config.roots, config.maxDepth, limit)
    return c.json({ sessions: files })
  })

  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.get('*', async (c) => {
    try {
      const html = await readFile('./dist/index.html', 'utf-8')
      return c.html(html)
    } catch {
      return c.text('Build not found. Run `npm run build` first.', 404)
    }
  })

  return app
}

export async function loadConfig(): Promise<SpectatorConfig> {
  try {
    await access('./spectator.config.json')
  } catch {
    return defaultConfig
  }

  try {
    const parsed = JSON.parse(await readFile('./spectator.config.json', 'utf-8')) as Partial<
      SpectatorConfig
    >
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

async function findSessionFile(
  sessionId: string,
  config: SpectatorConfig,
  sessionCache: Map<string, string>,
): Promise<string | null> {
  const cached = sessionCache.get(sessionId)
  if (cached) {
    return cached
  }

  const target = `${sessionId}.jsonl`
  for (const root of config.roots) {
    const direct = join(root, target)
    if (await fileExists(direct)) {
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

  const entries = await readDirents(directory)
  if (!entries.length) {
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

  const entries = await readDirents(directory)
  if (!entries.length) {
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

async function readDirents(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function serveStatic(options: { root: string }) {
  return baseServeStatic({
    ...options,
    join,
    getContent: async (path) => {
      try {
        return await readFile(path)
      } catch {
        return null
      }
    },
    isDir: async (path) => {
      try {
        const stats = await stat(path)
        return stats.isDirectory()
      } catch {
        return undefined
      }
    },
  })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  startServer()
    .then(({ port }) => {
      console.log(`Spectator running at http://localhost:${port}`)
    })
    .catch((error) => {
      console.error('Failed to start server:', error)
      process.exit(1)
    })
}
