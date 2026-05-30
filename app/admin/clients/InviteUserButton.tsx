'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function InviteUserButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reset = () => {
    setEmail('')
    setError(null)
    setSuccess(null)
  }

  const invite = async () => {
    const trimmed = email.trim()
    if (!trimmed) { setError('Enter a Google email address'); return }
    setSaving(true)
    setError(null)
    setSuccess(null)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to add user')
      setSaving(false)
      return
    }

    setSuccess(`${trimmed} added. They can now sign in with Google.`)
    setEmail('')
    setSaving(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger render={<Button variant="outline" />}>
        + Add user
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add user by Google account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter their Google email address. When they sign in with Google they&apos;ll
            automatically get access to any clients you assign them to.
          </p>
          <div className="space-y-1.5">
            <Label>Google email</Label>
            <Input
              type="email"
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && invite()}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <div className="flex gap-2">
            <Button onClick={invite} disabled={saving} size="sm">
              {saving ? 'Adding...' : 'Add user'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              {success ? 'Close' : 'Cancel'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
