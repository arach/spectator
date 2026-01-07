#!/usr/bin/env node
import open from 'open'
import { createServer } from 'node:net'
import { loadConfig, startServer } from './server.js'

const fallbackPort = 8787
const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i]
  if (!value) {
    continue
  }
  if (value.startsWith('--')) {
    const [key, next] = value.split('=')
    if (next !== undefined) {
      args.set(key, next)
    } else if (process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) {
      args.set(value, process.argv[i + 1])
      i += 1
    } else {
      args.set(value, 'true')
    }
  } else if (value.startsWith('-') && process.argv[i + 1]) {
    args.set(value, process.argv[i + 1])
    i += 1
  }
}

const portArg = args.get('--port') ?? args.get('-p')
const config = await loadConfig()
const preferredPort = Number(portArg ?? process.env.PORT ?? config.port ?? fallbackPort)
const startPort = Number.isFinite(preferredPort) ? preferredPort : fallbackPort

const port = await findAvailablePort(startPort)
const { port: activePort } = await startServer({ port })
const url = `http://localhost:${activePort}`
console.log(`Spectator running at ${url}`)
await open(url)

async function findAvailablePort(start: number, tries = 10): Promise<number> {
  let port = start
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await isPortAvailable(port)) {
      return port
    }
    port += 1
  }
  throw new Error(`No available ports starting at ${start}`)
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => {
      tester.close(() => resolve(true))
    })
    tester.listen(port, '127.0.0.1')
  })
}
