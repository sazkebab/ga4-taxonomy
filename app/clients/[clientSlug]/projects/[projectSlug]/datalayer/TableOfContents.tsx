'use client'

import type { Section } from './types'

interface Props {
  categories:          string[]
  sectionsByCategory:  Map<string, Section[]>
}

export default function TableOfContents({ categories, sectionsByCategory }: Props) {
  if (categories.length === 0) return null

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      className="sticky top-6 hidden xl:block rounded-lg border border-border bg-card p-4 text-sm max-h-[calc(100vh-3.5rem)] overflow-y-auto"
      data-print-hide
      aria-label="Table of contents"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Contents
      </p>
      <ul className="space-y-2">
        {categories.map((cat) => {
          const sections = sectionsByCategory.get(cat) ?? []
          return (
            <li key={cat}>
              <button
                className="text-left font-medium hover:text-primary transition-colors w-full truncate capitalize"
                onClick={() => scrollTo(`cat-${cat}`)}
              >
                {cat}
              </button>
              {sections.length > 0 && (
                <ul className="mt-1 ml-3 space-y-1 border-l border-border pl-2">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <button
                        className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors w-full truncate font-mono"
                        onClick={() => scrollTo(`section-${s.id}`)}
                        title={s.event.name}
                      >
                        {s.event.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
