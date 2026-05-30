'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { generateTestScript, generateBookmarklet } from '@/lib/generateTestScript'
import type { EventParam } from './types'

interface Props {
  sectionId:    string
  eventName:    string
  category:     string
  trigger:      string
  testUrl:      string
  parameters:   EventParam[]
  sectionUrl:   string
  onUpdate:     (testUrl: string) => void
}

export default function TestingPanel({
  sectionId: _,
  eventName,
  category,
  trigger,
  testUrl,
  parameters,
  sectionUrl,
  onUpdate,
}: Props) {
  const [url, setUrl]             = useState(testUrl ?? '')
  const [copied, setCopied]       = useState(false)
  const [bmCopied, setBmCopied]   = useState(false)

  const params = parameters.map((ep) => ({
    name:  ep.parameter.name,
    value: ep.value ?? 'dynamic',
    type:  ep.parameter.type,
  }))
  const fullName = category ? `custom.${category}.${eventName}` : eventName
  const scriptOpts = { eventName, fullName, trigger, url, params }

  async function saveUrl(val: string) {
    onUpdate(val)
    await fetch(sectionUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testUrl: val }),
    })
  }

  function copyScript() {
    const script = generateTestScript(scriptOpts)
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function copyBookmarklet() {
    const bm = generateBookmarklet(scriptOpts)
    navigator.clipboard.writeText(bm).then(() => {
      setBmCopied(true)
      setTimeout(() => setBmCopied(false), 2500)
    })
  }

  function openUrl() {
    if (url) window.open(url, '_blank', 'noopener')
  }

  const bookmarkletHref = generateBookmarklet(scriptOpts)

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3" data-print-hide>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Testing
      </p>

      {/* URL field */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Page URL</label>
        <input
          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="https://example.com/page-where-event-fires"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={(e) => saveUrl(e.target.value.trim())}
        />
        {url && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0 px-2"
            onClick={openUrl}
            title="Open URL in a new tab"
          >
            ↗ Open
          </Button>
        )}
      </div>

      {/* Instructions + actions */}
      <div className="flex items-start gap-3">
        <div className="flex-1 text-xs text-muted-foreground space-y-1.5">
          <p>
            <span className="font-medium text-foreground">Option A — Console:</span>{' '}
            Open the URL above, open DevTools → Console, paste the test script, then trigger:{' '}
            <em>{trigger || eventName}</em>. Use{' '}
            <a
              href="https://chrome.google.com/webstore/detail/dataslayer/ikbablmmjldhamhcldjjigniffkkjgpo"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              DataSlayer
            </a>{' '}
            to see the full push in a dedicated panel.
          </p>
          <p>
            <span className="font-medium text-foreground">Option B — Bookmarklet:</span>{' '}
            Drag{' '}
            <a
              href={bookmarkletHref}
              onClick={(e) => e.preventDefault()}
              draggable
              className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-blue-700 font-medium cursor-grab hover:bg-blue-100 transition-colors"
              title="Drag this to your bookmarks bar"
            >
              🔖 Arm monitor
            </a>{' '}
            to your bookmarks bar. On the test page, click the bookmark to arm the monitor without needing DevTools open — then trigger the event.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={copyScript}
          >
            {copied ? '✓ Copied!' : '⬡ Copy script'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={copyBookmarklet}
            title="Copy the bookmarklet URL to manually create a bookmark"
          >
            {bmCopied ? '✓ Copied!' : 'Copy bookmarklet URL'}
          </Button>
        </div>
      </div>
    </div>
  )
}
