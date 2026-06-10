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
  id:        string   // unique path key used by nivo (e.g. "root/Homepage/Products/(exit)")
  name:      string   // display label
  color?:    string
  value?:    number
  children?: NivoNode[]
}

// ─── Page group matching ──────────────────────────────────────────────────────

/** Normalise a path for consistent matching (remove query string, trailing slash except root) */
function normPath(path: string): string {
  const p = (path || '/').split('?')[0].split('#')[0] || '/'
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p
}

/** True if a value is a GA4 "not set" placeholder or empty */
function isNotSet(v: string): boolean {
  return !v || v === '(not set)' || v === '(not_set)'
}

/**
 * Match a path against page group patterns.
 * Supports exact match ("/") and wildcard suffix ("/products/*").
 * If no groups defined, returns the raw path.
 */
export function matchPageGroup(rawPath: string, groups: PageGroup[]): string {
  const path = normPath(rawPath)
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


// ─── GA4 data fetching ────────────────────────────────────────────────────────

export interface JourneyTransitions {
  /** entry page path → session count */
  landingPages: Map<string, number>
  /** from path → (to path → user count) */
  edges:        Map<string, Map<string, number>>
}

export async function fetchJourneyTransitions(
  accessToken: string,
  propertyId:  string,
  startDate:   string,
  endDate:     string,
): Promise<JourneyTransitions> {
  const dateRanges = [{ start_date: startDate, end_date: endDate }]

  const [landingRows, transitionRows] = await Promise.all([
    runReport(accessToken, propertyId, ['landingPage'], ['sessions'], dateRanges, 100),
    runReport(accessToken, propertyId, ['pageReferrer', 'pagePath'], ['totalUsers'], dateRanges, 2000),
  ])

  // Build landing page map
  const landingPages = new Map<string, number>()
  for (const row of landingRows) {
    const path     = normPath(row.landingPage || '/')
    const sessions = parseInt(row.sessions ?? '0', 10)
    if (sessions > 0 && !isNotSet(path)) {
      landingPages.set(path, (landingPages.get(path) ?? 0) + sessions)
    }
  }

  // Detect own hostname from the first internal referrer we find
  let siteHost = ''
  for (const row of transitionRows) {
    const ref = row.pageReferrer ?? ''
    if (ref.startsWith('http')) {
      try { siteHost = new URL(ref).hostname; break } catch { /* ignore */ }
    }
  }

  // Build adjacency edges — internal navigation only.
  // External/empty/not-set referrers = session entries already in landingPages → skip.
  const edges = new Map<string, Map<string, number>>()
  for (const row of transitionRows) {
    const refRaw = row.pageReferrer ?? ''
    const toRaw  = row.pagePath    ?? '/'
    const users  = parseInt(row.totalUsers ?? '0', 10)

    if (users <= 0 || isNotSet(toRaw)) continue

    // Skip external or missing referrers (session entries)
    if (isNotSet(refRaw)) continue
    try {
      const refHost = new URL(refRaw).hostname
      if (siteHost && refHost !== siteHost) continue   // external — skip
    } catch {
      continue   // not a URL — skip
    }

    const fromPath = normPath(new URL(refRaw).pathname)
    const toPath   = normPath(toRaw)

    if (!edges.has(fromPath)) edges.set(fromPath, new Map())
    edges.get(fromPath)!.set(toPath, (edges.get(fromPath)!.get(toPath) ?? 0) + users)
  }

  return { landingPages, edges }
}

// ─── Tree building ────────────────────────────────────────────────────────────

const MAX_CHILDREN = 6  // max segments shown per ring level

export function buildJourneyTree(
  { landingPages, edges }: JourneyTransitions,
  groups:   PageGroup[],
  maxDepth: number,
  minUsers: number,
): NivoNode {
  // Group landing pages (external/empty referrers already merged into landingPages)
  const groupedLanding = new Map<string, number>()
  for (const [path, count] of landingPages) {
    const name = matchPageGroup(path, groups)
    groupedLanding.set(name, (groupedLanding.get(name) ?? 0) + count)
  }

  // Sort and cap landing pages
  const topLanding = [...groupedLanding.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v >= minUsers)
    .slice(0, MAX_CHILDREN)

  /** Recursively build child nodes for a given group name */
  function buildChildren(
    fromGroupName: string,
    depth:         number,
    visitedGroups: Set<string>,
    parentId:      string,
  ): NivoNode[] {
    if (depth >= maxDepth) return []

    // Collect all raw paths that belong to this group
    const fromPaths: string[] = []
    for (const [path] of edges) {
      if (matchPageGroup(path, groups) === fromGroupName) {
        fromPaths.push(path)
      }
    }

    // Aggregate transitions to next pages
    const nextGroupCounts = new Map<string, number>()
    for (const fromPath of fromPaths) {
      const targets = edges.get(fromPath)
      if (!targets) continue
      for (const [toPath, count] of targets) {
        const toGroup = matchPageGroup(toPath, groups)
        // Allow (exit) even if already visited — it can appear on any branch
        if (!visitedGroups.has(toGroup) || toGroup === '(exit)') {
          nextGroupCounts.set(toGroup, (nextGroupCounts.get(toGroup) ?? 0) + count)
        }
      }
    }

    const sorted   = [...nextGroupCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, v]) => v >= minUsers)

    const top      = sorted.slice(0, MAX_CHILDREN)
    const rest     = sorted.slice(MAX_CHILDREN)
    const otherVal = rest.reduce((s, [, v]) => s + v, 0)

    const nodes = top.map(([name, value]) => {
      const nodeId      = `${parentId}/${name}`
      const nextVisited = new Set([...visitedGroups, name])
      return {
        id:       nodeId,
        name,
        value,
        children: name === '(exit)' ? [] : buildChildren(name, depth + 1, nextVisited, nodeId),
      }
    })

    // Merge tail into (other) if meaningful
    if (otherVal >= minUsers) {
      nodes.push({ id: `${parentId}/(other)`, name: '(other)', value: otherVal, children: [] })
    }

    return nodes
  }

  const children: NivoNode[] = topLanding.map(([name, value]) => {
    const nodeId = `root/${name}`
    return {
      id:       nodeId,
      name,
      value,
      children: buildChildren(name, 1, new Set([name]), nodeId),
    }
  })

  return {
    id:   'root',
    name: 'All sessions',
    children,
  }
}
