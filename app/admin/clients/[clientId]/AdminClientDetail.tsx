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
  unassignedUsers = [],
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(currentName ?? '')
  const [selectedUserId, setSelectedUserId] = useState('')
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
        await fetch(`/api/clients/${clientId}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: selectedUserId }),
        })
      } else if (action === 'remove-user') {
        if (!confirm(`Remove ${userName} from this client?`)) {
          setLoading(false)
          return
        }
        await fetch(`/api/clients/${clientId}/users?userId=${userId}`, { method: 'DELETE' })
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
    'assign-user': '+ Assign user',
    'remove-user': 'Remove',
    'toggle-admin': '',
    'delete-client': 'Delete client',
  }

  const titles: Partial<Record<Action, string>> = {
    rename: 'Rename client',
    'create-project': 'New project',
    'assign-user': 'Assign user',
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className="space-y-1.5">
              <Label>User</Label>
              {unassignedUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">All users are already assigned.</p>
              ) : (
                <Select value={selectedUserId} onValueChange={(v) => setSelectedUserId(v ?? '')}>
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
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={run}
              disabled={loading || (action === 'assign-user' && !selectedUserId)}
              size="sm"
            >
              {loading ? 'Saving...' : 'Save'}
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
