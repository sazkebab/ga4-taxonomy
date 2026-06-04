/**
 * Journey mapping data utilities.
 * Uses GA4 pageReferrer + pagePath to build a user journey tree.
 * No BigQuery required — works with the standard GA4 Data API.
 */
import { runReport } from '@/lib/ga4Report'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageGroup {
  name:    string
  pattern: string
  color:   string
  order:   number
}

export interface NivoNode {
  name:      string
  color?:    string
  value?:    number
  children?: NivoNode[]
}

// ─── Page group matching ──────────────────────────────────────────────────────

/** Strip domain from a full URL, returning just the path */
function stripDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    // Not a full URL — already a path, or empty
    return url || '/'
  }
}

/** Check if a URL is an external referrer (different domain or empty) */
function isExternal(referrer: string, sampleHost: string): boolean {
  if (!referrer) return true
  try {
    const ref = new URL(referrer)
    return ref.hostname !== sampleHost
  } catch {
    return false
  }
}

/**
 * Match a path against page group patterns.
 * Supports exact match ("/") and wildcard suffix ("/products/*").
 * If no groups defined, returns the raw path.
 */
export function matchPageGroup(path: string, groups: PageGroup[]): string {
  if (groups.length === 0) return path
  for (const g of groups) {
    const p = g.pattern.trim()
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, -2)
      if (path === prefix || path.startsWith(prefix + '/')) return g.name
    } else {
      if (path === p) return g.name
    }
  }
  return path  // unmatched — show raw path
}

function groupColor(name: string, groups: PageGroup[]): string | undefined {
  const g = groups.find((g) => g.name === name)
  return g?.color || undefined
}

// ─── GA4 data fetching ────────────────────────────────────────────────────────

export interface JourneyTransitions {
  /** entry page path → session count */
  landingPages: Map<string, number>
  /** from path → (to path → user count) */
  edges:        Map<string, Map<string, number>>
  /** sample host (used to detect external referrers) */
  sampleHost:   string
}

export async function fetchJourneyTransitions(
  accessToken: string,
  propertyId:  string,
  startDate:   string,
  endDate:     string,
): Promise<JourneyTransitions> {
  const dateRanges = [{ start_date: startDate, end_date: endDate }]

  const [landingRows, transitionRows] = await Promise.all([
    runReport(accessToken, propertyId, ['landingPage'], ['sessions'], dateRanges, 50),
    runReport(accessToken, propertyId, ['pageReferrer', 'pagePath'], ['totalUsers'], dateRanges, 2000),
  ])

  // Detect the site's own host from internal referrers
  let sampleHost = ''
  for (const row of transitionRows) {
    const ref = row.pageReferrer ?? ''
    if (ref.startsWith('http')) {
      try {
        sampleHost = new URL(ref).hostname
        break
      } catch { /* ignore */ }
    }
  }

  // Build landing page map
  const landingPages = new Map<string, number>()
  for (const row of landingRows) {
    const path     = row.landingPage || '/'
    const sessions = parseInt(row.sessions ?? '0', 10)
    if (sessions > 0) landingPages.set(path, (landingPages.get(path) ?? 0) + sessions)
  }

  // Build adjacency edges
  const edges = new Map<string, Map<string, number>>()
  for (const row of transitionRows) {
    const refFull = row.pageReferrer ?? ''
    const toPath  = row.pagePath    ?? '/'
    const users   = parseInt(row.totalUsers ?? '0', 10)
    if (users <= 0) continue

    // Determine from-path
    let fromPath: string
    if (!refFull || isExternal(refFull, sampleHost)) {
      fromPath = '(external)'
    } else {
      fromPath = stripDomain(refFull) || '/'
    }

    if (!edges.has(fromPath)) edges.set(fromPath, new Map())
    const targets = edges.get(fromPath)!
    targets.set(toPath, (targets.get(toPath) ?? 0) + users)
  }

  return { landingPages, edges, sampleHost }
}

// ─── Tree building ────────────────────────────────────────────────────────────

const MAX_CHILDREN = 6  // max segments shown per ring level

export function buildJourneyTree(
  { landingPages, edges }: JourneyTransitions,
  groups:   PageGroup[],
  maxDepth: number,
  minUsers: number,
): NivoNode {
  // Group landing pages
  const groupedLanding = new Map<string, number>()
  for (const [path, count] of landingPages) {
    const name = matchPageGroup(path, groups)
    groupedLanding.set(name, (groupedLanding.get(name) ?? 0) + count)
  }

  // Also include entries via external referrers
  const externalEdges = edges.get('(external)')
  if (externalEdges) {
    for (const [path, count] of externalEdges) {
      const name = matchPageGroup(path, groups)
      groupedLanding.set(name, (groupedLanding.get(name) ?? 0) + count)
    }
  }

  // Sort and cap landing pages
  const topLanding = [...groupedLanding.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v >= minUsers)
    .slice(0, MAX_CHILDREN)

  /** Recursively build child nodes for a given group name */
  function buildChildren(
    fromGroupName: string,
    depth: number,
    visitedGroups: Set<string>,
  ): NivoNode[] {
    if (depth >= maxDepth) return []

    // Collect all raw paths that belong to this group
    const fromPaths: string[] = []
    if (fromGroupName === '(external)') {
      fromPaths.push('(external)')
    } else {
      // Find all paths that map to this group
      for (const [path] of edges) {
        if (matchPageGroup(path, groups) === fromGroupName) {
          fromPaths.push(path)
        }
      }
    }

    // Aggregate transitions to next pages
    const nextGroupCounts = new Map<string, number>()
    for (const fromPath of fromPaths) {
      const targets = edges.get(fromPath)
      if (!targets) continue
      for (const [toPath, count] of targets) {
        const toGroup = matchPageGroup(toPath, groups)
        if (!visitedGroups.has(toGroup)) {
          nextGroupCounts.set(toGroup, (nextGroupCounts.get(toGroup) ?? 0) + count)
        }
      }
    }

    return [...nextGroupCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, v]) => v >= minUsers)
      .slice(0, MAX_CHILDREN)
      .map(([name, value]) => {
        const nextVisited = new Set([...visitedGroups, name])
        return {
          name,
          value,
          color:    groupColor(name, groups),
          children: buildChildren(name, depth + 1, nextVisited),
        }
      })
  }

  const children: NivoNode[] = topLanding.map(([name, value]) => ({
    name,
    value,
    color:    groupColor(name, groups),
    children: buildChildren(name, 1, new Set([name])),
  }))

  const totalUsers = topLanding.reduce((s, [, v]) => s + v, 0)

  return {
    name:     'All sessions',
    value:    totalUsers,
    children,
  }
}
