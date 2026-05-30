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
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Parameter {
  id: string
  name: string
  description: string
  example: string
  type: string
  isGlobal: boolean
  requiresGA4Registration: boolean
  ga4Registered: boolean
}

interface Props {
  action: 'create' | 'edit'
  parameter?: Parameter
  apiBase: string
}

export default function ParametersClient({ action, parameter, apiBase }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(parameter?.name ?? '')
  const [description, setDescription] = useState(parameter?.description ?? '')
  const [example, setExample] = useState(parameter?.example ?? '')
  const [type, setType] = useState(parameter?.type ?? 'string')
  const [isGlobal, setIsGlobal] = useState(parameter?.isGlobal ?? false)
  const [requiresGA4Registration, setRequiresGA4Registration] = useState(
    parameter?.requiresGA4Registration ?? false
  )
  const [ga4Registered, setGa4Registered] = useState(parameter?.ga4Registered ?? false)

  const resetForm = () => {
    setName(parameter?.name ?? '')
    setDescription(parameter?.description ?? '')
    setExample(parameter?.example ?? '')
    setType(parameter?.type ?? 'string')
    setIsGlobal(parameter?.isGlobal ?? false)
    setRequiresGA4Registration(parameter?.requiresGA4Registration ?? false)
    setGa4Registered(parameter?.ga4Registered ?? false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)

    const url = action === 'create'
      ? `${apiBase}/parameters`
      : `${apiBase}/parameters/${parameter!.id}`
    const method = action === 'create' ? 'POST' : 'PUT'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, example, type, isGlobal, requiresGA4Registration, ga4Registered }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error?.formErrors?.[0] ?? 'Failed to save')
    } else {
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  const del = async () => {
    if (!confirm(`Delete parameter "${parameter!.name}"?`)) return
    await fetch(`${apiBase}/parameters/${parameter!.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="flex gap-1">
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (v) resetForm()
        }}
      >
        <DialogTrigger
          render={<Button variant={action === 'create' ? 'default' : 'outline'} size="sm" />}
        >
          {action === 'create' ? '+ New parameter' : 'Edit'}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === 'create' ? 'New parameter' : 'Edit parameter'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. item_id" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What this parameter captures..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Example value</Label>
              <Input
                value={example}
                onChange={(e) => setExample(e.target.value)}
                placeholder="e.g. product_123"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v ?? 'string')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="int">Int</SelectItem>
                  <SelectItem value="float">Float</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="isGlobal"
                checked={isGlobal}
                onCheckedChange={(v) => setIsGlobal(Boolean(v))}
              />
              <Label htmlFor="isGlobal" className="cursor-pointer">
                Global (applies to all events)
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="requiresGA4Registration"
                checked={requiresGA4Registration}
                onCheckedChange={(v) => setRequiresGA4Registration(Boolean(v))}
              />
              <Label htmlFor="requiresGA4Registration" className="cursor-pointer">
                Requires GA4 custom dimension registration
              </Label>
            </div>
            {requiresGA4Registration && (
              <div className="flex items-center gap-3 ml-6">
                <Checkbox
                  id="ga4Registered"
                  checked={ga4Registered}
                  onCheckedChange={(v) => setGa4Registered(Boolean(v))}
                />
                <Label htmlFor="ga4Registered" className="cursor-pointer">
                  Registered in GA4
                </Label>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={saving} size="sm">
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {action === 'edit' && (
        <Button variant="ghost" size="sm" className="text-destructive" onClick={del}>
          Delete
        </Button>
      )}
    </div>
  )
}
