'use client'

import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  docId:        string | null   // null = doc not created yet
  initialId:    string
  apiBase:      string
  onSaved:      (id: string) => void
}

function HeadSnippet({ id }: { id: string }) {
  return `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');</script>
<!-- End Google Tag Manager -->`
}

function BodySnippet({ id }: { id: string }) {
  return `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`
}

function CodeSnippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={copy}
          data-print-hide
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs bg-muted/50 rounded-md border border-border p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

export default function GtmInstallSection({ docId, initialId, apiBase, onSaved }: Props) {
  const [containerId, setContainerId] = useState(initialId)
  const [saving, setSaving]           = useState(false)
  const savedRef                      = useRef(initialId)
  const isValid = /^GTM-[A-Z0-9]+$/i.test(containerId.trim())

  async function save(value: string) {
    const trimmed = value.trim()
    if (trimmed === savedRef.current) return
    setSaving(true)
    try {
      await fetch(`${apiBase}/datalayer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtmContainerId: trimmed }),
      })
      savedRef.current = trimmed
      onSaved(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span>GTM Installation</span>
          {saving && <span className="text-xs font-normal text-muted-foreground">Saving…</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5" data-print-hide>
          <Label className="text-sm">GTM Container ID</Label>
          <Input
            className="max-w-xs font-mono"
            placeholder="GTM-XXXXXXX"
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
            onBlur={(e) => save(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Found in GTM → Admin → Container Settings
          </p>
        </div>

        {containerId && isValid ? (
          <div className="space-y-4">
            <CodeSnippet
              label="1. Paste immediately after the opening <head> tag"
              code={HeadSnippet({ id: containerId.trim() })}
            />
            <CodeSnippet
              label="2. Paste immediately after the opening <body> tag"
              code={BodySnippet({ id: containerId.trim() })}
            />
          </div>
        ) : containerId && !isValid ? (
          <p className="text-xs text-muted-foreground italic">
            Enter a valid container ID (e.g. GTM-ABC1234) to see the install snippets.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Enter your GTM Container ID above to generate the install snippets.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
