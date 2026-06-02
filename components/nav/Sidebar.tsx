'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useParams } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useEffect, useState } from 'react'

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const params = useParams<{ clientSlug?: string; projectSlug?: string }>()

  const { clientSlug, projectSlug } = params ?? {}

  const [clientName, setClientName] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)

  useEffect(() => {
    if (!clientSlug) { setClientName(null); setProjectName(null); return }
    const qs = projectSlug
      ? `?clientSlug=${encodeURIComponent(clientSlug)}&projectSlug=${encodeURIComponent(projectSlug)}`
      : `?clientSlug=${encodeURIComponent(clientSlug)}`
    fetch(`/api/resolve${qs}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        setClientName(d?.clientName ?? null)
        setProjectName(d?.projectName ?? null)
      })
      .catch(() => { setClientName(null); setProjectName(null) })
  }, [clientSlug, projectSlug])

  // Build contextual nav items
  const navItems = (() => {
    if (clientSlug && projectSlug) {
      const base = `/clients/${clientSlug}/projects/${projectSlug}`
      return [
        { href: `${base}/events`,      label: 'Events',     icon: '📋' },
        { href: `${base}/parameters`,  label: 'Parameters', icon: '🔧' },
        { href: `${base}/ga4`,         label: 'GA4 Sync',   icon: '🔄' },
        { href: `${base}/import`,      label: 'Import',     icon: '📥' },
        { href: `${base}/datalayer`,   label: 'Dev Docs',   icon: '📄' },
        { href: `${base}/analysis`,   label: 'Analysis',   icon: '🔍' },
      ]
    }
    if (clientSlug) {
      return [
        { href: `/clients/${clientSlug}/projects`, label: 'Projects', icon: '📁' },
      ]
    }
    return [
      { href: '/clients', label: 'Clients', icon: '🏢' },
    ]
  })()

  return (
    <aside className="w-56 min-h-screen flex flex-col" style={{ backgroundColor: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' }}>

      {/* Logo */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <Link href="/clients" className="block">
          <div className="inline-flex items-center rounded px-2 py-1.5 bg-white">
            <Image
              src="/meliorum-logo.png"
              alt="Meliorum"
              width={150}
              height={31}
              priority
              className="block"
            />
          </div>
          <p className="text-xs mt-1.5 ml-0.5" style={{ color: 'var(--sidebar-foreground)', opacity: 0.55 }}>
            GA4 Taxonomy
          </p>
        </Link>
      </div>

      {/* Breadcrumb context */}
      {(clientSlug || projectSlug) && (
        <div className="px-4 py-2 space-y-0.5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <Link
            href="/clients"
            className="text-xs block truncate transition-opacity hover:opacity-100"
            style={{ color: 'var(--sidebar-foreground)', opacity: 0.5 }}
          >
            Clients
          </Link>
          {clientSlug && (
            <Link
              href={`/clients/${clientSlug}/projects`}
              className="text-xs block truncate transition-opacity hover:opacity-100"
              style={{
                color: 'var(--sidebar-foreground)',
                opacity: projectSlug ? 0.5 : 1,
                fontWeight: !projectSlug ? 500 : undefined,
              }}
            >
              → {clientName ?? '…'}
            </Link>
          )}
          {projectSlug && (
            <span className="text-xs block truncate font-medium" style={{ color: 'var(--sidebar-foreground)' }}>
              → {projectName ?? '…'}
            </span>
          )}
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--sidebar-primary)', color: 'var(--sidebar-primary-foreground)', fontWeight: 500 }
                  : { color: 'var(--sidebar-foreground)', opacity: 0.75 }
              }
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'var(--sidebar-accent)'
                  e.currentTarget.style.opacity = '1'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = ''
                  e.currentTarget.style.opacity = '0.75'
                }
              }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}

        {/* Help + Admin links */}
        <div className="pt-2 mt-2 space-y-1" style={{ borderTop: '1px solid color-mix(in oklch, var(--sidebar-border) 60%, transparent)' }}>
          {[
            { href: '/help',          label: 'Help',  icon: '❓' },
            { href: '/admin/clients', label: 'Admin', icon: '⚙️' },
          ].map(({ href, label, icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
                style={
                  active
                    ? { backgroundColor: 'var(--sidebar-primary)', color: 'var(--sidebar-primary-foreground)', fontWeight: 500 }
                    : { color: 'var(--sidebar-foreground)', opacity: 0.75 }
                }
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = 'var(--sidebar-accent)'
                    e.currentTarget.style.opacity = '1'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = ''
                    e.currentTarget.style.opacity = '0.75'
                  }
                }}
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User section */}
      {session?.user && (
        <div className="p-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Avatar className="h-7 w-7">
              <AvatarImage src={session.user.image ?? undefined} />
              <AvatarFallback
                className="text-xs"
                style={{ backgroundColor: 'var(--sidebar-accent)', color: 'var(--sidebar-foreground)' }}
              >
                {session.user.name?.charAt(0) ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--sidebar-foreground)' }}>
                {session.user.name}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--sidebar-foreground)', opacity: 0.55 }}>
                {session.user.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full text-xs py-1.5 px-3 rounded-md transition-colors text-left"
            style={{ border: '1px solid var(--sidebar-border)', color: 'var(--sidebar-foreground)', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            Sign out
          </button>
        </div>
      )}

      {/* Meliorum geometric accent */}
      <MeliorumAccent />
    </aside>
  )
}

// ─── Meliorum brand accent ────────────────────────────────────────────────────
// 8 × 2 grid of quarter-circle tiles in brand colours, filling the sidebar width

function MeliorumAccent() {
  const S = 28  // tile size px — 8 × 28 = 224 = w-56

  // Brand palette (matches globals.css)
  const B = '#315D9C'  // navy
  const T = '#3DB9BD'  // teal
  const R = '#D6401A'  // red
  const Y = '#FEBB15'  // yellow
  const K = '#1A1A1A'  // black
  const W = '#FFFFFF'  // white

  // Each tile: [bgColour, circleColour, corner]
  // corner = which corner the quarter-circle arc originates from
  type Corner = 'tl' | 'tr' | 'bl' | 'br'
  type Tile   = [string, string, Corner]

  const tiles: Tile[] = [
    // ── row 0 ──────────────────────────────────────────────────────────
    [W, B, 'br'], [W, K, 'bl'], [K, Y, 'tr'], [Y, T, 'tl'],
    [T, W, 'br'], [B, R, 'tl'], [R, W, 'tr'], [W, K, 'bl'],
    // ── row 1 ──────────────────────────────────────────────────────────
    [R, W, 'tr'], [K, B, 'tr'], [Y, K, 'bl'], [W, T, 'bl'],
    [K, R, 'tr'], [W, Y, 'bl'], [T, B, 'tl'], [B, W, 'br'],
  ]

  const COLS = 8

  return (
    <svg
      width={S * COLS}
      height={S * 2}
      viewBox={`0 0 ${S * COLS} ${S * 2}`}
      xmlns="http://www.w3.org/2000/svg"
      className="block shrink-0"
      aria-hidden="true"
    >
      <defs>
        {tiles.map((_, i) => {
          const col = i % COLS
          const row = Math.floor(i / COLS)
          return (
            <clipPath key={i} id={`mel-${i}`}>
              <rect x={col * S} y={row * S} width={S} height={S} />
            </clipPath>
          )
        })}
      </defs>

      {tiles.map(([bg, fg, corner], i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const x   = col * S
        const y   = row * S
        const cx  = corner.includes('r') ? x + S : x
        const cy  = corner.includes('b') ? y + S : y
        return (
          <g key={i}>
            <rect x={x} y={y} width={S} height={S} fill={bg} />
            <circle cx={cx} cy={cy} r={S} fill={fg} clipPath={`url(#mel-${i})`} />
          </g>
        )
      })}
    </svg>
  )
}
