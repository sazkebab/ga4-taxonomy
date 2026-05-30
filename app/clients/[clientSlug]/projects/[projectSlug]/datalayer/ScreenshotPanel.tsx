'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Screenshot {
  id:        string
  filename:  string
  createdAt: string
  context:   string
}

interface Props {
  sectionId:      string
  screenshots:    Screenshot[]
  screenshotsUrl: string
  context?:       string   // "test" (default) | "trigger"
  label?:         string
  onUpdate:       (screenshots: Screenshot[]) => void
}

export default function ScreenshotPanel({ sectionId: _, screenshots, screenshotsUrl, context = 'test', label, onUpdate }: Props) {
  const headingLabel = label ?? (context === 'trigger' ? 'Trigger screenshots' : 'Failure screenshots')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setError('Only image files are supported')
          continue
        }
        if (file.size > 5 * 1024 * 1024) {
          setError(`${file.name} is too large (max 5 MB)`)
          continue
        }

        const dataUrl = await readAsDataUrl(file)
        const res = await fetch(screenshotsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, dataUrl, context }),
        })

        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? 'Upload failed')
          continue
        }

        const saved = await res.json()
        onUpdate([...screenshots, saved])
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function deleteScreenshot(screenshotId: string) {
    const res = await fetch(`${screenshotsUrl}/${screenshotId}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      onUpdate(screenshots.filter((s) => s.id !== screenshotId))
    }
  }

  async function openPreview(screenshotId: string, filename: string) {
    const res = await fetch(`${screenshotsUrl}/${screenshotId}`)
    if (res.ok) {
      const data = await res.json()
      setPreviewUrl(data.dataUrl)
      setPreviewName(filename)
    }
  }

  return (
    <div data-print-hide>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {headingLabel} {screenshots.length > 0 && `(${screenshots.length})`}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : '+ Upload screenshot'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {screenshots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {screenshots.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1"
            >
              <button
                className="text-xs text-blue-600 hover:underline max-w-32 truncate"
                onClick={() => openPreview(s.id, s.filename)}
                title={s.filename}
              >
                🖼 {s.filename}
              </button>
              <button
                className="text-xs text-muted-foreground hover:text-destructive ml-1"
                onClick={() => deleteScreenshot(s.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { setPreviewUrl(null); setPreviewName(null) }}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-medium">{previewName}</span>
              <button
                className="text-muted-foreground hover:text-foreground text-lg"
                onClick={() => { setPreviewUrl(null); setPreviewName(null) }}
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={previewName ?? 'Screenshot'}
              className="max-h-[80vh] max-w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
