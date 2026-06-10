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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface User {
  id: string
  name: string | null
  email: string | null
}

type Action =
  | 'rename'
  | 'create-project'
  | 'delete-project'
  | 'assign-user'
  | 'remove-user'
  | 'toggle-admin'
  | 'toggle-template'
  | 'delete-client'

interface Props {
  clientId: string
  clientName?: string
  action: Action
  currentName?: string
  projectId?: string
  projectName?: string
  userId?: string
  userName?: string
  isSuperAdmin?: boolean
  isTemplate?: boolean
  unassignedUsers?: User[]
}

export default function AdminClientDetail({
  clientId,
  clientName,
  action,
  currentName,
  projectId,
  projectName,
  userId,
  userName,
  isSuperAdmin,
  isTemplate,
  unassignedUsers = [],
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(currentName ?? '')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)

    try {
      if (action === 'rename') {
        await fetch(`/api/clients/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: value }),
        })
      } else if (action === 'create-project') {
        await fetch(`/api/clients/${clientId}/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: value }),
        })
      } else if (action === 'delete-project') {
        if (!confirm(`Delete project "${projectName}"? All events will be deleted.`)) {
          setLoading(false)
          return
        }
        await fetch(`/api/clients/${clientId}/projects/${projectId}`, { method: 'DELETE' })
      } else if (action === 'assign-user') {
        const body = selectedUserId
          ? { userId: selectedUserId }
          : { email: inviteEmail.trim() }
        const res = await fetch(`/api/clients/${clientId}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Failed to invite user')
          setLoading(false)
          return
        }
      } else if (action === 'remove-user') {
        if (!confirm(`Remove ${userName} from this client?`)) {
          setLoading(false)
          return
        }
        await fetch(`/api/clients/${clientId}/users?userId=${userId}`, { method: 'DELETE' })
      } else if (action === 'toggle-template') {
        await fetch(`/api/clients/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isTemplate: !isTemplate }),
        })
      } else if (action === 'toggle-admin') {
        await fetch(`/api/admin/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isSuperAdmin: !isSuperAdmin }),
        })
      } else if (action === 'delete-client') {
        if (!confirm(`Delete "${clientName}"? This will permanently delete all projects, events and parameters. This cannot be undone.`)) {
          setLoading(false)
          return
        }
        const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Delete failed')
          setLoading(false)
          return
        }
        router.push('/admin/clients')
        return
      }

      setOpen(false)
      router.refresh()
    } catch {
      setError('Action failed')
    }
    setLoading(false)
  }

  if (action === 'remove-user') {
    return (
      <Button variant="ghost" size="sm" className="text-destructive text-xs h-7 px-2" onClick={run} disabled={loading}>
        Remove
      </Button>
    )
  }

  if (action === 'delete-project') {
    return (
      <Button variant="ghost" size="sm" className="text-destructive text-xs h-7 px-2" onClick={run} disabled={loading}>
        Delete
      </Button>
    )
  }

  if (action === 'delete-client') {
    return (
      <Button variant="destructive" size="sm" onClick={run} disabled={loading}>
        {loading ? 'Deleting…' : 'Delete client'}
      </Button>
    )
  }

  if (action === 'toggle-template') {
    return (
      <Button
        variant={isTemplate ? 'default' : 'outline'}
        size="sm"
        className={isTemplate ? 'bg-green-600 hover:bg-green-700 text-white text-xs h-8' : 'text-xs h-8'}
        onClick={run}
        disabled={loading}
      >
        {isTemplate ? '✓ Template (visible to all)' : 'Make template'}
      </Button>
    )
  }

  if (action === 'toggle-admin') {
    return (
      <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={run} disabled={loading}>
        {isSuperAdmin ? 'Remove admin' : 'Make admin'}
      </Button>
    )
  }

  const labels: Record<Action, string> = {
    rename: 'Rename',
    'create-project': '+ New project',
    'delete-project': 'Delete',
    'assign-user': '+ Invite user',
    'remove-user': 'Remove',
    'toggle-admin': '',
    'toggle-template': '',
    'delete-client': 'Delete client',
  }

  const titles: Partial<Record<Action, string>> = {
    rename: 'Rename client',
    'create-project': 'New project',
    'assign-user': 'Invite user to this client',
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setSelectedUserId('')
          setInviteEmail('')
          setError(null)
        }
      }}
    >
      <DialogTrigger
        render={<Button variant={action === 'rename' ? 'outline' : 'default'} size="sm" />}
      >
        {labels[action]}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(action === 'rename' || action === 'create-project') && (
            <div className="space-y-1.5">
              <Label>{action === 'rename' ? 'Client name' : 'Project name'}</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {action === 'assign-user' && (
            <div className="space-y-4">
              {unassignedUsers.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Existing user</Label>
                  <Select
                    value={selectedUserId}
                    onValueChange={(v) => { setSelectedUserId(v ?? ''); setInviteEmail('') }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unassignedUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name ?? u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{unassignedUsers.length > 0 ? 'Or invite by email' : 'Invite by email'}</Label>
                <Input
                  type="email"
                  placeholder="name@gmail.com"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setSelectedUserId('') }}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                  autoFocus={unassignedUsers.length === 0}
                />
                <p className="text-xs text-muted-foreground">
                  They&apos;ll get access to this client automatically when they sign in with this Google account.
                </p>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={run}
              disabled={loading || (action === 'assign-user' && !selectedUserId && !inviteEmail.trim())}
              size="sm"
            >
              {loading ? (action === 'assign-user' ? 'Inviting...' : 'Saving...') : (action === 'assign-user' ? 'Invite' : 'Save')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
