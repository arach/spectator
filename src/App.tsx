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
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import hljs from 'highlight.js'

type ClaudeEntry = Record<string, unknown>

type EntryCategory =
  | 'message'
  | 'tool'
  | 'summary'
  | 'snapshot'
  | 'system'
  | 'queue'
  | 'other'
  | 'error'

type ParsedEntry = {
  id: string
  raw: string
  data?: ClaudeEntry
  error?: string
  category: EntryCategory
  timestamp?: string
  role?: string
}

type SessionResponse = {
  sessionId: string
  path: string
  text: string
}

type SessionListResponse = {
  sessions: SessionFile[]
}

type SessionSource = 'disk' | 'local'

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
  'other',
  'error',
]

const PREVIEW_LINE_LIMIT = 10
const MINIMAP_LEGEND = [
  { label: 'Messages', category: 'message' },
  { label: 'Tools', category: 'tool' },
  { label: 'Summary', category: 'summary' },
  { label: 'Snapshots', category: 'snapshot' },
  { label: 'System', category: 'system' },
  { label: 'Queue', category: 'queue' },
  { label: 'Errors', category: 'error' },
]

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
    <LocalSessionContext.Provider value={localValue}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:sessionId" element={<SessionPage source="disk" />} />
        <Route path="/local/:sessionId" element={<SessionPage source="local" />} />
      </Routes>
    </LocalSessionContext.Provider>
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
        ? 'Showing demo projects because the local API is unavailable on static hosting.'
      : 'Sorted by most recent activity across your local roots.'
  const sessionListCopy =
    sessionSource === 'local'
      ? `Local imports are scoped to ${sessionScopeLabel}. Select a project above to narrow in.`
      : isDemoMode
        ? 'Demo sessions are shown here. Run the local CLI to browse your own logs.'
      : `Sessions are read from the configured roots in \`spectator.config.json\` and scoped to ${sessionScopeLabel}. Select a project above to narrow in.`

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
      <main className="home">
        <div className="home-split">
          <section className="hero">
            <div className="section-header hero-header">
              <p className="eyebrow">Session Playback</p>
              <h1>Open a session in-place, straight from disk.</h1>
              <p className="hero-copy">
                Spectator reads Claude JSONL directly and renders structured timelines. Paste
                a session id to jump in, or navigate to a route manually.
              </p>
            </div>
            <div className="hero-card">
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
                <span>Direct URL format:</span>
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
                  <p className="eyebrow">Local Imports</p>
                  <h3>Drop JSONL sessions to explore</h3>
                  <p className="muted">
                    Files stay on your machine. Import a folder to mirror your local project tree.
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
            <div className="section-header discovery-header">
              <p className="eyebrow">Project Discovery</p>
              <h2>Navigate by project hierarchy</h2>
              <p className="muted">{projectDiscoveryCopy}</p>
            </div>
            <div className="discovery-grid">
              <div className="discovery-panel">
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
              <aside className="discovery-aside">
                <div className="discovery-card">
                  <p className="eyebrow">Browser Cloud</p>
                  <h3>Needs your permission</h3>
                  <p className="muted">
                    Enable the browser connector to sync remote session metadata and previews.
                  </p>
                </div>
                <div className="discovery-card">
                  <p className="eyebrow">Session Playback</p>
                  <h3>Ready for review</h3>
                  <p className="muted">
                    Select a project to scope the list, then open a session to replay it.
                  </p>
                </div>
              </aside>
            </div>
          </section>
        </div>
        <section className="landing">
          <div className="section-header landing-header">
            <p className="eyebrow">Spectator</p>
            <h2>Local-first session review, without the ceremony.</h2>
            <p className="muted">
              Point Spectator at your Claude logs to get a clean, searchable timeline with
              shareable deep links. Everything runs on your machine.
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
                Navigate sessions by project hierarchy, sorted by most recent activity.
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
            <div>
              <p className="eyebrow">Install</p>
              <h3>Run locally in seconds</h3>
              <p className="muted">
                Spectator ships as a local CLI. It opens your browser and serves from a local
                port.
              </p>
            </div>
            <pre>
              <code>npm install -g spectator</code>
              <code>spectator</code>
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

function SessionPage({ source }: { source: SessionSource }) {
  const { sessionId } = useParams()
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [densityAuto, setDensityAuto] = useState(true)
  const [showMiniMap, setShowMiniMap] = useState(true)
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
      if (!sessionId) {
        return
      }
      setLoading(true)
      setError(null)
      try {
        if (source === 'local') {
          const file = localFiles[sessionId]
          if (!file) {
            throw new Error('Local session not found. Re-import the JSONL file.')
          }
          const text = await file.text()
          const path = localSessions.find((item) => item.id === sessionId)?.path ?? file.name
          if (!ignore) {
            setSession({ sessionId, path, text })
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

  const entries = useMemo(() => parseClaudeJsonl(session?.text ?? ''), [session?.text])
  const toolUseLookup = useMemo(() => buildToolUseLookup(entries), [entries])
  const fileHistoryIndex = useMemo(() => buildFileHistoryIndex(entries), [entries])

  const selectEntry = (entryId: string, options?: { scroll?: boolean }) => {
    setSelectedId(entryId)
    const domId = entryDomId(entryId)
    const nextHash = `#${domId}`
    if (window.location.hash !== nextHash) {
      const url = `${window.location.pathname}${window.location.search}${nextHash}`
      window.history.replaceState(null, '', url)
    }
    if (options?.scroll) {
      scrollToEntry(entryId)
    }
  }

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
    return entries.filter((entry) => active.has(entry.category))
  }, [entries, filters])

  const selectedEntry = entries.find((entry) => entry.id === selectedId)
  const showMiniMapColumn = showMiniMap && !loading && !error && filteredEntries.length > 0

  return (
    <div className={`page-shell session-page density-${density}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">o</span>
            <span className="brand-name">Spectator</span>
            <span className="brand-sub">Claude Sessions</span>
          </div>
          <div className="topbar-actions">
            <Link to="/" className="link-chip">
              New Session
            </Link>
          </div>
        </div>
      </header>
      <main className={`workspace${showMiniMapColumn ? ' has-minimap' : ''}`}>
        <section className="timeline-column">
          <div className="session-header">
            <div>
              <p className="eyebrow">Session</p>
              <h2>{sessionId}</h2>
              <p className="muted">{session?.path ?? 'Loading file path...'}</p>
            </div>
            <div className="session-header-controls">
              <div className="session-meta">
                <div>
                  <span>Entries</span>
                  <strong>{entries.length}</strong>
                </div>
                <div>
                  <span>Filtered</span>
                  <strong>{filteredEntries.length}</strong>
                </div>
              </div>
              <div className="density-toggle" role="group" aria-label="Density">
                <button
                  type="button"
                  className={density === 'comfortable' ? 'density-button active' : 'density-button'}
                  onClick={() => {
                    setDensityAuto(false)
                    setDensity('comfortable')
                  }}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  className={density === 'compact' ? 'density-button active' : 'density-button'}
                  onClick={() => {
                    setDensityAuto(false)
                    setDensity('compact')
                  }}
                >
                  Compact
                </button>
              </div>
            </div>
          </div>
          <div className="filter-row">
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
            <div className="view-toggles">
              <button
                type="button"
                className="mini-map-toggle"
                onClick={() => setShowMiniMap((current) => !current)}
              >
                {showMiniMap ? 'Hide minimap' : 'Show minimap'}
              </button>
              <button
                type="button"
                className="density-quick"
                onClick={() => {
                  setDensityAuto(false)
                  setDensity((current) => (current === 'compact' ? 'comfortable' : 'compact'))
                }}
              >
                {density === 'compact' ? 'Comfortable' : 'Compact'}
              </button>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Loading session...</div>
          ) : error ? (
            <div className="empty-state error">{error}</div>
          ) : filteredEntries.length ? (
            <div className="timeline-shell">
              <div className="timeline">
                {filteredEntries.map((entry) => (
                  <EventCard
                    key={entry.id}
                    entry={entry}
                    selected={entry.id === selectedId}
                    onSelect={() => selectEntry(entry.id)}
                    toolUseLookup={toolUseLookup}
                    fileHistoryIndex={fileHistoryIndex}
                    sessionId={sessionId ?? ''}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">No entries match the current filters.</div>
          )}
        </section>
        <aside className="inspector">
          <div className="inspector-card">
            <p className="eyebrow">Inspector</p>
            <h3>Raw JSON</h3>
            <p className="muted">
              Select an entry to see the original JSON line as stored in the session file.
            </p>
            {selectedEntry ? (
              <pre>{prettyJson(selectedEntry.data ?? selectedEntry.raw)}</pre>
            ) : (
              <div className="empty-state compact">Select a log entry to inspect it.</div>
            )}
          </div>
        </aside>
        {showMiniMapColumn ? (
          <aside className="mini-map-column">
            <MiniMap
              entries={filteredEntries}
              selectedId={selectedId}
              onJump={(entryId) => {
                selectEntry(entryId, { scroll: true })
              }}
            />
          </aside>
        ) : null}
      </main>
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

function EventCard({
  entry,
  selected,
  onSelect,
  toolUseLookup,
  fileHistoryIndex,
  sessionId,
}: {
  entry: ParsedEntry
  selected: boolean
  onSelect: () => void
  toolUseLookup: ToolUseLookup
  fileHistoryIndex: FileHistoryIndex
  sessionId: string
}) {
  const [copied, setCopied] = useState(false)
  const role = entry.error ? 'error' : entry.role ?? String(entry.data?.type ?? 'entry')
  const timestamp = entry.timestamp ?? 'n/a'
  const pills = buildPills(entry, role)
  const domId = entryDomId(entry.id)
  const entryLink = `#${domId}`

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
      className={`event-card ${selected ? 'selected' : ''}`}
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
        <span className="timestamp">{timestamp}</span>
        <span className="entry-actions">
          <a
            className="entry-link"
            href={entryLink}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onSelect()
            }}
            title="Link to entry"
          >
            Link
          </a>
          <button
            type="button"
            className="entry-copy"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void copyLink()
            }}
            title="Copy entry link"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
      <div className="event-body">
        {renderEntryBody(entry, toolUseLookup, fileHistoryIndex, sessionId)}
      </div>
    </article>
  )
}

function MiniMap({
  entries,
  selectedId,
  onJump,
}: {
  entries: ParsedEntry[]
  selectedId: string | null
  onJump: (entryId: string) => void
}) {
  if (!entries.length) {
    return null
  }

  const total = entries.length

  return (
    <div className="mini-map" aria-label="Timeline minimap">
      <div className="mini-map-header">
        <p className="eyebrow">Timeline Map</p>
        <div className="mini-map-legend">
          {MINIMAP_LEGEND.map((item) => (
            <span key={item.category} className="mini-map-legend-item">
              <span className="mini-map-key" data-category={item.category} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mini-map-track">
        {entries.map((entry, index) => {
          const isActive = entry.id === selectedId
          const position = total > 1 ? (index / (total - 1)) * 100 : 0
          const tooltip = buildMiniMapTooltip(entry)
          return (
            <button
              key={`mini-${entry.id}`}
              type="button"
              className={`mini-map-dot${isActive ? ' active' : ''}`}
              data-category={entry.category}
              style={{ top: `${position}%` }}
              data-tooltip={tooltip}
              aria-label={tooltip}
              onClick={() => onJump(entry.id)}
            />
          )
        })}
      </div>
    </div>
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
      return (
        <details key={index} className="thinking">
          <summary>Thinking</summary>
          <pre>{entry.thinking as string}</pre>
        </details>
      )
    }

    if (type === 'tool_use') {
      const input = entry.input as Record<string, unknown> | undefined
      const filePath = input?.file_path as string | undefined
      return (
        <div key={index} className="tool-block">
          <div className="tool-header">
            <span>Tool Call</span>
            <strong>{entry.name as string}</strong>
          </div>
          {filePath ? (
            <div className="file-chip">
              <span>{filePath}</span>
              <em>{fileExtension(filePath) || 'file'}</em>
            </div>
          ) : null}
          <pre>{prettyJson(entry.input)}</pre>
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
        const timestamp = formatTimestamp(data.timestamp ?? message?.timestamp)
        return {
          id: deriveId(data, index),
          raw: line,
          data,
          category,
          role,
          timestamp,
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
  const normalizedLanguage = normalizeLanguage(language)
  const preview = previewText(code, PREVIEW_LINE_LIMIT)
  const highlighted = highlightCode(preview.text, normalizedLanguage)
  const languageLabel = displayLanguage?.trim() || normalizedLanguage || 'text'

  return (
    <div className="code-block">
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
        <div className="code-truncation">
          Showing first {preview.limit} of {preview.totalLines} lines.
        </div>
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

function buildMiniMapTooltip(entry: ParsedEntry) {
  const roleLabel = entry.role ?? String(entry.data?.type ?? 'entry')
  const title = entry.timestamp ? `${roleLabel} • ${entry.timestamp}` : roleLabel
  const preview = extractEntryPreview(entry)
  if (!preview) {
    return title
  }
  return `${title}\n${preview}`
}

function extractEntryPreview(entry: ParsedEntry) {
  if (entry.error) {
    return `Parse error: ${entry.error}`
  }
  const data = entry.data ?? {}
  const type = data.type as string | undefined
  if (type === 'summary') {
    return truncateLine(String(data.summary ?? ''), 120)
  }
  if (type === 'file-history-snapshot') {
    return 'File history snapshot'
  }
  if (type === 'queue-operation') {
    const operation = String(data.operation ?? '').trim()
    const content = String(data.content ?? '').trim()
    return truncateLine([operation, content].filter(Boolean).join(' '), 120)
  }
  if (type === 'system') {
    return truncateLine(String(data.subtype ?? 'System event'), 120)
  }
  if (type === 'assistant' || type === 'user') {
    const message = data.message as Record<string, unknown> | undefined
    const content = message?.content
    const text = extractTextFromContent(content)
    return truncateLine(text, 120)
  }
  return truncateLine(String(data.type ?? 'Entry'), 120)
}

function extractTextFromContent(content: unknown) {
  if (!content) {
    return ''
  }
  if (typeof content === 'string') {
    return firstNonEmptyLine(content)
  }
  const items = Array.isArray(content) ? content : [content]
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const record = item as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      return firstNonEmptyLine(record.text)
    }
  }
  return ''
}

function firstNonEmptyLine(text: string) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return text.trim()
}

function truncateLine(text: string, maxLength: number) {
  if (!text) {
    return ''
  }
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, maxLength - 3)}...`
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
