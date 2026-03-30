/**
 * Spectator Visual Config
 *
 * Every visual parameter that matters is exposed here.
 * Changing a value here updates the CSS custom property on :root,
 * which cascades to all components.
 */

export type SpectatorThemeConfig = {
  // ── Typography ──────────────────────────────────────────────
  fontSans: string
  fontSerif: string
  fontMono: string
  lineHeight: number
  lineHeightTight: number
  lineHeightSnug: number
  lineHeightCode: number
  fontWeightNormal: number
  fontWeightMedium: number
  fontWeightSemibold: number
  fontWeightBold: number
  text2xs: string
  textXs: string
  textSm: string
  textBase: string
  textMd: string
  textLg: string
  textXl: string
  letterSpacingWide: string
  letterSpacingWider: string
  letterSpacingWidest: string

  // ── Colors ──────────────────────────────────────────────────
  ink: string
  inkSoft: string
  muted: string
  paper: string
  wash: string
  card: string
  surface: string
  border: string
  borderStrong: string
  accent: string
  accent2: string
  accent3: string
  accent4: string
  glow: string
  topbarBg: string
  codeBg: string
  codeFg: string

  // Category colors
  catMessage: string
  catTool: string
  catSummary: string
  catSnapshot: string
  catSystem: string
  catQueue: string
  catProgress: string
  catError: string
  catOther: string

  // Role badge colors
  roleUserBg: string
  roleUserFg: string
  roleAssistantBg: string
  roleAssistantFg: string
  roleSystemBg: string
  roleSystemFg: string
  roleQueueBg: string
  roleQueueFg: string
  roleErrorBg: string
  roleErrorFg: string

  // Diff colors
  diffAddedBg: string
  diffAddedFg: string
  diffRemovedBg: string
  diffRemovedFg: string

  // Sidechain / thinking
  sidechain: string
  sidechainBg: string
  sidechainBorder: string

  // ── Spacing ─────────────────────────────────────────────────
  space1: string
  space2: string
  space3: string
  space4: string
  space5: string
  space6: string
  space7: string
  space8: string
  space9: string
  space10: string
  space11: string
  space12: string
  contentWidth: string
  rail: string

  // ── Radii ───────────────────────────────────────────────────
  radiusXs: string
  radiusSm: string
  radiusMd: string
  radiusLg: string
  radiusXl: string
  radiusFull: string

  // ── Shadows ─────────────────────────────────────────────────
  shadow: string
  shadowSoft: string
  shadowSm: string

  // ── Animation ───────────────────────────────────────────────
  durationFast: string
  durationNormal: string
  durationSlow: string
  durationSlower: string

  // ── Layout ──────────────────────────────────────────────────
  workspaceCols: string
  workspaceColsMinimap: string

  // ── Dot pattern ─────────────────────────────────────────────
  dotSize: string
  dotColor: string
  dotOpacity: number

  // ── Outline / phases ────────────────────────────────────────
  /** Gap in ms between entries to split into a new phase */
  phaseGapMs: number
}

// ── Default "Classic" theme ─────────────────────────────────────

export const classicTheme: SpectatorThemeConfig = {
  // Typography
  fontSans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
  fontSerif: "'New York', Georgia, serif",
  fontMono: "'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace",
  lineHeight: 1.5,
  lineHeightTight: 1.08,
  lineHeightSnug: 1.2,
  lineHeightCode: 1.55,
  fontWeightNormal: 400,
  fontWeightMedium: 500,
  fontWeightSemibold: 600,
  fontWeightBold: 700,
  text2xs: '0.55rem',
  textXs: '0.65rem',
  textSm: '0.75rem',
  textBase: '0.85rem',
  textMd: '1rem',
  textLg: '1.15rem',
  textXl: '1.35rem',
  letterSpacingWide: '0.1em',
  letterSpacingWider: '0.14em',
  letterSpacingWidest: '0.18em',

  // Colors
  ink: '#111319',
  inkSoft: '#2b333f',
  muted: '#5a646b',
  paper: '#f6f2ea',
  wash: '#edf6f3',
  card: '#fffaf0',
  surface: '#ffffff',
  border: 'rgba(17, 19, 25, 0.12)',
  borderStrong: 'rgba(17, 19, 25, 0.2)',
  accent: '#ff7a59',
  accent2: '#1f7f6a',
  accent3: '#2e5aac',
  accent4: '#f2b857',
  glow: 'rgba(255, 122, 89, 0.18)',
  topbarBg: 'rgba(246, 242, 234, 0.92)',
  codeBg: '#0f141a',
  codeFg: '#f7f3ea',

  catMessage: '#d5dde6',
  catTool: '#f6b17c',
  catSummary: '#7fb0e7',
  catSnapshot: '#84c39f',
  catSystem: '#f2b857',
  catQueue: '#ec8fa1',
  catProgress: '#f2b857',
  catError: '#e1674e',
  catOther: 'rgba(17, 19, 25, 0.12)',

  roleUserBg: '#dff3ff',
  roleUserFg: '#0b5c7c',
  roleAssistantBg: '#e7f6e7',
  roleAssistantFg: '#1d6a3d',
  roleSystemBg: '#fff1dc',
  roleSystemFg: '#8a5a1e',
  roleQueueBg: '#ffe7ec',
  roleQueueFg: '#8f3149',
  roleErrorBg: '#ffe5e1',
  roleErrorFg: '#b84f31',

  diffAddedBg: 'rgba(22, 163, 74, 0.08)',
  diffAddedFg: '#16a34a',
  diffRemovedBg: 'rgba(220, 38, 38, 0.08)',
  diffRemovedFg: '#dc2626',

  sidechain: '#7c3aed',
  sidechainBg: 'rgba(139, 92, 246, 0.1)',
  sidechainBorder: 'rgba(139, 92, 246, 0.2)',

  // Spacing
  space1: '2px',
  space2: '4px',
  space3: '6px',
  space4: '8px',
  space5: '10px',
  space6: '12px',
  space7: '16px',
  space8: '20px',
  space9: '24px',
  space10: '32px',
  space11: '40px',
  space12: '48px',
  contentWidth: '1240px',
  rail: '20px',

  // Radii
  radiusXs: '3px',
  radiusSm: '4px',
  radiusMd: '6px',
  radiusLg: '8px',
  radiusXl: '10px',
  radiusFull: '999px',

  // Shadows
  shadow: '0 18px 40px rgba(16, 23, 32, 0.12)',
  shadowSoft: '0 8px 24px rgba(16, 23, 32, 0.08)',
  shadowSm: '0 1px 3px rgba(16, 23, 32, 0.06)',

  // Animation
  durationFast: '0.15s',
  durationNormal: '0.2s',
  durationSlow: '0.35s',
  durationSlower: '0.5s',

  // Layout
  workspaceCols: 'minmax(0, 2.2fr) minmax(240px, 1fr)',
  workspaceColsMinimap: 'minmax(0, 2.2fr) minmax(240px, 1fr) minmax(140px, 0.4fr)',

  // Dot pattern
  dotSize: '34px',
  dotColor: 'rgba(17, 19, 25, 0.07)',
  dotOpacity: 0.4,

  // Outline
  phaseGapMs: 60 * 60 * 1000, // 1 hour
}

// ── Scout theme ─────────────────────────────────────────────────

export const scoutTheme: SpectatorThemeConfig = {
  ...classicTheme,

  // Typography overrides
  fontSans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
  fontSerif: "'New York', Georgia, serif",
  fontMono: "'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace",

  // Colors
  ink: '#1c1c1a',
  inkSoft: '#3a3a38',
  muted: '#8a8a86',
  paper: '#f9f9f8',
  wash: '#f5f5f3',
  card: '#ffffff',
  surface: '#ffffff',
  border: '#e4e4e2',
  borderStrong: 'rgba(228, 228, 226, 0.8)',
  accent: '#0066ff',
  accent2: '#0066ff',
  accent3: '#0066ff',
  accent4: '#f59e0b',
  glow: 'rgba(0, 102, 255, 0.12)',
  topbarBg: 'rgba(249, 249, 248, 0.92)',
  codeBg: '#1c1c1a',
  codeFg: '#e4e4e2',

  catMessage: '#94a3b8',
  catTool: '#fb923c',
  catSummary: '#3b82f6',
  catSnapshot: '#10b981',
  catSystem: '#f59e0b',
  catQueue: '#f43f5e',
  catProgress: '#f59e0b',
  catError: '#dc2626',
  catOther: 'rgba(28, 28, 26, 0.12)',

  roleUserBg: '#ebf3ff',
  roleUserFg: '#0066ff',
  roleAssistantBg: '#ecfdf5',
  roleAssistantFg: '#059669',
  roleSystemBg: '#fffbeb',
  roleSystemFg: '#d97706',
  roleQueueBg: '#fef2f2',
  roleQueueFg: '#dc2626',
  roleErrorBg: '#fef2f2',
  roleErrorFg: '#dc2626',

  sidechain: '#8b5cf6',
  sidechainBg: 'rgba(139, 92, 246, 0.08)',
  sidechainBorder: 'rgba(139, 92, 246, 0.15)',

  // Shadows — flatter
  shadow: '0 1px 3px rgba(28, 28, 26, 0.08)',
  shadowSoft: '0 1px 2px rgba(28, 28, 26, 0.04)',
  shadowSm: '0 1px 2px rgba(28, 28, 26, 0.04)',

  // Dot pattern — hidden
  dotOpacity: 0,

  // Outline — same default
  phaseGapMs: 60 * 60 * 1000,
}

// ── Variable name mapping ───────────────────────────────────────

// VAR_MAP only includes CSS custom properties (phaseGapMs is runtime-only)
const VAR_MAP: Record<string, string> = {
  fontSans: '--font-sans',
  fontSerif: '--font-serif',
  fontMono: '--font-mono',
  lineHeight: '--line-height',
  lineHeightTight: '--line-height-tight',
  lineHeightSnug: '--line-height-snug',
  lineHeightCode: '--line-height-code',
  fontWeightNormal: '--font-weight-normal',
  fontWeightMedium: '--font-weight-medium',
  fontWeightSemibold: '--font-weight-semibold',
  fontWeightBold: '--font-weight-bold',
  text2xs: '--text-2xs',
  textXs: '--text-xs',
  textSm: '--text-sm',
  textBase: '--text-base',
  textMd: '--text-md',
  textLg: '--text-lg',
  textXl: '--text-xl',
  letterSpacingWide: '--letter-spacing-wide',
  letterSpacingWider: '--letter-spacing-wider',
  letterSpacingWidest: '--letter-spacing-widest',
  ink: '--ink',
  inkSoft: '--ink-soft',
  muted: '--muted',
  paper: '--paper',
  wash: '--wash',
  card: '--card',
  surface: '--surface',
  border: '--border',
  borderStrong: '--border-strong',
  accent: '--accent',
  accent2: '--accent-2',
  accent3: '--accent-3',
  accent4: '--accent-4',
  glow: '--glow',
  topbarBg: '--topbar-bg',
  codeBg: '--code-bg',
  codeFg: '--code-fg',
  catMessage: '--cat-message',
  catTool: '--cat-tool',
  catSummary: '--cat-summary',
  catSnapshot: '--cat-snapshot',
  catSystem: '--cat-system',
  catQueue: '--cat-queue',
  catProgress: '--cat-progress',
  catError: '--cat-error',
  catOther: '--cat-other',
  roleUserBg: '--role-user-bg',
  roleUserFg: '--role-user-fg',
  roleAssistantBg: '--role-assistant-bg',
  roleAssistantFg: '--role-assistant-fg',
  roleSystemBg: '--role-system-bg',
  roleSystemFg: '--role-system-fg',
  roleQueueBg: '--role-queue-bg',
  roleQueueFg: '--role-queue-fg',
  roleErrorBg: '--role-error-bg',
  roleErrorFg: '--role-error-fg',
  diffAddedBg: '--diff-added-bg',
  diffAddedFg: '--diff-added-fg',
  diffRemovedBg: '--diff-removed-bg',
  diffRemovedFg: '--diff-removed-fg',
  sidechain: '--sidechain',
  sidechainBg: '--sidechain-bg',
  sidechainBorder: '--sidechain-border',
  space1: '--space-1',
  space2: '--space-2',
  space3: '--space-3',
  space4: '--space-4',
  space5: '--space-5',
  space6: '--space-6',
  space7: '--space-7',
  space8: '--space-8',
  space9: '--space-9',
  space10: '--space-10',
  space11: '--space-11',
  space12: '--space-12',
  contentWidth: '--content-width',
  rail: '--rail',
  radiusXs: '--radius-xs',
  radiusSm: '--radius-sm',
  radiusMd: '--radius-md',
  radiusLg: '--radius-lg',
  radiusXl: '--radius-xl',
  radiusFull: '--radius-full',
  shadow: '--shadow',
  shadowSoft: '--shadow-soft',
  shadowSm: '--shadow-sm',
  durationFast: '--duration-fast',
  durationNormal: '--duration-normal',
  durationSlow: '--duration-slow',
  durationSlower: '--duration-slower',
  workspaceCols: '--workspace-cols',
  workspaceColsMinimap: '--workspace-cols-minimap',
  dotSize: '--dot-size',
  dotColor: '--dot-color',
  dotOpacity: '--dot-opacity',
}

/**
 * Apply a theme config to the document root.
 * Sets CSS custom properties for every token.
 */
export function applyTheme(config: SpectatorThemeConfig): void {
  const root = document.documentElement
  for (const [key, varName] of Object.entries(VAR_MAP)) {
    const value = config[key as keyof SpectatorThemeConfig]
    root.style.setProperty(varName, String(value))
  }
}

/**
 * Apply a partial override on top of a base theme.
 */
export function applyThemeOverrides(
  base: SpectatorThemeConfig,
  overrides: Partial<SpectatorThemeConfig>,
): void {
  applyTheme({ ...base, ...overrides })
}

/**
 * Read the current value of a theme token from the DOM.
 */
export function getThemeValue(key: keyof SpectatorThemeConfig): string {
  const varName = VAR_MAP[key]
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
}
