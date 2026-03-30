import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import hljs from 'highlight.js'
import { useVirtualizer } from '@tanstack/react-virtual'
import { applyTheme, classicTheme, scoutTheme, type SpectatorThemeConfig } from './theme'

type ClaudeEntry = Record<string, unknown>

type EntryCategory =
  | 'message'
  | 'tool'
  | 'summary'
  | 'snapshot'
  | 'system'
  | 'queue'
  | 'progress'
  | 'other'
  | 'error'

type ParsedEntry = {
  id: string
  raw: string
  data?: ClaudeEntry
  error?: string
  category: EntryCategory
  timestamp?: string
  timestampMs?: number
  role?: string
}

type SessionStats = {
  totalEntries: number
  messageCount: number
  toolCount: number
  errorCount: number
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  models: string[]
  durationMs: number
  customTitle?: string
  lastPrompt?: string
}

type SessionResponse = {
  sessionId: string
  path: string
  text: string
  entries?: ParsedEntry[]
}

type SessionListResponse = {
  sessions: SessionFile[]
}

type SessionSource = 'disk' | 'local' | 'path'

type SessionListing = {
  id: string
  path: string
  project: string
  projectSlug: string
  mtimeMs: number
  size: number
  source: SessionSource
}

type SessionGroup = {
  project: string
  projectSlug: string
  latestMtime: number
  sessions: SessionListing[]
}

type ProjectNode = {
  id: string
  name: string
  path: string
  latestMtime: number
  sessionsCount: number
  projectSlug?: string
  children: ProjectNode[]
}

type SessionFile = {
  path: string
  mtimeMs: number
  size: number
}

type LocalSessionState = {
  sessions: SessionListing[]
  files: Record<string, File>
}

type LocalSessionContextValue = {
  sessions: SessionListing[]
  files: Record<string, File>
  addFiles: (files: File[]) => void
  clearFiles: () => void
}

type WebkitDirectoryInputProps = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string
}

type FileBackupInfo = {
  filePath: string
  backupFileName: string
  version: number
  backupTime?: string
}

type FileHistoryIndex = Record<string, FileBackupInfo[]>

type DiffLine = {
  type: 'added' | 'removed' | 'context'
  content: string
}

type TaggedUserMessage =
  | {
      kind: 'command'
      commandName: string
      commandArgs?: string
      commandMessage?: string
    }
  | {
      kind: 'local-command'
      stdout: string
    }
  | {
      kind: 'text'
      content: string
    }

type SortMode = 'recent' | 'oldest' | 'name'
const SORT_OPTIONS: { label: string; value: SortMode }[] = [
  { label: 'Most recent', value: 'recent' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Session id', value: 'name' },
]

const ALL_CATEGORIES: EntryCategory[] = [
  'message',
  'tool',
  'summary',
  'snapshot',
  'system',
  'queue',
  'progress',
  'other',
  'error',
]

const PREVIEW_LINE_LIMIT = 10
/* minimap legend removed — using phase outline */

const SAMPLE_SESSIONS: SessionListing[] = [
  {
    id: 'atlas-quick-brief',
    path: 'samples/-atlas-pulse/quick-brief.jsonl',
    project: 'Atlas/Pulse',
    projectSlug: 'atlas-pulse',
    mtimeMs: Date.now() - 1000 * 60 * 45,
    size: 48210,
    source: 'disk',
  },
  {
    id: 'atlas-pulse-review',
    path: 'samples/-atlas-pulse/pulse-review.jsonl',
    project: 'Atlas/Pulse',
    projectSlug: 'atlas-pulse',
    mtimeMs: Date.now() - 1000 * 60 * 60 * 4,
    size: 29120,
    source: 'disk',
  },
  {
    id: 'atlas-roadmap',
    path: 'samples/-atlas-labs/roadmap-session.jsonl',
    project: 'Atlas/Labs',
    projectSlug: 'atlas-labs',
    mtimeMs: Date.now() - 1000 * 60 * 60 * 9,
    size: 78152,
    source: 'disk',
  },
  {
    id: 'atlas-labs-brief',
    path: 'samples/-atlas-labs/briefing.jsonl',
    project: 'Atlas/Labs',
    projectSlug: 'atlas-labs',
    mtimeMs: Date.now() - 1000 * 60 * 60 * 12,
    size: 24598,
    source: 'disk',
  },
  {
    id: 'nimbus-orbits',
    path: 'samples/-nimbus-studio/orbits.jsonl',
    project: 'Nimbus/Studio/Orbits',
    projectSlug: 'nimbus-orbits',
    mtimeMs: Date.now() - 1000 * 60 * 60 * 20,
    size: 90612,
    source: 'disk',
  },
  {
    id: 'nimbus-trace',
    path: 'samples/-nimbus-studio/trace.jsonl',
    project: 'Nimbus/Studio/Trace',
    projectSlug: 'nimbus-trace',
    mtimeMs: Date.now() - 1000 * 60 * 60 * 30,
    size: 51702,
    source: 'disk',
  },
  {
    id: 'northwind-relay',
    path: 'samples/-northwind/relay.jsonl',
    project: 'Northwind/Relay',
    projectSlug: 'northwind-relay',
    mtimeMs: Date.now() - 1000 * 60 * 60 * 42,
    size: 33480,
    source: 'disk',
  },
]

type Theme = 'classic' | 'scout'

const THEME_KEY = 'spectator-theme'

const THEMES: Record<Theme, SpectatorThemeConfig> = {
  classic: classicTheme,
  scout: scoutTheme,
}

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || 'classic'
    } catch {
      return 'classic'
    }
  })

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {}
  }, [])

  useEffect(() => {
    if (theme === 'scout') {
      document.documentElement.setAttribute('data-theme', 'scout')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    applyTheme(THEMES[theme])
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(theme === 'classic' ? 'scout' : 'classic')
  }, [theme, setTheme])

  return { theme, toggle }
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'classic',
  toggle: () => {},
})

function useThemeContext() {
  return useContext(ThemeContext)
}

const LocalSessionContext = createContext<LocalSessionContextValue | null>(null)

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

function useLocalSessions() {
  const value = useContext(LocalSessionContext)
  if (!value) {
    throw new Error('LocalSessionContext is missing')
  }
  return value
}

function App() {
  const themeValue = useTheme()
  const [localState, setLocalState] = useState<LocalSessionState>({
    sessions: [],
    files: {},
  })

  const addFiles = useCallback((files: File[]) => {
    setLocalState((current) => mergeLocalFiles(current, files))
  }, [])

  const clearFiles = useCallback(() => {
    setLocalState({ sessions: [], files: {} })
  }, [])

  const localValue = useMemo(
    () => ({
      sessions: localState.sessions,
      files: localState.files,
      addFiles,
      clearFiles,
    }),
    [localState.sessions, localState.files, addFiles, clearFiles],
  )

  return (
    <ThemeContext.Provider value={themeValue}>
      <LocalSessionContext.Provider value={localValue}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/s/:sessionId" element={<SessionPage source="disk" />} />
          <Route path="/local/:sessionId" element={<SessionPage source="local" />} />
          <Route path="/session" element={<SessionPage source="path" />} />
        </Routes>
      </LocalSessionContext.Provider>
    </ThemeContext.Provider>
  )
}

function Home() {
  const [sessionId, setSessionId] = useState('')
  const [sessions, setSessions] = useState<SessionListing[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [projectQuery, setProjectQuery] = useState('')
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [sessionSource, setSessionSource] = useState<SessionSource>('disk')
  const [isDragging, setIsDragging] = useState(false)
  const [installCopied, setInstallCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const { sessions: localSessions, addFiles, clearFiles } = useLocalSessions()

  async function loadSessions() {
    setSessionsLoading(true)
    setSessionsError(null)
    try {
      const response = await fetch('/api/sessions?limit=120')
      if (!response.ok) {
        throw new Error(`Failed to load sessions (${response.status})`)
      }
      const json = (await response.json()) as SessionListResponse
      setSessions(json.sessions.map(toSessionListing))
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const isHosted =
    typeof window !== 'undefined' && !LOCAL_HOSTS.has(window.location.hostname)
  const isDemoMode =
    sessionSource === 'disk' && isHosted && !!sessionsError && sessions.length === 0

  const activeSessions =
    sessionSource === 'local' ? localSessions : isDemoMode ? SAMPLE_SESSIONS : sessions
  const activeLoading = sessionSource === 'disk' ? (isDemoMode ? false : sessionsLoading) : false
  const activeError = sessionSource === 'disk' ? (isDemoMode ? null : sessionsError) : null

  const projectGroups = useMemo(() => {
    return groupSessions(activeSessions, 'recent')
  }, [activeSessions])

  const projectTree = useMemo(() => buildProjectTree(projectGroups), [projectGroups])

  const filteredProjectTree = useMemo(() => {
    return filterProjectTree(projectTree, projectQuery)
  }, [projectTree, projectQuery])

  const scopedSessions = useMemo(() => {
    const filtered = selectedProjectPath
      ? activeSessions.filter((session) => isSessionInProject(session, selectedProjectPath))
      : activeSessions
    return sortSessions(filtered, sortMode)
  }, [activeSessions, selectedProjectPath, sortMode])

  useEffect(() => {
    if (!selectedProjectPath) {
      return
    }
    if (!activeSessions.some((session) => isSessionInProject(session, selectedProjectPath))) {
      setSelectedProjectPath(null)
    }
  }, [activeSessions, selectedProjectPath])

  useEffect(() => {
    setSelectedProjectPath(null)
  }, [sessionSource])

  const handleLocalFiles = (files: File[]) => {
    const jsonlFiles = files.filter(isJsonlFile)
    if (!jsonlFiles.length) {
      return
    }
    addFiles(jsonlFiles)
    setSessionSource('local')
  }

  const folderInputProps: WebkitDirectoryInputProps = {
    type: 'file',
    accept: '.jsonl',
    multiple: true,
    webkitdirectory: '',
    className: 'sr-only',
    onChange: (event) => {
      if (event.target.files) {
        handleLocalFiles(Array.from(event.target.files))
      }
      event.currentTarget.value = ''
    },
  }

  const sessionScopeLabel = selectedProjectPath ? selectedProjectPath : 'all projects'
  const projectDiscoveryCopy =
    sessionSource === 'local'
      ? 'Showing local imports. Drop JSONL files or pick a folder to browse.'
      : isDemoMode
        ? 'Sample projects are shown for the hosted preview. Run locally to load your own logs.'
      : 'Projects are grouped by path and sorted by recent activity.'
  const sessionListCopy =
    sessionSource === 'local'
      ? `Local imports are scoped to ${sessionScopeLabel}. Select a project above to filter.`
      : isDemoMode
        ? 'Demo sessions are shown so you can explore the UI before connecting your own logs.'
      : `Sessions are read from your configured roots and scoped to ${sessionScopeLabel}. Select a project above to filter.`

  const homeModeTone = sessionSource === 'local' ? 'local' : isDemoMode ? 'demo' : 'live'
  const homeModeLabel =
    sessionSource === 'local' ? 'Local imports' : isDemoMode ? 'Demo data' : 'Live data'
  const homeModeCopy =
    sessionSource === 'local'
      ? 'Files are read in your browser tab and never uploaded.'
      : isDemoMode
        ? 'Sample sessions are shown for the hosted preview. Run locally to load your own logs.'
      : 'Sessions are read from your configured roots on this machine.'

  const installCommand =
    'git clone https://github.com/arach/spectator.git && cd spectator && bun install && bun run build && bun run start'

  const copyInstallCommand = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(installCommand)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = installCommand
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setInstallCopied(true)
      window.setTimeout(() => setInstallCopied(false), 1600)
    } catch {
      setInstallCopied(false)
    }
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">o</span>
            <span className="brand-name">Spectator</span>
            <span className="brand-sub">Log Viewer</span>
          </div>
        </div>
      </header>
      <ThemeToggle />
      <main className="home">
        <section className="home-intro">
          <div className="section-header intro-copy">
            <p className="eyebrow">Spectator</p>
            <h1>Replay Claude sessions locally, with shareable anchors.</h1>
            <p className="muted">
              Spectator turns Claude JSONL into a searchable timeline and project tree so teams can
              review runs, inspect raw events, and jump to exact moments.
            </p>
          </div>
          <div className="home-status">
            <p className="eyebrow">Viewing</p>
            <span className={`status-pill ${homeModeTone}`}>{homeModeLabel}</span>
            <p className="muted">{homeModeCopy}</p>
          </div>
        </section>
        <div className="home-split">
          <section className="hero">
            <div className="hero-card">
              <div className="panel-header">
                <p className="eyebrow">Start with a session</p>
                <h2>Open a session instantly from disk.</h2>
                <p className="hero-copy">
                  Paste a session id or open a deep link. Spectator renders Claude JSONL into a
                  clean, filterable timeline.
                </p>
              </div>
              <form
                className="session-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  const trimmed = sessionId.trim()
                  if (trimmed) {
                    navigate(sessionSource === 'local' ? `/local/${trimmed}` : `/s/${trimmed}`)
                  }
                }}
              >
                <input
                  type="text"
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                  placeholder="Session id (e.g. 4f3ede63-63c3-4c18-911b-dfe1c234c30f)"
                />
                <button type="submit">Open</button>
              </form>
              <div className="hint">
                <span>Direct URL:</span>
                <code>/s/&lt;session-id&gt;</code>
              </div>
              <div
                className={`import-panel${isDragging ? ' active' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  handleLocalFiles(Array.from(event.dataTransfer.files))
                }}
              >
                <div className="import-header">
                  <p className="eyebrow">Local imports</p>
                  <h3>Drop JSONL sessions to explore</h3>
                  <p className="muted">
                    Files stay on your machine. Import a folder to mirror your project tree.
                  </p>
                </div>
                <div className="drop-zone">
                  <p>Drop .jsonl files here</p>
                  <div className="drop-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose files
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => folderInputRef.current?.click()}
                    >
                      Choose folder
                    </button>
                  </div>
                </div>
                {localSessions.length ? (
                  <div className="import-meta">
                    <span>{localSessions.length} local sessions ready.</span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => clearFiles()}
                    >
                      Clear imports
                    </button>
                  </div>
                ) : (
                  <p className="muted">Imports stay available until this page reloads.</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jsonl"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    if (event.target.files) {
                      handleLocalFiles(Array.from(event.target.files))
                    }
                    event.currentTarget.value = ''
                  }}
                />
                <input ref={folderInputRef} {...folderInputProps} />
              </div>
            </div>
          </section>
          <section className="project-discovery">
            <div className="discovery-panel">
              <div className="panel-header">
                <p className="eyebrow">Project tree</p>
                <h2>Navigate by project hierarchy</h2>
                <p className="muted">{projectDiscoveryCopy}</p>
              </div>
              <label className="discovery-search">
                <span>Search Projects</span>
                <input
                  type="text"
                  value={projectQuery}
                  onChange={(event) => setProjectQuery(event.target.value)}
                  placeholder="Search by project name or path"
                />
              </label>
              <div className="project-tree-shell">
                {activeLoading ? (
                  <div className="empty-state compact">Loading projects...</div>
                ) : activeError ? (
                  <div className="empty-state error">{activeError}</div>
                ) : filteredProjectTree.length ? (
                  <ProjectTree
                    nodes={filteredProjectTree}
                    selectedPath={selectedProjectPath}
                    onSelect={(path) => {
                      setSelectedProjectPath(path)
                    }}
                  />
                ) : (
                  <div className="empty-state">No projects match this search.</div>
                )}
              </div>
            </div>
          </section>
        </div>
        <section className="landing">
          <div className="section-header landing-header">
            <p className="eyebrow">Why Spectator</p>
            <h2>Fast session review that stays local.</h2>
            <p className="muted">
              Searchable timelines, project grouping, and shareable anchors for Claude logs without
              uploads or sync.
            </p>
          </div>
          <div className="landing-grid">
            <div className="landing-card">
              <h3>Local-first by default</h3>
              <p>
                Sessions stay on disk or in your browser tab. No uploads, no hidden sync.
              </p>
            </div>
            <div className="landing-card">
              <h3>Project discovery</h3>
              <p>
                Browse by project tree with the most recent activity surfaced first.
              </p>
            </div>
            <div className="landing-card">
              <h3>Replay & inspect</h3>
              <p>Scan events, pin anchors, and inspect raw JSON in one place.</p>
            </div>
            <div className="landing-card">
              <h3>Shareable anchors</h3>
              <p>Every entry has its own URL so teammates can jump to the same moment.</p>
            </div>
          </div>
          <div className="install-card">
            <div className="install-header">
              <div>
                <p className="eyebrow">Install</p>
                <h3>Run locally in seconds</h3>
                <p className="muted">
                  Spectator runs entirely on your machine and opens in your browser.
                </p>
              </div>
              <button
                type="button"
                className="ghost-button copy-button"
                onClick={copyInstallCommand}
              >
                {installCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre>
              <code>{installCommand}</code>
            </pre>
            <p className="muted">
              Configure roots in <code>spectator.config.json</code> or import JSONL files on the
              spot.
            </p>
          </div>
        </section>
        <section className="session-list">
          <div className="session-list-header">
            <div className="section-header session-list-intro">
              <p className="eyebrow">Session Library</p>
              <h2>Browse by session</h2>
              <p className="muted">{sessionListCopy}</p>
              {selectedProjectPath ? (
                <div className="session-scope">
                  <span className="scope-pill">Project: {selectedProjectPath}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSelectedProjectPath(null)}
                  >
                    Clear filter
                  </button>
                </div>
              ) : null}
            </div>
            <div className="session-controls">
              <div className="source-toggle" role="group" aria-label="Session source">
                <button
                  type="button"
                  className={
                    sessionSource === 'disk' ? 'source-button active' : 'source-button'
                  }
                  onClick={() => setSessionSource('disk')}
                >
                  Configured roots
                </button>
                <button
                  type="button"
                  className={
                    sessionSource === 'local' ? 'source-button active' : 'source-button'
                  }
                  onClick={() => setSessionSource('local')}
                >
                  Local imports ({localSessions.length})
                </button>
              </div>
              <label className="sort-control">
                <span>Sort</span>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {sessionSource === 'disk' ? (
                <button type="button" className="ghost-button" onClick={loadSessions}>
                  Refresh
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => clearFiles()}
                >
                  Clear imports
                </button>
              )}
            </div>
          </div>
          {activeLoading ? (
            <div className="empty-state">Loading sessions...</div>
          ) : activeError ? (
            <div className="empty-state error">{activeError}</div>
          ) : scopedSessions.length ? (
            <div className="session-grid">
              {scopedSessions.map((session) => {
                const content = (
                  <>
                    <div>
                      <p className="session-id">{session.id}</p>
                      <p className="session-meta-line">
                        {session.project} | Updated {formatDateTime(session.mtimeMs)} |{' '}
                        {formatBytes(session.size)}
                      </p>
                    </div>
                    <span className="session-link">{isDemoMode ? 'Demo' : 'Open'}</span>
                  </>
                )
                return isDemoMode ? (
                  <div key={session.id} className="session-row demo">
                    {content}
                  </div>
                ) : (
                  <Link
                    key={session.id}
                    to={
                      session.source === 'local' ? `/local/${session.id}` : `/s/${session.id}`
                    }
                    className="session-row"
                  >
                    {content}
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              {selectedProjectPath
                ? 'No sessions found for this project yet.'
                : sessionSource === 'local'
                  ? 'Drop JSONL files or pick a folder to get started.'
                  : 'No sessions found yet.'}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useThemeContext()
  return (
    <button type="button" className="theme-toggle" onClick={toggle}>
      {theme === 'classic' ? 'Scout' : 'Classic'}
    </button>
  )
}

const CONFIG_SECTIONS: { label: string; keys: { key: string; varName: string; type: 'color' | 'size' | 'text' }[] }[] = [
  {
    label: 'Colors',
    keys: [
      { key: 'ink', varName: '--ink', type: 'color' },
      { key: 'muted', varName: '--muted', type: 'color' },
      { key: 'paper', varName: '--paper', type: 'color' },
      { key: 'card', varName: '--card', type: 'color' },
      { key: 'surface', varName: '--surface', type: 'color' },
      { key: 'accent', varName: '--accent', type: 'color' },
      { key: 'accent-2', varName: '--accent-2', type: 'color' },
      { key: 'accent-3', varName: '--accent-3', type: 'color' },
      { key: 'code-bg', varName: '--code-bg', type: 'color' },
      { key: 'code-fg', varName: '--code-fg', type: 'color' },
      { key: 'terminal-bg', varName: '--terminal-bg', type: 'color' },
      { key: 'terminal-fg', varName: '--terminal-fg', type: 'color' },
    ],
  },
  {
    label: 'Categories',
    keys: [
      { key: 'cat-message', varName: '--cat-message', type: 'color' },
      { key: 'cat-tool', varName: '--cat-tool', type: 'color' },
      { key: 'cat-summary', varName: '--cat-summary', type: 'color' },
      { key: 'cat-snapshot', varName: '--cat-snapshot', type: 'color' },
      { key: 'cat-system', varName: '--cat-system', type: 'color' },
      { key: 'cat-error', varName: '--cat-error', type: 'color' },
    ],
  },
  {
    label: 'Spacing',
    keys: [
      { key: 'entry-gap', varName: '--entry-gap', type: 'size' },
      { key: 'entry-font-size', varName: '--entry-font-size', type: 'size' },
      { key: 'rail', varName: '--rail', type: 'size' },
      { key: 'content-width', varName: '--content-width', type: 'size' },
    ],
  },
  {
    label: 'Radii',
    keys: [
      { key: 'radius-xs', varName: '--radius-xs', type: 'size' },
      { key: 'radius-sm', varName: '--radius-sm', type: 'size' },
      { key: 'radius-md', varName: '--radius-md', type: 'size' },
      { key: 'radius-lg', varName: '--radius-lg', type: 'size' },
      { key: 'radius-xl', varName: '--radius-xl', type: 'size' },
    ],
  },
  {
    label: 'Typography',
    keys: [
      { key: 'font-sans', varName: '--font-sans', type: 'text' },
      { key: 'font-mono', varName: '--font-mono', type: 'text' },
      { key: 'text-xs', varName: '--text-xs', type: 'size' },
      { key: 'text-sm', varName: '--text-sm', type: 'size' },
      { key: 'text-base', varName: '--text-base', type: 'size' },
      { key: 'text-md', varName: '--text-md', type: 'size' },
    ],
  },
  {
    label: 'Animation',
    keys: [
      { key: 'duration-fast', varName: '--duration-fast', type: 'size' },
      { key: 'duration-normal', varName: '--duration-normal', type: 'size' },
      { key: 'duration-slow', varName: '--duration-slow', type: 'size' },
    ],
  },
  {
    label: 'Dot Pattern',
    keys: [
      { key: 'dot-size', varName: '--dot-size', type: 'size' },
      { key: 'dot-color', varName: '--dot-color', type: 'color' },
      { key: 'dot-opacity', varName: '--dot-opacity', type: 'size' },
    ],
  },
]

// Map CSS var names to the config keys that reference them
const ALL_VAR_NAMES = CONFIG_SECTIONS.flatMap((s) => s.keys.map((k) => k.varName))

function resolveVarsForElement(el: Element): string[] {
  const computed = getComputedStyle(el)
  const matched: string[] = []
  // Check which of our theme vars are actively used by this element
  // by inspecting its computed style values for references
  for (const varName of ALL_VAR_NAMES) {
    const val = computed.getPropertyValue(varName).trim()
    if (!val) continue
    // Check common properties that could use this var
    const relevantProps = [
      'color', 'background-color', 'background', 'border-color',
      'border', 'border-left-color', 'border-top-color',
      'font-family', 'font-size', 'border-radius',
      'padding', 'gap', 'box-shadow', 'opacity',
    ]
    for (const prop of relevantProps) {
      const propVal = computed.getPropertyValue(prop)
      if (propVal && propVal.includes(val)) {
        matched.push(varName)
        break
      }
    }
  }
  // Also add vars that match the element's actual computed colors
  const bg = computed.backgroundColor
  const fg = computed.color
  const fontSize = computed.fontSize
  const borderColor = computed.borderColor
  for (const section of CONFIG_SECTIONS) {
    for (const item of section.keys) {
      const v = computed.getPropertyValue(item.varName).trim()
      if (!v) continue
      if (item.type === 'color') {
        if (bg.includes(v) || fg.includes(v) || borderColor.includes(v)) {
          if (!matched.includes(item.varName)) matched.push(item.varName)
        }
      }
      if (item.type === 'size' && fontSize === v) {
        if (!matched.includes(item.varName)) matched.push(item.varName)
      }
    }
  }
  return matched
}

function ConfigPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, toggle } = useThemeContext()
  const [, forceUpdate] = useState(0)
  const [picking, setPicking] = useState(false)
  const [pickedVars, setPickedVars] = useState<string[] | null>(null)
  const [pickedSelector, setPickedSelector] = useState<string>('')

  // Picker mode — runs even when panel is "closed" during picking
  useEffect(() => {
    if (!picking) return

    let hoveredEl: Element | null = null
    const highlight = document.createElement('div')
    highlight.className = 'picker-highlight'
    document.body.appendChild(highlight)

    const onMove = (e: MouseEvent) => {
      const target = e.target as Element
      if (target === highlight || target.closest('.picker-highlight')) return
      hoveredEl = target
      const rect = target.getBoundingClientRect()
      highlight.style.top = `${rect.top}px`
      highlight.style.left = `${rect.left}px`
      highlight.style.width = `${rect.width}px`
      highlight.style.height = `${rect.height}px`
      highlight.style.display = 'block'
    }

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      const el = hoveredEl
      if (!el) { setPicking(false); return }
      const tag = el.tagName.toLowerCase()
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
        : ''
      setPickedSelector(`${tag}${cls}`)
      const vars = resolveVarsForElement(el)
      setPickedVars(vars.length ? vars : null)
      setPicking(false)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPicking(false)
      }
    }

    // Small delay so the click that started pick mode doesn't immediately fire
    const timer = setTimeout(() => {
      document.addEventListener('mousemove', onMove, true)
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKey, true)
    }, 100)

    document.body.style.cursor = 'crosshair'

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
      highlight.remove()
      document.body.style.cursor = ''
    }
  }, [picking])

  // When picking, hide the panel so user can click the page
  if (picking) {
    return null
  }

  if (!open) return null

  const root = document.documentElement

  const getValue = (varName: string) =>
    getComputedStyle(root).getPropertyValue(varName).trim()

  const setValue = (varName: string, value: string) => {
    root.style.setProperty(varName, value)
    forceUpdate((n) => n + 1)
  }

  const isHighlighted = (varName: string) =>
    pickedVars ? pickedVars.includes(varName) : false

  // Filter sections to show picked vars first, or all if nothing picked
  const filteredSections = pickedVars
    ? CONFIG_SECTIONS.map((section) => ({
        ...section,
        keys: section.keys.filter((k) => pickedVars.includes(k.varName)),
      })).filter((s) => s.keys.length > 0)
    : CONFIG_SECTIONS

  return (
    <div className="config-overlay" onClick={onClose}>
      <div className="config-panel" onClick={(e) => e.stopPropagation()}>
        <div className="config-header">
          <p className="eyebrow">Visual Config</p>
          <div className="config-header-actions">
            <button
              type="button"
              className={`config-pick-btn${picking ? ' active' : ''}`}
              onClick={() => { setPicking(true); setPickedVars(null); setPickedSelector('') }}
              title="Pick an element to inspect its tokens"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
              </svg>
            </button>
            <button type="button" className="config-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        {pickedVars && (
          <div className="config-picked">
            <span className="config-picked-label">{pickedSelector}</span>
            <button type="button" className="config-picked-clear" onClick={() => { setPickedVars(null); setPickedSelector('') }}>
              Show all
            </button>
          </div>
        )}

        <div className="config-theme-row">
          <span>Theme</span>
          <button type="button" className="config-theme-btn" onClick={toggle}>
            {theme === 'classic' ? 'Classic' : 'Scout'}
          </button>
        </div>

        <div className="config-sections">
          {filteredSections.map((section) => (
            <div key={section.label} className="config-section">
              <p className="config-section-label">{section.label}</p>
              {section.keys.map((item) => {
                const current = getValue(item.varName)
                const highlighted = isHighlighted(item.varName)
                return (
                  <div key={item.key} className={`config-row${highlighted ? ' highlighted' : ''}`}>
                    <label className="config-key">{item.key}</label>
                    {item.type === 'color' ? (
                      <div className="config-color-input">
                        <input
                          type="color"
                          value={current.startsWith('#') ? current : '#000000'}
                          onChange={(e) => setValue(item.varName, e.target.value)}
                        />
                        <input
                          type="text"
                          value={current}
                          onChange={(e) => setValue(item.varName, e.target.value)}
                          className="config-text-input"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={current}
                        onChange={(e) => setValue(item.varName, e.target.value)}
                        className="config-text-input"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SessionPage({ source }: { source: SessionSource }) {
  const { sessionId: paramSessionId } = useParams()
  const [searchParams] = useSearchParams()
  const pathParam = source === 'path' ? searchParams.get('path') : null
  const sessionId = source === 'path'
    ? (pathParam?.split('/').pop()?.replace(/\.jsonl$/i, '') ?? pathParam ?? '')
    : paramSessionId
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [densityAuto] = useState(true)
  const [showMiniMap] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [filters, setFilters] = useState<EntryCategory[]>([
    'message',
    'tool',
    'summary',
    'system',
    'queue',
  ])
  const { sessions: localSessions, files: localFiles } = useLocalSessions()

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    async function load() {
      if (!sessionId && !pathParam) {
        return
      }
      setLoading(true)
      setError(null)
      try {
        if (source === 'local') {
          const file = localFiles[sessionId!]
          if (!file) {
            throw new Error('Local session not found. Re-import the JSONL file.')
          }
          const text = await file.text()
          const path = localSessions.find((item) => item.id === sessionId)?.path ?? file.name
          if (!ignore) {
            setSession({ sessionId: sessionId!, path, text })
          }
        } else if (source === 'path' && pathParam) {
          const response = await fetch(`/api/session-by-path?path=${encodeURIComponent(pathParam)}`, {
            signal: controller.signal,
          })
          if (!response.ok) {
            throw new Error(`Failed to load session (${response.status})`)
          }
          const json = (await response.json()) as SessionResponse
          if (!ignore) {
            setSession(json)
          }
        } else {
          const response = await fetch(`/api/session/${sessionId}`, {
            signal: controller.signal,
          })
          if (!response.ok) {
            throw new Error(`Failed to load session (${response.status})`)
          }
          const json = (await response.json()) as SessionResponse
          if (!ignore) {
            setSession(json)
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load session')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      ignore = true
      controller.abort()
    }
  }, [sessionId, source, localFiles, localSessions])

  const entries = useMemo(() => session?.entries && Array.isArray(session.entries) ? session.entries : parseClaudeJsonl(session?.text ?? ''), [session]);
  const toolUseLookup = useMemo(() => buildToolUseLookup(entries), [entries])
  const fileHistoryIndex = useMemo(() => buildFileHistoryIndex(entries), [entries])
  const sessionStats = useMemo(() => computeSessionStats(entries), [entries])
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const timelineRef = useRef<VirtualTimelineHandle | null>(null)

  const selectEntry = useCallback((entryId: string, options?: { scroll?: boolean }) => {
    setSelectedId(entryId)
    const domId = entryDomId(entryId)
    const nextHash = `#${domId}`
    if (window.location.hash !== nextHash) {
      const url = `${window.location.pathname}${window.location.search}${nextHash}`
      window.history.replaceState(null, '', url)
    }
    if (options?.scroll) {
      if (timelineRef.current) {
        timelineRef.current.scrollToEntryId(entryId)
      } else {
        scrollToEntry(entryId)
      }
    }
  }, [])

  useEffect(() => {
    if (!entries.length) {
      setSelectedId(null)
      return
    }
    const hash = window.location.hash.replace(/^#/, '')
    if (hash) {
      const match = entries.find((entry) => entryDomId(entry.id) === hash)
      if (match) {
        if (selectedId !== match.id) {
          setSelectedId(match.id)
          scrollToEntry(match.id)
        }
        return
      }
    }
    if (!selectedId || !entries.find((entry) => entry.id === selectedId)) {
      setSelectedId(entries[0]?.id ?? null)
    }
  }, [entries, selectedId])

  useEffect(() => {
    if (!densityAuto) {
      return
    }
    const media = window.matchMedia('(max-width: 720px)')
    const applyDensity = (matches: boolean) => {
      setDensity(matches ? 'compact' : 'comfortable')
    }
    applyDensity(media.matches)
    const handler = (event: MediaQueryListEvent) => {
      if (densityAuto) {
        applyDensity(event.matches)
      }
    }
    if (media.addEventListener) {
      media.addEventListener('change', handler)
    } else {
      media.addListener(handler)
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', handler)
      } else {
        media.removeListener(handler)
      }
    }
  }, [densityAuto])

  const filteredEntries = useMemo(() => {
    const active = filters.length ? new Set(filters) : new Set(ALL_CATEGORIES)
    let result = entries.filter((entry) => active.has(entry.category))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((entry) => {
        const raw = entry.raw.toLowerCase()
        return raw.includes(q)
      })
    }
    return result
  }, [entries, filters, searchQuery])

  const selectedEntry = entries.find((entry) => entry.id === selectedId)
  const showMiniMapColumn = showMiniMap && !loading && !error && filteredEntries.length > 0

  // Keyboard navigation
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isInput) {
        if (event.key === 'Escape') {
          target.blur()
          event.preventDefault()
        }
        return
      }
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault()
        const currentIndex = filteredEntries.findIndex((e) => e.id === selectedId)
        const nextIndex = event.key === 'j'
          ? Math.min(currentIndex + 1, filteredEntries.length - 1)
          : Math.max(currentIndex - 1, 0)
        if (filteredEntries[nextIndex]) {
          selectEntry(filteredEntries[nextIndex].id, { scroll: true })
        }
      }
      if (event.key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key === 'Escape') {
        setSearchQuery('')
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filteredEntries, selectedId, selectEntry])

  return (
    <div className={`page-shell session-page density-${density}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">o</span>
            <span className="brand-name">Spectator</span>
          </Link>
          <div className="session-title-bar">
            <h2 className="session-title">{sessionStats.customTitle || sessionId}</h2>
            <span className="session-stats-inline">
              {entries.length} entries
              {sessionStats.durationMs > 0 ? ` · ${formatDuration(sessionStats.durationMs)}` : ''}
              {sessionStats.inputTokens + sessionStats.outputTokens > 0
                ? ` · ${formatTokenCount(sessionStats.inputTokens + sessionStats.outputTokens)} tok`
                : ''}
            </span>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="config-button"
              onClick={() => setShowConfig((v) => !v)}
              title="Visual config"
            >
              Config
            </button>
          </div>
        </div>
      </header>
      <main className="workspace session-workspace">
        {showMiniMapColumn ? (
          <aside className="section-panel outline-column">
            <div className="section-panel-header">
              <p className="eyebrow">Outline</p>
              <span className="section-panel-count">{filteredEntries.length}</span>
            </div>
            <MiniMap
              entries={filteredEntries}
              selectedId={selectedId}
              onJump={(entryId) => {
                selectEntry(entryId, { scroll: true })
              }}
            />
          </aside>
        ) : null}
        <section className="section-panel activity-column">
          <div className="section-panel-header">
            <p className="eyebrow">Activity</p>
            <div className="section-panel-header-right">
              <div className="session-search">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="/ search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                {searchQuery ? (
                  <span className="search-count">{filteredEntries.length}</span>
                ) : null}
              </div>
              <span className="section-panel-count">{filteredEntries.length}{searchQuery ? ` / ${entries.length}` : ''}</span>
            </div>
          </div>
          <div className="section-panel-controls">
            <FilterBar
              filters={filters}
              onToggle={(category) => {
                setFilters((current) =>
                  current.includes(category)
                    ? current.filter((item) => item !== category)
                    : [...current, category],
                )
              }}
            />
          </div>
          <div className="section-panel-body activity-body">
            {loading ? (
              <div className="empty-state">Loading session...</div>
            ) : error ? (
              <div className="empty-state error">{error}</div>
            ) : filteredEntries.length ? (
              <VirtualTimeline
                entries={filteredEntries}
                selectedId={selectedId}
                onSelect={(id) => selectEntry(id)}
                toolUseLookup={toolUseLookup}
                fileHistoryIndex={fileHistoryIndex}
                sessionId={sessionId ?? ''}
                scrollRef={timelineRef}
              />
            ) : (
              <div className="empty-state">No entries match the current filters.</div>
            )}
          </div>
        </section>
        <aside className="section-panel inspector-column">
          <div className="section-panel-header">
            <p className="eyebrow">Inspector</p>
          </div>
          <div className="section-panel-body inspector-body">
            {selectedEntry ? (
              <>
                <div className="inspector-meta">
                  <div className="inspector-meta-row">
                    <span className="inspector-meta-label">Type</span>
                    <span className="inspector-meta-value">{String(selectedEntry.data?.type ?? selectedEntry.role ?? '—')}</span>
                  </div>
                  <div className="inspector-meta-row">
                    <span className="inspector-meta-label">Category</span>
                    <span className="inspector-meta-value">{selectedEntry.category}</span>
                  </div>
                  {selectedEntry.timestamp ? (
                    <div className="inspector-meta-row">
                      <span className="inspector-meta-label">Time</span>
                      <span className="inspector-meta-value">{selectedEntry.timestamp}</span>
                    </div>
                  ) : null}
                  {selectedEntry.data?.message ? (
                    <div className="inspector-meta-row">
                      <span className="inspector-meta-label">Role</span>
                      <span className="inspector-meta-value">{String((selectedEntry.data.message as Record<string, unknown>).role ?? '—')}</span>
                    </div>
                  ) : null}
                  <div className="inspector-meta-row">
                    <span className="inspector-meta-label">ID</span>
                    <a className="inspector-meta-value inspector-id-link" href={`#${entryDomId(selectedEntry.id)}`}>{selectedEntry.id.slice(0, 20)}</a>
                  </div>
                </div>
                <pre
                  className="inspector-json"
                  dangerouslySetInnerHTML={{
                    __html: highlightJson(prettyJson(selectedEntry.data ?? selectedEntry.raw)),
                  }}
                />
              </>
            ) : (
              <div className="empty-state compact">Select an entry to inspect.</div>
            )}
          </div>
        </aside>
      </main>
      <ConfigPanel open={showConfig} onClose={() => setShowConfig(false)} />
    </div>
  )
}

function FilterBar({
  filters,
  onToggle,
}: {
  filters: EntryCategory[]
  onToggle: (category: EntryCategory) => void
}) {
  return (
    <div className="filter-bar">
      {ALL_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          className={filters.includes(category) ? 'chip active' : 'chip'}
          onClick={() => onToggle(category)}
        >
          {category}
        </button>
      ))}
    </div>
  )
}

function ProjectTree({
  nodes,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  nodes: ProjectNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
  depth?: number
}) {
  const listClassName = depth === 0 ? 'project-tree-level root' : 'project-tree-level nested'
  return (
    <ul className={listClassName}>
      {nodes.map((node) => {
        const isActive = selectedPath === node.path
        const sessionLabel = node.sessionsCount === 1 ? 'session' : 'sessions'
        return (
          <li key={node.id} className={isActive ? 'project-node active' : 'project-node'}>
            <button
              type="button"
              className="project-node-button"
              onClick={() => onSelect(node.path)}
            >
              <span className="project-node-title">
                <span className="project-node-name">{node.name}</span>
                <span className="project-node-count">
                  {node.sessionsCount} {sessionLabel}
                </span>
              </span>
              <span className="project-node-meta">
                Updated {formatDateTime(node.latestMtime)}
              </span>
            </button>
            {node.children.length ? (
              <ProjectTree
                nodes={node.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

type VirtualTimelineHandle = {
  scrollToEntryId: (entryId: string) => void
}

function VirtualTimeline({
  entries,
  selectedId,
  onSelect,
  toolUseLookup,
  fileHistoryIndex,
  sessionId,
  scrollRef,
}: {
  entries: ParsedEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  toolUseLookup: ToolUseLookup
  fileHistoryIndex: FileHistoryIndex
  sessionId: string
  scrollRef?: React.MutableRefObject<VirtualTimelineHandle | null>
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const useVirtual = entries.length > 100

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => (useVirtual ? parentRef.current : null),
    estimateSize: () => 120,
    overscan: 10,
    enabled: useVirtual,
  })

  // Expose scroll method for outline navigation
  useEffect(() => {
    if (!scrollRef) return
    scrollRef.current = {
      scrollToEntryId: (entryId: string) => {
        if (useVirtual) {
          const index = entries.findIndex((e) => e.id === entryId)
          if (index >= 0) {
            virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' })
          }
        } else {
          scrollToEntry(entryId)
        }
      },
    }
  }, [entries, useVirtual, virtualizer, scrollRef])

  const renderItem = (entry: ParsedEntry, index: number) => {
    const prevEntry = index > 0 ? entries[index - 1] : null
    const nextEntry = index < entries.length - 1 ? entries[index + 1] : null
    const gap = prevEntry?.timestampMs && entry.timestampMs
      ? entry.timestampMs - prevEntry.timestampMs
      : 0
    const showGap = gap > 30_000
    const isUserTurn = entry.role === 'user' && entry.category === 'message'
    const nextIsUserTurn = nextEntry ? nextEntry.role === 'user' && nextEntry.category === 'message' : false
    const isLastInTurn = nextIsUserTurn || index === entries.length - 1

    return (
      <>
        {showGap ? (
          <div className="time-gap">
            <span className="time-gap-line" />
            <span className="time-gap-label">{formatDuration(gap)} later</span>
            <span className="time-gap-line" />
          </div>
        ) : null}
        <EventCard
          entry={entry}
          selected={entry.id === selectedId}
          onSelect={() => onSelect(entry.id)}
          toolUseLookup={toolUseLookup}
          fileHistoryIndex={fileHistoryIndex}
          sessionId={sessionId}
          isUserTurn={isUserTurn}
          isLastInTurn={isLastInTurn}
        />
      </>
    )
  }

  if (!useVirtual) {
    return (
      <div className="timeline-shell">
        <div className="timeline">
          {entries.map((entry, index) => (
            <div key={entry.id}>{renderItem(entry, index)}</div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={parentRef} className="timeline-shell timeline-virtual" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
      <div className="timeline" style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const entry = entries[virtualItem.index]
          return (
            <div
              key={entry.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(entry, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventCard({
  entry,
  selected,
  onSelect,
  toolUseLookup,
  fileHistoryIndex,
  sessionId,
  isUserTurn = false,
  isLastInTurn = false,
}: {
  entry: ParsedEntry
  selected: boolean
  onSelect: () => void
  toolUseLookup: ToolUseLookup
  fileHistoryIndex: FileHistoryIndex
  sessionId: string
  isUserTurn?: boolean
  isLastInTurn?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const role = entry.error ? 'error' : entry.role ?? String(entry.data?.type ?? 'entry')
  const timestamp = entry.timestamp ?? 'n/a'
  const pills = buildPills(entry, role)
  const domId = entryDomId(entry.id)
  const entryLink = `#${domId}`
  const tokens = extractEntryTokens(entry)
  const isSidechain = Boolean(entry.data?.isSidechain)
  const agentId = entry.data?.agentId as string | undefined

  const copyLink = async () => {
    onSelect()
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${entryLink}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = url
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article
      id={domId}
      className={`event-card${selected ? ' selected' : ''}${isSidechain ? ' sidechain' : ''}${isUserTurn ? ' turn-start' : ' turn-inner'}${isLastInTurn ? ' turn-end' : ''}`}
      data-category={entry.category}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="event-meta">
        {pills.map((pill) => (
          <span key={pill.label} className={`pill ${pill.className ?? ''}`.trim()}>
            {pill.label}
          </span>
        ))}
        {isSidechain ? (
          <span className="pill pill-sidechain">{agentId ? `agent:${agentId.slice(0, 6)}` : 'subagent'}</span>
        ) : null}
        <span className="timestamp">{timestamp}</span>
        {tokens ? (
          <span className="token-badge" title={`In: ${tokens.input.toLocaleString()} / Out: ${tokens.output.toLocaleString()}`}>
            {formatTokenCount(tokens.input + tokens.output)} tok
          </span>
        ) : null}
        <button
          type="button"
          className={`entry-copy${entry.role === 'user' && entry.category === 'message' ? '' : ' hover-only'}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void copyLink()
          }}
          title="Copy link to entry"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
      <div className="event-body">
        {renderEntryBody(entry, toolUseLookup, fileHistoryIndex, sessionId)}
      </div>
    </article>
  )
}

type SessionPhase = {
  startIndex: number
  endIndex: number
  total: number
  hasSelected: boolean
  durationMs: number
  label: string
  detail: string
}

function buildPhases(entries: ParsedEntry[], selectedId: string | null, gapMs: number): SessionPhase[] {
  if (!entries.length) return []

  // Split by time gaps
  const segments: { start: number; end: number }[] = []
  let segStart = 0
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1].timestampMs
    const curr = entries[i].timestampMs
    if (prev && curr && curr - prev > gapMs) {
      segments.push({ start: segStart, end: i - 1 })
      segStart = i
    }
  }
  segments.push({ start: segStart, end: entries.length - 1 })

  return segments.map((seg) => {
    let hasSelected = false
    const filesSet = new Set<string>()
    const prompts: string[] = []
    let toolCount = 0

    for (let j = seg.start; j <= seg.end; j++) {
      const entry = entries[j]
      if (entry.id === selectedId) hasSelected = true

      const data = entry.data
      if (!data) continue

      if (entry.role === 'user' && entry.category === 'message') {
        const msg = (data.message as Record<string, unknown>)?.content
        const text = typeof msg === 'string' ? msg : Array.isArray(msg)
          ? ((msg as Record<string, unknown>[]).find((b) => b.type === 'text') as Record<string, unknown>)?.text as string ?? ''
          : ''
        if (text && text.length > 5) {
          prompts.push(text.replace(/\n/g, ' ').trim())
        }
      }

      if (entry.category === 'tool') {
        const message = data.message as Record<string, unknown> | undefined
        const content = message?.content
        if (Array.isArray(content)) {
          for (const block of content as Record<string, unknown>[]) {
            if (block.type === 'tool_use') {
              toolCount++
              const input = block.input as Record<string, unknown> | undefined
              const fp = (input?.file_path ?? input?.path) as string | undefined
              if (fp) filesSet.add(fp.split('/').pop() ?? fp)
            }
          }
        }
      }
    }

    const total = seg.end - seg.start + 1
    const startTs = entries[seg.start].timestampMs
    const endTs = entries[seg.end].timestampMs
    const durationMs = startTs && endTs ? endTs - startTs : 0

    // Label: first prompt or file list
    let label = ''
    if (prompts.length) {
      const first = prompts[0]
      label = first.length > 50 ? first.slice(0, 50) + '...' : first
    } else if (filesSet.size) {
      label = Array.from(filesSet).slice(0, 3).join(', ')
    } else {
      label = `${total} entries`
    }

    // Compact detail
    const detail = [
      durationMs > 1000 ? formatDuration(durationMs) : null,
      `${total}`,
      toolCount ? `${toolCount} tools` : null,
      filesSet.size ? `${filesSet.size} files` : null,
    ].filter(Boolean).join(' · ')

    return { startIndex: seg.start, endIndex: seg.end, total, hasSelected, durationMs, label, detail }
  })
}

const GAP_OPTIONS = [
  { label: '5m', ms: 5 * 60_000 },
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '4h', ms: 4 * 60 * 60_000 },
]

function MiniMap({
  entries,
  selectedId,
  onJump,
}: {
  entries: ParsedEntry[]
  selectedId: string | null
  onJump: (entryId: string) => void
}) {
  const { theme } = useThemeContext()
  const defaultGap = THEMES[theme].phaseGapMs
  const [gapMs, setGapMs] = useState(defaultGap)

  if (!entries.length) {
    return null
  }

  const phases = useMemo(
    () => buildPhases(entries, selectedId, gapMs),
    [entries, selectedId, gapMs],
  )

  // Format start time for each phase
  const formatPhaseTime = (phase: SessionPhase) => {
    const ts = entries[phase.startIndex].timestampMs
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      <div className="section-panel-controls">
        <div className="gap-selector">
          {GAP_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              type="button"
              className={`gap-option${gapMs === opt.ms ? ' active' : ''}`}
              onClick={() => setGapMs(opt.ms)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="phase-list">
        {phases.map((phase, i) => (
          <button
            key={i}
            type="button"
            className={`phase-item${phase.hasSelected ? ' active' : ''}`}
            onClick={() => {
              let target = phase.startIndex
              for (let j = phase.startIndex; j <= phase.endIndex; j++) {
                if (entries[j].role === 'user' && entries[j].category === 'message') {
                  target = j
                  break
                }
              }
              if (entries[target]) onJump(entries[target].id)
            }}
          >
            <span className="phase-time">{formatPhaseTime(phase)}</span>
            <span className="phase-label">{phase.label}</span>
            <span className="phase-detail">{phase.detail}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function renderEntryBody(
  entry: ParsedEntry,
  toolUseLookup: ToolUseLookup,
  fileHistoryIndex: FileHistoryIndex,
  sessionId: string,
) {
  if (entry.error) {
    return <div className="error-block">Parse error: {entry.error}</div>
  }
  const data = entry.data ?? {}
  const type = data.type as string | undefined

  if (type === 'summary') {
    return (
      <div className="summary-block">
        <p>{data.summary as string}</p>
      </div>
    )
  }

  if (type === 'file-history-snapshot') {
    return (
      <FileHistorySnapshot
        data={data}
        sessionId={sessionId}
        fileHistoryIndex={fileHistoryIndex}
      />
    )
  }

  if (type === 'queue-operation') {
    return (
      <div className="queue-block">
        <p className="queue-title">Queue operation: {String(data.operation ?? 'unknown')}</p>
        <p className="muted">{String(data.content ?? '')}</p>
      </div>
    )
  }

  if (type === 'system') {
    return renderSystemEntry(data)
  }

  if (type === 'progress') {
    const progressData = data.data as Record<string, unknown> | undefined
    const progressType = progressData?.type as string | undefined
    return (
      <div className="progress-block">
        <div className="progress-header">
          <span className="progress-indicator" />
          <strong>{progressType?.replace(/_/g, ' ') ?? 'Progress'}</strong>
        </div>
        {progressType === 'hook_progress' ? (
          <div className="progress-detail">
            <span className="muted">{String(progressData?.hookName ?? progressData?.hookEvent ?? '')}</span>
            {progressData?.command ? <code>{String(progressData.command)}</code> : null}
          </div>
        ) : progressType === 'agent_progress' ? (
          <div className="progress-detail">
            <span className="muted">Agent {String(progressData?.agentId ?? '').slice(0, 8)}</span>
            {progressData?.prompt ? <p>{String(progressData.prompt).slice(0, 200)}</p> : null}
          </div>
        ) : progressType === 'waiting_for_task' ? (
          <div className="progress-detail">
            <span className="muted">{String(progressData?.taskType ?? 'task')}</span>
            {progressData?.taskDescription ? <p>{String(progressData.taskDescription)}</p> : null}
          </div>
        ) : progressData ? (
          <CollapsiblePre text={prettyJson(progressData)} />
        ) : null}
      </div>
    )
  }

  if (type === 'custom-title') {
    return (
      <div className="system-block">
        <p className="system-title">Session Title</p>
        <p><strong>{String(data.customTitle ?? '')}</strong></p>
      </div>
    )
  }

  if (type === 'last-prompt') {
    return (
      <div className="system-block">
        <p className="system-title">Last Prompt</p>
        <p className="muted">{String(data.lastPrompt ?? '').slice(0, 300)}</p>
      </div>
    )
  }

  if (type === 'assistant' || type === 'user') {
    const message = data.message as Record<string, unknown> | undefined
    const content = message?.content
    const role = type === 'user' ? 'user' : 'assistant'
    return (
      <div className="message-stack">
        {renderClaudeContent(content, toolUseLookup, role)}
      </div>
    )
  }

  return <pre className="fallback">{prettyJson(data)}</pre>
}

function renderClaudeContent(
  content: unknown,
  toolUseLookup: ToolUseLookup,
  role: 'user' | 'assistant' | 'unknown',
) {
  if (typeof content === 'string') {
    return role === 'user'
      ? renderUserText(content)
      : (
          <div className="text-stack">{renderTextWithCodeBlocks(content)}</div>
        )
  }

  const items = Array.isArray(content) ? content : content ? [content] : []
  return items.map((item, index) => {
    const entry = item as Record<string, unknown>
    const type = entry.type as string | undefined

    if (type === 'text') {
      const textValue = String(entry.text ?? '')
      return (
        <div key={index} className="text-stack">
          {role === 'user' ? renderUserText(textValue) : renderTextWithCodeBlocks(textValue)}
        </div>
      )
    }

    if (type === 'thinking') {
      const thinkingText = String(entry.thinking ?? '')
      const hasContent = thinkingText.trim().length > 0
      const thinkingLines = hasContent ? thinkingText.split('\n') : []
      const thinkingCharCount = thinkingText.length
      const previewLines = thinkingLines.slice(0, 4).join('\n')
      const hasMore = thinkingLines.length > 4

      return (
        <div key={index} className="thinking-block">
          {hasContent ? (
            <details>
              <summary className="thinking-summary">
                <span className="thinking-icon">&#x1F4AD;</span>
                <span>Thinking</span>
                <span className="thinking-meta">
                  {thinkingLines.length} line{thinkingLines.length !== 1 ? 's' : ''} &middot; {formatTokenCount(Math.ceil(thinkingCharCount / 4))} est. tokens
                </span>
              </summary>
              <div className="thinking-preview">{previewLines}</div>
              {hasMore ? (
                <details className="thinking-full">
                  <summary className="thinking-expand">Show all {thinkingLines.length} lines</summary>
                  <pre className="thinking-content">{thinkingText}</pre>
                </details>
              ) : null}
            </details>
          ) : (
            <div className="thinking-empty">
              <span className="thinking-icon">&#x1F4AD;</span>
              <span>Thinking</span>
              <span className="thinking-meta">internal reasoning (content redacted)</span>
            </div>
          )}
        </div>
      )
    }

    if (type === 'tool_use') {
      const input = entry.input as Record<string, unknown> | undefined
      const filePath = input?.file_path as string | undefined
      const toolName = entry.name as string
      const ext = fileExtension(filePath)
      const lang = languageForTool(toolName, filePath) || ext || undefined

      // Smart rendering for Edit tool
      if (toolName === 'Edit' && input?.old_string != null && input?.new_string != null) {
        const oldStr = String(input.old_string)
        const newStr = String(input.new_string)
        const replaceAll = Boolean(input.replace_all)
        return (
          <div key={index} className="tool-block edit-block">
            <div className="tool-header">
              <span>Edit</span>
              <strong>{replaceAll ? 'Replace All' : 'Replace'}</strong>
            </div>
            {filePath ? (
              <div className="file-chip">
                <span>{filePath}</span>
                <em>{ext || 'file'}</em>
              </div>
            ) : null}
            <EditDiff oldStr={oldStr} newStr={newStr} language={lang} />
          </div>
        )
      }

      // Smart rendering for Write tool
      if (toolName === 'Write' && input?.content != null) {
        const content = String(input.content)
        return (
          <div key={index} className="tool-block write-block">
            <div className="tool-header">
              <span>Write</span>
              <strong>Create File</strong>
            </div>
            {filePath ? (
              <div className="file-chip">
                <span>{filePath}</span>
                <em>{ext || 'file'}</em>
              </div>
            ) : null}
            <CodeBlock code={content} label="Content" language={lang} displayLanguage={ext} />
          </div>
        )
      }

      // Smart rendering for Agent tool
      if (toolName === 'Agent' && input) {
        const desc = String(input.description ?? '')
        const prompt = String(input.prompt ?? '')
        const agentType = input.subagent_type as string | undefined
        return (
          <div key={index} className="tool-block agent-block">
            <div className="tool-header">
              <span>Agent</span>
              <strong>{agentType ?? 'general-purpose'}</strong>
            </div>
            {desc ? <p className="tool-summary">{desc}</p> : null}
            {prompt ? (
              <details className="tool-details">
                <summary className="tool-details-summary">
                  Prompt <span className="muted">({prompt.length} chars)</span>
                </summary>
                <pre className="tool-details-content">{prompt}</pre>
              </details>
            ) : null}
          </div>
        )
      }

      // Smart rendering for Bash tool
      if (toolName === 'Bash' && input?.command != null) {
        const cmd = String(input.command)
        const desc = input.description as string | undefined
        return (
          <div key={index} className="tool-block">
            <div className="tool-header">
              <span>Bash</span>
              <strong>{desc || 'Command'}</strong>
            </div>
            <pre className="command-line">{cmd}</pre>
          </div>
        )
      }

      // Smart rendering for Read tool
      if (toolName === 'Read' && filePath) {
        const offset = input?.offset as number | undefined
        const limit = input?.limit as number | undefined
        const range = offset || limit ? ` (${offset ? `from line ${offset}` : ''}${offset && limit ? ', ' : ''}${limit ? `${limit} lines` : ''})` : ''
        return (
          <div key={index} className="tool-block">
            <div className="tool-header">
              <span>Read</span>
              <strong>{filePath.split('/').pop()}{range}</strong>
            </div>
            <div className="file-chip">
              <span>{filePath}</span>
              <em>{ext || 'file'}</em>
            </div>
          </div>
        )
      }

      // Smart rendering for Grep tool
      if (toolName === 'Grep' && input?.pattern != null) {
        const pattern = String(input.pattern)
        const grepPath = (input.path as string | undefined) || '.'
        const glob = input.glob as string | undefined
        return (
          <div key={index} className="tool-block">
            <div className="tool-header">
              <span>Grep</span>
              <strong>{grepPath.split('/').pop()}</strong>
            </div>
            <pre className="command-line">/{pattern}/{glob ? ` --glob ${glob}` : ''}</pre>
          </div>
        )
      }

      // Smart rendering for Glob tool
      if (toolName === 'Glob' && input?.pattern != null) {
        const pattern = String(input.pattern)
        const globPath = input.path as string | undefined
        return (
          <div key={index} className="tool-block">
            <div className="tool-header">
              <span>Glob</span>
              <strong>{globPath?.split('/').pop() || 'Find files'}</strong>
            </div>
            <pre className="command-line">{pattern}{globPath ? ` in ${globPath}` : ''}</pre>
          </div>
        )
      }

      // Default: generic tool call
      const inputJson = prettyJson(entry.input)
      return (
        <div key={index} className="tool-block">
          <div className="tool-header">
            <span>Tool Call</span>
            <strong>{toolName}</strong>
          </div>
          {filePath ? (
            <div className="file-chip">
              <span>{filePath}</span>
              <em>{ext || 'file'}</em>
            </div>
          ) : null}
          <CollapsiblePre text={inputJson} />
        </div>
      )
    }

    if (type === 'tool_result') {
      const lookup = toolUseLookup[String(entry.tool_use_id ?? '')]
      const toolName = lookup?.name ?? 'Tool'
      const filePath =
        (lookup?.input?.file_path as string | undefined) ||
        (lookup?.input?.path as string | undefined)
      const contentValue = entry.content
      const toolLanguage = languageForTool(toolName, filePath)
      const displayLanguage = fileExtension(filePath) || toolLanguage || 'text'
      const isError = Boolean(entry.is_error)
      return (
        <div key={index} className={`tool-block result${isError ? ' error' : ''}`}>
          <div className="tool-header">
            <span>{isError ? 'Tool Error' : 'Tool Result'}</span>
            <strong>{toolName}</strong>
          </div>
          {filePath ? (
            <div className="file-chip">
              <span>{filePath}</span>
              <em>{fileExtension(filePath) || 'file'}</em>
            </div>
          ) : null}
          {Array.isArray(contentValue) ? (
            <div className="tool-result-stack">
              {contentValue.map((item, itemIndex) =>
                renderToolResultItem(item, itemIndex, {
                  toolName,
                  toolLanguage,
                  displayLanguage,
                }),
              )}
            </div>
          ) : typeof contentValue === 'string' ? (
            <CodeBlock
              code={contentValue}
              label={toolName}
              language={toolLanguage}
              displayLanguage={displayLanguage}
            />
          ) : (
            <pre>{prettyJson(contentValue)}</pre>
          )}
        </div>
      )
    }

    if (type === 'image') {
      const source = entry.source as Record<string, unknown> | undefined
      return <div key={index}>{renderImageAttachment(source)}</div>
    }

    return (
      <pre key={index} className="fallback">
        {prettyJson(entry)}
      </pre>
    )
  })
}

function renderUserText(text: string) {
  const parsed = parseTaggedUserMessage(text)
  if (parsed.kind === 'command') {
    const commandName = parsed.commandName.trim()
    const commandArgs = parsed.commandArgs?.trim()
    const commandMessage = parsed.commandMessage?.trim()
    const commandLine = [commandName, commandArgs].filter(Boolean).join(' ')
    return (
      <div className="command-block">
        <div className="command-header">
          <span>Command</span>
          <strong>{commandName || 'command'}</strong>
        </div>
        {commandMessage ? (
          <div className="command-message">{renderTextWithCodeBlocks(commandMessage)}</div>
        ) : null}
        {commandLine ? <pre className="command-line">{commandLine}</pre> : null}
      </div>
    )
  }

  if (parsed.kind === 'local-command') {
    return (
      <div className="local-command-block">
        <CodeBlock
          code={parsed.stdout}
          label="Local stdout"
          displayLanguage="text"
        />
      </div>
    )
  }

  return <div className="text-stack">{renderTextWithCodeBlocks(parsed.content)}</div>
}

const TAG_REGEX = /<(?<tag>[^>]+)>(?<content>\s*[^<]*?\s*)<\/\k<tag>>/g

function parseTaggedUserMessage(content: string): TaggedUserMessage {
  const matches = Array.from(content.matchAll(TAG_REGEX))
    .map((match) => match.groups)
    .filter(
      (groups): groups is { tag: string; content: string } =>
        Boolean(groups?.tag),
    )

  if (!matches.length) {
    return { kind: 'text', content }
  }

  const commandName = matches.find((match) => match.tag === 'command-name')?.content
  const commandArgs = matches.find((match) => match.tag === 'command-args')?.content
  const commandMessage = matches.find((match) => match.tag === 'command-message')?.content
  const localStdout = matches.find((match) => match.tag === 'local-command-stdout')?.content

  if (commandName !== undefined) {
    return {
      kind: 'command',
      commandName,
      commandArgs,
      commandMessage,
    }
  }

  if (localStdout !== undefined) {
    return {
      kind: 'local-command',
      stdout: localStdout,
    }
  }

  return { kind: 'text', content }
}

function renderToolResultItem(
  item: unknown,
  index: number,
  {
    toolName,
    toolLanguage,
    displayLanguage,
  }: {
    toolName: string
    toolLanguage?: string
    displayLanguage: string
  },
) {
  if (typeof item === 'string') {
    return (
      <div key={`tool-result-${index}`} className="tool-result-item">
        <CodeBlock
          code={item}
          label={toolName}
          language={toolLanguage}
          displayLanguage={displayLanguage}
        />
      </div>
    )
  }

  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>
    const type = record.type as string | undefined
    if (type === 'text') {
      const textValue = String(record.text ?? '')
      return (
        <div key={`tool-result-${index}`} className="tool-result-item">
          <CodeBlock
            code={textValue}
            label={toolName}
            language={toolLanguage}
            displayLanguage={displayLanguage}
          />
        </div>
      )
    }
    if (type === 'image') {
      const source = record.source as Record<string, unknown> | undefined
      return (
        <div key={`tool-result-${index}`} className="tool-result-item">
          {renderImageAttachment(source)}
        </div>
      )
    }
  }

  return (
    <div key={`tool-result-${index}`} className="tool-result-item">
      <pre>{prettyJson(item)}</pre>
    </div>
  )
}

function renderImageAttachment(source?: Record<string, unknown>) {
  if (!source) {
    return (
      <div className="image-block">
        <div className="image-header">
          <span>Image attachment</span>
        </div>
        <p className="muted">No image data available.</p>
      </div>
    )
  }

  const sourceType = String(source.type ?? '')
  const mediaType = String(source.media_type ?? source.mediaType ?? 'image/png')
  const data = source.data as string | undefined
  const url =
    sourceType === 'base64' && data
      ? `data:${mediaType};base64,${data}`
      : typeof source.url === 'string'
        ? source.url
        : ''

  if (!url) {
    return (
      <div className="image-block">
        <div className="image-header">
          <span>Image attachment</span>
          <span className="muted">{mediaType}</span>
        </div>
        <pre>{prettyJson(source)}</pre>
      </div>
    )
  }

  return (
    <div className="image-block">
      <div className="image-header">
        <span>Image attachment</span>
        <span className="muted">{mediaType}</span>
      </div>
      <details>
        <summary>View image</summary>
        <img src={url} alt="log attachment" />
      </details>
    </div>
  )
}

function FileHistorySnapshot({
  data,
  sessionId,
  fileHistoryIndex,
}: {
  data: ClaudeEntry
  sessionId: string
  fileHistoryIndex: FileHistoryIndex
}) {
  const snapshot = data.snapshot as Record<string, unknown> | undefined
  const tracked = snapshot?.trackedFileBackups as Record<string, Record<string, unknown>> | undefined
  const entries = tracked ? Object.entries(tracked) : []
  const snapshotTime = snapshot?.timestamp as string | undefined
  const isUpdate = Boolean(data.isSnapshotUpdate)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [openMode, setOpenMode] = useState<'view' | 'diff' | null>(null)
  const [contentCache, setContentCache] = useState<Record<string, string>>({})
  const [diffCache, setDiffCache] = useState<Record<string, DiffLine[]>>({})
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({})
  const [errorCache, setErrorCache] = useState<Record<string, string>>({})

  const handleView = async (fileKey: string, backupFileName: string) => {
    if (openKey === fileKey && openMode === 'view') {
      setOpenKey(null)
      setOpenMode(null)
      return
    }
    setOpenKey(fileKey)
    setOpenMode('view')
    if (contentCache[fileKey]) {
      return
    }
    await loadBackup(fileKey, backupFileName)
  }

  const handleDiff = async (
    fileKey: string,
    backupFileName: string,
    previous?: FileBackupInfo,
  ) => {
    if (!previous) {
      return
    }
    if (openKey === fileKey && openMode === 'diff') {
      setOpenKey(null)
      setOpenMode(null)
      return
    }
    setOpenKey(fileKey)
    setOpenMode('diff')
    if (diffCache[fileKey]) {
      return
    }
    const [currentText, previousText] = await Promise.all([
      fetchBackupContent(fileKey, backupFileName),
      fetchBackupContent(`${fileKey}-prev`, previous.backupFileName),
    ])
    if (currentText && previousText) {
      setDiffCache((current) => ({
        ...current,
        [fileKey]: computeDiff(previousText, currentText),
      }))
    }
  }

  const loadBackup = async (fileKey: string, backupFileName: string) => {
    const content = await fetchBackupContent(fileKey, backupFileName)
    if (content) {
      setContentCache((current) => ({
        ...current,
        [fileKey]: content,
      }))
    }
  }

  const fetchBackupContent = async (fileKey: string, backupFileName: string) => {
    if (!sessionId) {
      return ''
    }
    setLoadingKeys((current) => ({ ...current, [fileKey]: true }))
    setErrorCache((current) => ({ ...current, [fileKey]: '' }))
    try {
      const response = await fetch(`/api/file-history/${sessionId}/${backupFileName}`)
      if (!response.ok) {
        throw new Error(`Failed to load backup (${response.status})`)
      }
      const json = (await response.json()) as { text: string }
      return json.text
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load backup'
      setErrorCache((current) => ({ ...current, [fileKey]: message }))
      return ''
    } finally {
      setLoadingKeys((current) => ({ ...current, [fileKey]: false }))
    }
  }

  return (
    <div className="snapshot-block">
      <p>File history snapshot {isUpdate ? 'updated' : 'captured'}.</p>
      <p className="muted small">{formatDateTime(snapshotTime ?? 'n/a')}</p>
      {entries.length ? (
        <details className="snapshot-details">
          <summary>Tracked files ({entries.length})</summary>
          <ul className="snapshot-list">
            {entries.map(([filePath, info]) => {
              const backupFileName = info?.backupFileName as string | undefined
              const version = Number(info?.version ?? 0)
              const backupTime = info?.backupTime as string | undefined
              const fileKey = `${filePath}@${version}`
              const previous = findPreviousBackup(filePath, version, fileHistoryIndex)
              const showView = openKey === fileKey && openMode === 'view'
              const showDiff = openKey === fileKey && openMode === 'diff'
              const isLoading = Boolean(
                loadingKeys[fileKey] || loadingKeys[`${fileKey}-prev`],
              )
              const error = errorCache[fileKey]
              const content = contentCache[fileKey]
              const diff = diffCache[fileKey]
              return (
                <li key={fileKey} className="snapshot-item">
                  <div className="snapshot-info">
                    <span>{filePath}</span>
                    <em>{fileExtension(filePath) || 'file'}</em>
                  </div>
                  <div className="snapshot-info meta">
                    <span>v{version || 0}</span>
                    <span>{formatDateTime(backupTime ?? 'n/a')}</span>
                  </div>
                  <div className="snapshot-actions">
                    <button
                      type="button"
                      className="snapshot-button"
                      disabled={!backupFileName || !sessionId}
                      onClick={() => {
                        if (backupFileName) {
                          void handleView(fileKey, backupFileName)
                        }
                      }}
                    >
                      {showView ? 'Hide' : 'View'}
                    </button>
                    <button
                      type="button"
                      className="snapshot-button"
                      disabled={!previous || !backupFileName || !sessionId}
                      onClick={() => {
                        if (backupFileName) {
                          void handleDiff(fileKey, backupFileName, previous)
                        }
                      }}
                    >
                      {showDiff ? 'Hide diff' : 'Diff'}
                    </button>
                  </div>
                  {isLoading ? (
                    <div className="snapshot-status">Loading backup...</div>
                  ) : error ? (
                    <div className="snapshot-status error">{error}</div>
                  ) : null}
                  {showView && content ? (
                    <div className="snapshot-content">
                      <CodeBlock
                        code={content}
                        label="Snapshot"
                        language={languageFromFilePath(filePath)}
                        displayLanguage={fileExtension(filePath) || 'text'}
                      />
                    </div>
                  ) : null}
                  {showDiff && diff ? (
                    <div className="diff-block">
                      {diff.slice(0, PREVIEW_LINE_LIMIT).map((line, index) => (
                        <div key={`${fileKey}-diff-${index}`} className={`diff-line ${line.type}`}>
                          <span>{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                          <span>{line.content}</span>
                        </div>
                      ))}
                      {diff.length > PREVIEW_LINE_LIMIT ? (
                        <div className="diff-note">
                          Showing first {PREVIEW_LINE_LIMIT} of {diff.length} lines.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {showDiff && !diff && !isLoading && !error ? (
                    <div className="snapshot-status">No diff available.</div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </details>
      ) : (
        <p className="muted small">No tracked files recorded.</p>
      )}
    </div>
  )
}

function renderSystemEntry(data: ClaudeEntry) {
  const hookInfos = Array.isArray(data.hookInfos) ? data.hookInfos : []
  const hookErrors = Array.isArray(data.hookErrors) ? data.hookErrors : []
  const prevented = Boolean(data.preventedContinuation)
  const hasOutput = Boolean(data.hasOutput)
  const subtype = String(data.subtype ?? 'system event')

  return (
    <div className="system-block">
      <p className="system-title">{subtype}</p>
      <div className="system-grid">
        <span>Level</span>
        <strong>{String(data.level ?? 'info')}</strong>
        <span>Hook count</span>
        <strong>{String(data.hookCount ?? hookInfos.length)}</strong>
        <span>Stop reason</span>
        <strong>{String(data.stopReason ?? 'n/a')}</strong>
        <span>Continuation</span>
        <strong>{prevented ? 'blocked' : 'allowed'}</strong>
        <span>Has output</span>
        <strong>{hasOutput ? 'yes' : 'no'}</strong>
      </div>
      {hookInfos.length ? (
        <div className="system-section">
          <p>Hooks</p>
          <ul>
            {hookInfos.map((info, index) => (
              <li key={`${subtype}-${index}`}>{String(info.command ?? 'unknown command')}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {hookErrors.length ? (
        <div className="system-section warning">
          <p>Hook errors</p>
          <ul>
            {hookErrors.map((error, index) => (
              <li key={`${subtype}-err-${index}`}>{String(error ?? 'unknown error')}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function parseClaudeJsonl(text: string): ParsedEntry[] {
  if (!text) {
    return []
  }

  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        const data = JSON.parse(line) as ClaudeEntry
        const message = data.message as Record<string, unknown> | undefined
        const category = detectCategory(data)
        const role = deriveRole(data)
        const rawTs = data.timestamp ?? message?.timestamp
        const timestamp = formatTimestamp(rawTs)
        const timestampMs = parseTimestampMs(rawTs)
        return {
          id: deriveId(data, index),
          raw: line,
          data,
          category,
          role,
          timestamp,
          timestampMs,
        }
      } catch (error) {
        return {
          id: `error-${index}`,
          raw: line,
          error: error instanceof Error ? error.message : 'Unknown parse error',
          category: 'error',
        }
      }
    })
}

function detectCategory(data: ClaudeEntry): EntryCategory {
  const type = data.type as string | undefined
  if (type === 'summary') {
    return 'summary'
  }
  if (type === 'file-history-snapshot') {
    return 'snapshot'
  }
  if (type === 'queue-operation') {
    return 'queue'
  }
  if (type === 'system') {
    return 'system'
  }
  if (type === 'progress') {
    return 'progress'
  }
  if (type === 'custom-title' || type === 'last-prompt') {
    return 'system'
  }
  if (type === 'assistant' || type === 'user') {
    const message = data.message as Record<string, unknown> | undefined
    const content = message?.content
    if (containsToolContent(content)) {
      return 'tool'
    }
    return 'message'
  }
  return 'other'
}

function containsToolContent(content: unknown): boolean {
  const items = Array.isArray(content) ? content : content ? [content] : []
  return items.some((item) => {
    const entry = item as Record<string, unknown>
    return entry.type === 'tool_use' || entry.type === 'tool_result'
  })
}

function deriveRole(data: ClaudeEntry): string | undefined {
  const message = data.message as Record<string, unknown> | undefined
  if (message?.role) {
    return String(message.role)
  }
  if (data.type) {
    return String(data.type)
  }
  return undefined
}

function deriveId(data: ClaudeEntry, fallbackIndex: number): string {
  const candidate =
    (data.uuid as string | undefined) ||
    (data.leafUuid as string | undefined) ||
    (data.messageId as string | undefined) ||
    (data.message as Record<string, unknown> | undefined)?.id
  if (candidate) {
    return String(candidate)
  }
  return `entry-${fallbackIndex}`
}

function formatTimestamp(value: unknown): string | undefined {
  if (!value) {
    return undefined
  }
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : null
  if (!date || Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

function parseTimestampMs(value: unknown): number | undefined {
  if (!value) return undefined
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d.getTime()
  }
  return undefined
}

function computeSessionStats(entries: ParsedEntry[]): SessionStats {
  const stats: SessionStats = {
    totalEntries: entries.length,
    messageCount: 0,
    toolCount: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    models: [],
    durationMs: 0,
  }
  const modelSet = new Set<string>()
  let minTs = Infinity
  let maxTs = -Infinity

  for (const entry of entries) {
    if (entry.category === 'message') stats.messageCount++
    if (entry.category === 'tool') stats.toolCount++
    if (entry.category === 'error') stats.errorCount++

    if (entry.timestampMs) {
      if (entry.timestampMs < minTs) minTs = entry.timestampMs
      if (entry.timestampMs > maxTs) maxTs = entry.timestampMs
    }

    const data = entry.data
    if (!data) continue

    // Extract custom-title and last-prompt
    if (data.type === 'custom-title' && data.customTitle) {
      stats.customTitle = String(data.customTitle)
    }
    if (data.type === 'last-prompt' && data.lastPrompt) {
      stats.lastPrompt = String(data.lastPrompt).slice(0, 200)
    }

    // Extract usage from assistant messages
    const message = data.message as Record<string, unknown> | undefined
    if (message) {
      const model = message.model as string | undefined
      if (model) modelSet.add(model)
      const usage = message.usage as Record<string, unknown> | undefined
      if (usage) {
        stats.inputTokens += Number(usage.input_tokens ?? 0)
        stats.outputTokens += Number(usage.output_tokens ?? 0)
        stats.cacheCreationTokens += Number(usage.cache_creation_input_tokens ?? 0)
        stats.cacheReadTokens += Number(usage.cache_read_input_tokens ?? 0)
      }
    }
  }

  if (minTs < Infinity && maxTs > -Infinity) {
    stats.durationMs = maxTs - minTs
  }
  stats.models = Array.from(modelSet)
  return stats
}

function extractEntryTokens(entry: ParsedEntry): { input: number; output: number } | null {
  const data = entry.data
  if (!data) return null
  const message = data.message as Record<string, unknown> | undefined
  const usage = message?.usage as Record<string, unknown> | undefined
  if (!usage) return null
  const input = Number(usage.input_tokens ?? 0)
  const output = Number(usage.output_tokens ?? 0)
  if (!input && !output) return null
  return { input, output }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes < 60) return remainSeconds ? `${minutes}m ${remainSeconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes ? `${hours}h ${remainMinutes}m` : `${hours}h`
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function prettyJson(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toSessionListing(file: SessionFile): SessionListing {
  const path = file.path
  const segments = path.split('/').filter(Boolean)
  const filename = segments[segments.length - 1] ?? path
  const projectSlug = segments[segments.length - 2] ?? 'unknown'
  return {
    id: filename.replace(/\.jsonl$/, ''),
    path,
    project: humanizeProjectSlug(projectSlug),
    projectSlug,
    mtimeMs: file.mtimeMs,
    size: file.size,
    source: 'disk',
  }
}

function isJsonlFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.jsonl')
}

function toLocalSessionListing(file: File): SessionListing | null {
  if (!isJsonlFile(file)) {
    return null
  }
  const path = file.webkitRelativePath || file.name
  const segments = path.split('/').filter(Boolean)
  const filename = segments[segments.length - 1] ?? file.name
  const projectSlug = segments.length > 1 ? segments[segments.length - 2] : 'local-imports'
  return {
    id: filename.replace(/\.jsonl$/i, ''),
    path,
    project: humanizeProjectSlug(projectSlug),
    projectSlug,
    mtimeMs: file.lastModified,
    size: file.size,
    source: 'local',
  }
}

function mergeLocalFiles(state: LocalSessionState, files: File[]): LocalSessionState {
  const nextFiles = { ...state.files }
  const nextSessions = new Map(state.sessions.map((session) => [session.id, session]))

  files.forEach((file) => {
    const listing = toLocalSessionListing(file)
    if (!listing) {
      return
    }
    nextFiles[listing.id] = file
    nextSessions.set(listing.id, listing)
  })

  return {
    files: nextFiles,
    sessions: Array.from(nextSessions.values()),
  }
}

function humanizeProjectSlug(slug: string): string {
  if (slug.startsWith('-')) {
    return slug.slice(1).replace(/-/g, '/')
  }
  return slug
}

function groupSessions(sessions: SessionListing[], sortMode: SortMode): SessionGroup[] {
  const grouped = new Map<string, SessionGroup>()
  sessions.forEach((session) => {
    const existing = grouped.get(session.projectSlug)
    if (existing) {
      existing.sessions.push(session)
      existing.latestMtime = Math.max(existing.latestMtime, session.mtimeMs)
    } else {
      grouped.set(session.projectSlug, {
        project: session.project,
        projectSlug: session.projectSlug,
        latestMtime: session.mtimeMs,
        sessions: [session],
      })
    }
  })

  const groups = Array.from(grouped.values())
  groups.forEach((group) => {
    group.sessions = sortSessions(group.sessions, sortMode)
  })

  return sortProjects(groups, sortMode)
}

function buildProjectTree(groups: SessionGroup[]): ProjectNode[] {
  const root: ProjectNode[] = []
  const nodeMap = new Map<string, ProjectNode>()

  groups.forEach((group) => {
    const segments = group.project.split('/').filter(Boolean)
    let parent: ProjectNode | undefined
    const pathParts: string[] = []
    segments.forEach((segment, index) => {
      pathParts.push(segment)
      const path = pathParts.join('/')
      let node = nodeMap.get(path)
      if (!node) {
        node = {
          id: path,
          name: segment,
          path,
          latestMtime: group.latestMtime,
          sessionsCount: 0,
          children: [],
        }
        nodeMap.set(path, node)
        if (parent) {
          parent.children.push(node)
        } else {
          root.push(node)
        }
      }
      node.latestMtime = Math.max(node.latestMtime, group.latestMtime)
      node.sessionsCount += group.sessions.length
      if (index === segments.length - 1) {
        node.projectSlug = group.projectSlug
      }
      parent = node
    })
  })

  const sortNodes = (nodes: ProjectNode[]) => {
    nodes.sort((a, b) => {
      if (b.latestMtime !== a.latestMtime) {
        return b.latestMtime - a.latestMtime
      }
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((node) => sortNodes(node.children))
  }

  sortNodes(root)
  return root
}

function filterProjectTree(nodes: ProjectNode[], query: string): ProjectNode[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) {
    return nodes
  }

  const matches = (node: ProjectNode) =>
    node.name.toLowerCase().includes(trimmed) || node.path.toLowerCase().includes(trimmed)

  const filterNodes = (list: ProjectNode[]): ProjectNode[] => {
    const result: ProjectNode[] = []
    list.forEach((node) => {
      const filteredChildren = filterNodes(node.children)
      if (matches(node) || filteredChildren.length) {
        result.push({ ...node, children: filteredChildren })
      }
    })
    return result
  }

  return filterNodes(nodes)
}

function sortSessions(sessions: SessionListing[], sortMode: SortMode): SessionListing[] {
  const sorted = [...sessions]
  if (sortMode === 'oldest') {
    return sorted.sort((a, b) => a.mtimeMs - b.mtimeMs)
  }
  if (sortMode === 'name') {
    return sorted.sort((a, b) => a.id.localeCompare(b.id))
  }
  return sorted.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function sortProjects(groups: SessionGroup[], sortMode: SortMode): SessionGroup[] {
  const sorted = [...groups]
  if (sortMode === 'oldest') {
    return sorted.sort((a, b) => a.latestMtime - b.latestMtime)
  }
  if (sortMode === 'name') {
    return sorted.sort((a, b) => a.project.localeCompare(b.project))
  }
  return sorted.sort((a, b) => b.latestMtime - a.latestMtime)
}

function isSessionInProject(session: SessionListing, projectPath: string): boolean {
  if (session.project === projectPath) {
    return true
  }
  return session.project.startsWith(`${projectPath}/`)
}

function formatDateTime(value: number | string): string {
  if (!value || value === 'n/a') {
    return 'n/a'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'n/a'
  }
  return date.toLocaleString()
}

function formatBytes(size: number): string {
  if (!size) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`
}

function buildFileHistoryIndex(entries: ParsedEntry[]): FileHistoryIndex {
  const index: FileHistoryIndex = {}
  const seen = new Set<string>()

  entries.forEach((entry) => {
    const data = entry.data
    if (data?.type !== 'file-history-snapshot') {
      return
    }
    const snapshot = data.snapshot as Record<string, unknown> | undefined
    const tracked = snapshot?.trackedFileBackups as
      | Record<string, Record<string, unknown>>
      | undefined
    if (!tracked) {
      return
    }
    Object.entries(tracked).forEach(([filePath, info]) => {
      const backupFileName = info?.backupFileName as string | undefined
      const version = Number(info?.version ?? 0)
      const backupTime = info?.backupTime as string | undefined
      if (!backupFileName) {
        return
      }
      const key = `${filePath}@${backupFileName}@${version}`
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      if (!index[filePath]) {
        index[filePath] = []
      }
      index[filePath].push({
        filePath,
        backupFileName,
        version,
        backupTime,
      })
    })
  })

  Object.values(index).forEach((list) => {
    list.sort((a, b) => a.version - b.version)
  })

  return index
}

function findPreviousBackup(
  filePath: string,
  version: number,
  index: FileHistoryIndex,
): FileBackupInfo | undefined {
  const list = index[filePath]
  if (!list?.length || !version) {
    return undefined
  }
  const candidates = list.filter((item) => item.version < version)
  if (!candidates.length) {
    return undefined
  }
  return candidates[candidates.length - 1]
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const maxLines = Math.max(oldLines.length, newLines.length)
  const diff: DiffLine[] = []

  for (let i = 0; i < maxLines; i += 1) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    if (oldLine === newLine && oldLine !== undefined) {
      diff.push({ type: 'context', content: oldLine })
      continue
    }
    if (oldLine !== undefined) {
      diff.push({ type: 'removed', content: oldLine })
    }
    if (newLine !== undefined) {
      diff.push({ type: 'added', content: newLine })
    }
  }

  return diff
}

type ToolUseInfo = {
  id: string
  name?: string
  input?: Record<string, unknown>
}

type ToolUseLookup = Record<string, ToolUseInfo>

type PillItem = {
  label: string
  className?: string
}

function buildToolUseLookup(entries: ParsedEntry[]): ToolUseLookup {
  const lookup: ToolUseLookup = {}
  entries.forEach((entry) => {
    const message = entry.data?.message as Record<string, unknown> | undefined
    const content = message?.content
    const items = Array.isArray(content) ? content : content ? [content] : []
    items.forEach((item) => {
      if (!item || typeof item !== 'object') {
        return
      }
      const record = item as Record<string, unknown>
      if (record.type !== 'tool_use') {
        return
      }
      const id = record.id as string | undefined
      if (!id) {
        return
      }
      lookup[id] = {
        id,
        name: record.name as string | undefined,
        input: record.input as Record<string, unknown> | undefined,
      }
    })
  })
  return lookup
}

function EditDiff({
  oldStr,
  newStr,
  language,
}: {
  oldStr: string
  newStr: string
  language?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const totalLines = oldLines.length + newLines.length

  // Build a simple inline diff
  const diffLines: Array<{ type: 'removed' | 'added' | 'context'; text: string }> = []

  // Find common prefix and suffix lines to show context
  let prefixCount = 0
  const minLen = Math.min(oldLines.length, newLines.length)
  while (prefixCount < minLen && oldLines[prefixCount] === newLines[prefixCount]) {
    prefixCount++
  }

  let suffixCount = 0
  while (
    suffixCount < minLen - prefixCount &&
    oldLines[oldLines.length - 1 - suffixCount] === newLines[newLines.length - 1 - suffixCount]
  ) {
    suffixCount++
  }

  // Context lines (leading)
  const contextLimit = 2
  const prefixStart = Math.max(0, prefixCount - contextLimit)
  for (let i = prefixStart; i < prefixCount; i++) {
    diffLines.push({ type: 'context', text: oldLines[i] })
  }

  // Removed lines (from old)
  for (let i = prefixCount; i < oldLines.length - suffixCount; i++) {
    diffLines.push({ type: 'removed', text: oldLines[i] })
  }

  // Added lines (from new)
  for (let i = prefixCount; i < newLines.length - suffixCount; i++) {
    diffLines.push({ type: 'added', text: newLines[i] })
  }

  // Context lines (trailing)
  const suffixStart = oldLines.length - suffixCount
  const suffixEnd = Math.min(oldLines.length, suffixStart + contextLimit)
  for (let i = suffixStart; i < suffixEnd; i++) {
    diffLines.push({ type: 'context', text: oldLines[i] })
  }

  const collapseThreshold = 20
  const shouldCollapse = diffLines.length > collapseThreshold && !expanded
  const displayLines = shouldCollapse ? diffLines.slice(0, collapseThreshold) : diffLines

  return (
    <div className="edit-diff">
      <div className="edit-diff-stats">
        <span className="edit-diff-removed">−{oldLines.length - prefixCount - suffixCount}</span>
        <span className="edit-diff-added">+{newLines.length - prefixCount - suffixCount}</span>
        {language ? <span className="edit-diff-lang">{language}</span> : null}
      </div>
      <div className="edit-diff-body">
        {displayLines.map((line, i) => (
          <div key={i} className={`diff-line ${line.type}`}>
            <span className="diff-gutter">{line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}</span>
            <span className="diff-text">{line.text || '\u00A0'}</span>
          </div>
        ))}
      </div>
      {shouldCollapse ? (
        <button
          type="button"
          className="code-truncation"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(true)
          }}
        >
          Show all {diffLines.length} lines ({totalLines} total)
        </button>
      ) : diffLines.length > collapseThreshold ? (
        <button
          type="button"
          className="code-truncation"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(false)
          }}
        >
          Collapse
        </button>
      ) : null}
    </div>
  )
}

function buildPills(entry: ParsedEntry, roleLabel: string): PillItem[] {
  const pills: PillItem[] = []
  const seen = new Set<string>()

  const addPill = (label: string, className?: string) => {
    const key = label.toLowerCase()
    if (!label || seen.has(key)) {
      return
    }
    seen.add(key)
    pills.push({ label, className })
  }

  if (roleLabel) {
    addPill(roleLabel, `role-${pillClass(roleLabel)}`)
  }

  if (entry.category === 'tool' && entry.category !== roleLabel) {
    addPill('tool', 'muted')
  }

  if (!roleLabel) {
    addPill(entry.category, 'muted')
  }

  return pills
}

function pillClass(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function renderTextWithCodeBlocks(text: string) {
  const segments = text.split('```')
  return segments.map((segment, index) => {
    if (index % 2 === 1) {
      const lines = segment.split('\n')
      const hasLanguage = lines.length > 1
      const language = hasLanguage ? lines[0]?.trim() : ''
      const code = hasLanguage ? lines.slice(1).join('\n') : segment
      return (
        <CodeBlock
          key={`code-${index}`}
          code={code}
          label="Code"
          language={language}
          displayLanguage={language || 'text'}
        />
      )
    }
    return segment
      .split('\n')
      .filter((line) => line.trim())
      .map((line, lineIndex) => <p key={`line-${index}-${lineIndex}`}>{line}</p>)
  })
}

function CollapsiblePre({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = previewText(text, PREVIEW_LINE_LIMIT)
  const displayText = expanded || !preview.truncated ? text : preview.text

  return (
    <div className={`collapsible-pre${preview.truncated && !expanded ? ' collapsed' : ''}`}>
      <pre>{displayText}</pre>
      {preview.truncated ? (
        <button
          type="button"
          className="code-truncation"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {expanded
            ? 'Collapse'
            : `Show all ${preview.totalLines} lines`}
        </button>
      ) : null}
    </div>
  )
}

type CodeBlockProps = {
  code: string
  label?: string
  language?: string
  displayLanguage?: string
}

function CodeBlock({
  code,
  label = 'Code',
  language,
  displayLanguage,
}: CodeBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const normalizedLanguage = normalizeLanguage(language)
  const preview = previewText(code, PREVIEW_LINE_LIMIT)
  const showFull = expanded || !preview.truncated
  const displayText = showFull ? code : preview.text
  const highlighted = highlightCode(displayText, normalizedLanguage)
  const languageLabel = displayLanguage?.trim() || normalizedLanguage || 'text'

  return (
    <div className={`code-block${preview.truncated && !expanded ? ' collapsed' : ''}`}>
      <div className="code-header">
        <span>{label}</span>
        <span className="code-language">{languageLabel}</span>
      </div>
      <pre>
        <code
          className={normalizedLanguage ? `hljs language-${normalizedLanguage}` : 'hljs'}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
      {preview.truncated ? (
        <button
          type="button"
          className="code-truncation"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {expanded
            ? 'Collapse'
            : `Show all ${preview.totalLines} lines`}
        </button>
      ) : null}
    </div>
  )
}

function previewText(text: string, limit: number) {
  if (!text) {
    return {
      text: '',
      totalLines: 0,
      truncated: false,
      limit,
    }
  }
  const normalized = text.replace(/\r\n/g, '\n')
  const endsWithNewline = normalized.endsWith('\n')
  let lines = normalized.split('\n')
  if (endsWithNewline) {
    lines = lines.slice(0, -1)
  }
  const totalLines = lines.length
  const truncated = totalLines > limit
  const previewLines = truncated ? lines.slice(0, limit) : lines
  return {
    text: previewLines.join('\n'),
    totalLines,
    truncated,
    limit,
  }
}

function highlightCode(code: string, language?: string) {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language }).value
  }
  return escapeHtml(code)
}

function collapseBlobs(value: unknown): unknown {
  if (typeof value === 'string') {
    // Base64 image data
    if (value.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 100))) {
      const sizeKb = Math.round((value.length * 3) / 4 / 1024)
      return `[base64 blob · ${sizeKb}KB]`
    }
    // Very long strings (e.g. huge tool output)
    if (value.length > 2000) {
      return value.slice(0, 200) + `... [${(value.length / 1024).toFixed(1)}KB truncated]`
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(collapseBlobs)
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = collapseBlobs(v)
    }
    return result
  }
  return value
}

function highlightJson(json: string) {
  try {
    // Parse, collapse blobs, re-stringify, then highlight
    const parsed = JSON.parse(json)
    const collapsed = collapseBlobs(parsed)
    const clean = JSON.stringify(collapsed, null, 2)
    return hljs.highlight(clean, { language: 'json' }).value
  } catch {
    // Fallback: regex replace obvious base64 blobs in raw string
    const cleaned = json.replace(
      /"data":\s*"[A-Za-z0-9+/=\s]{200,}"/g,
      (match) => {
        const sizeKb = Math.round((match.length * 3) / 4 / 1024)
        return `"data": "[base64 blob · ${sizeKb}KB]"`
      },
    )
    try {
      return hljs.highlight(cleaned, { language: 'json' }).value
    } catch {
      return escapeHtml(cleaned)
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'bash',
  css: 'css',
  diff: 'diff',
  go: 'go',
  html: 'html',
  js: 'javascript',
  json: 'json',
  jsonl: 'json',
  jsx: 'jsx',
  md: 'markdown',
  python: 'python',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  text: 'plaintext',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
}

function normalizeLanguage(language?: string): string | undefined {
  if (!language) {
    return undefined
  }
  const trimmed = language.trim().toLowerCase()
  if (!trimmed) {
    return undefined
  }
  return LANGUAGE_ALIASES[trimmed] ?? trimmed
}

function languageFromFilePath(filePath?: string): string | undefined {
  const ext = fileExtension(filePath)
  if (!ext) {
    return undefined
  }
  return normalizeLanguage(ext)
}

function languageForTool(toolName?: string, filePath?: string): string | undefined {
  const fromPath = languageFromFilePath(filePath)
  if (fromPath) {
    return fromPath
  }
  const name = toolName?.toLowerCase() ?? ''
  if (name.includes('bash') || name.includes('shell')) {
    return 'bash'
  }
  if (name.includes('python')) {
    return 'python'
  }
  if (name.includes('sql')) {
    return 'sql'
  }
  if (name.includes('diff') || name.includes('patch')) {
    return 'diff'
  }
  if (name.includes('node') || name.includes('javascript') || name === 'js') {
    return 'javascript'
  }
  return undefined
}

function fileExtension(filePath?: string): string {
  if (!filePath) {
    return ''
  }
  const lastSegment = filePath.split('/').pop() || ''
  const parts = lastSegment.split('.')
  if (parts.length < 2) {
    return ''
  }
  return parts[parts.length - 1]
}

function entryDomId(entryId: string) {
  const safe = entryId.replace(/[^a-zA-Z0-9_-]+/g, '-')
  return `entry-${safe}`
}

function scrollToEntry(entryId: string) {
  const element = document.getElementById(entryDomId(entryId))
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

export default App
