'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface ParamStub { id: string; name: string }
interface EventStub {
  id: string
  name: string
  trigger: string
  isKeyEvent: boolean
  requiresDataLayer: boolean
  parameters: ParamStub[]
}
interface ProjectStub { id: string; name: string; events: EventStub[] }
interface ClientStub { id: string; name: string; projects: ProjectStub[] }

interface Props {
  clientId: string
  projectId: string
  copyUrl: string    // /api/clients/[clientId]/projects/[projectId]/events/copy
  libraryUrl: string // /api/events/library?excludeProjectId=[projectId]
}

export default function CopyEventsDialog({ clientId, projectId, copyUrl, libraryUrl }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [library, setLibrary] = useState<ClientStub[]>([])
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

  // Load library when dialog opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(new Set())
    setQ('')
    fetch(libraryUrl)
      .then((r) => r.json())
      .then((data: ClientStub[]) => {
        setLibrary(data)
        // Auto-expand all clients
        setExpandedClients(new Set(data.map((c) => c.id)))
      })
      .finally(() => setLoading(false))
  }, [open, libraryUrl])

  // All events flat (for search + count)
  const allEvents = useMemo(
    () => library.flatMap((c) => c.projects.flatMap((p) => p.events)),
    [library]
  )

  // Filtered library based on search query
  const filtered = useMemo(() => {
    if (!q.trim()) return library
    const lq = q.toLowerCase()
    return library
      .map((client) => ({
        ...client,
        projects: client.projects
          .map((project) => ({
            ...project,
            events: project.events.filter(
              (e) =>
                e.name.toLowerCase().includes(lq) ||
                e.trigger.toLowerCase().includes(lq)
            ),
          }))
          .filter((p) => p.events.length > 0),
      }))
      .filter((c) => c.projects.length > 0)
  }, [library, q])

  function toggleEvent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleProject(events: EventStub[]) {
    const ids = events.map((e) => e.id)
    const allSelected = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleClient(client: ClientStub) {
    const ids = client.projects.flatMap((p) => p.events.map((e) => e.id))
    const allSelected = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleClientExpand(clientId: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  async function handleCopy() {
    if (selected.size === 0) return
    setCopying(true)
    try {
      const res = await fetch(copyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceEventIds: [...selected] }),
      })
      const { created, skipped } = await res.json()
      setOpen(false)
      router.refresh()
      if (skipped > 0) {
        alert(`Copied ${created} events. ${skipped} already existed and were skipped.`)
      }
    } finally {
      setCopying(false)
    }
  }

  const selectedCount = selected.size

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        Copy from existing
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Copy events from another project</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Select events to copy into this project. Parameters are included automatically.
          </p>
          <Input
            placeholder="Search events..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-3"
            autoFocus
          />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading events…</p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {q ? 'No events match your search.' : 'No other projects available.'}
            </p>
          )}

          {filtered.map((client) => {
            const clientEventIds = client.projects.flatMap((p) => p.events.map((e) => e.id))
            const clientAllSelected = clientEventIds.length > 0 && clientEventIds.every((id) => selected.has(id))
            const clientSomeSelected = clientEventIds.some((id) => selected.has(id))
            const isExpanded = expandedClients.has(client.id)

            return (
              <div key={client.id} className="border rounded-lg overflow-hidden">
                {/* Client header */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b">
                  <input
                    type="checkbox"
                    checked={clientAllSelected}
                    ref={(el) => { if (el) el.indeterminate = !clientAllSelected && clientSomeSelected }}
                    onChange={() => toggleClient(client)}
                    className="h-4 w-4 rounded cursor-pointer"
                  />
                  <button
                    className="flex-1 text-left text-sm font-semibold hover:text-foreground/80"
                    onClick={() => toggleClientExpand(client.id)}
                  >
                    {client.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {clientEventIds.length} events
                    </span>
                  </button>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => toggleClientExpand(client.id)}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>

                {isExpanded && client.projects.map((project) => {
                  const projEventIds = project.events.map((e) => e.id)
                  const projAllSelected = projEventIds.length > 0 && projEventIds.every((id) => selected.has(id))
                  const projSomeSelected = projEventIds.some((id) => selected.has(id))

                  return (
                    <div key={project.id}>
                      {/* Project sub-header */}
                      {client.projects.length > 1 && (
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/20 border-b">
                          <input
                            type="checkbox"
                            checked={projAllSelected}
                            ref={(el) => { if (el) el.indeterminate = !projAllSelected && projSomeSelected }}
                            onChange={() => toggleProject(project.events)}
                            className="h-3.5 w-3.5 rounded cursor-pointer ml-4"
                          />
                          <span className="text-xs text-muted-foreground font-medium">
                            {project.name}
                          </span>
                        </div>
                      )}

                      {/* Event rows */}
                      <div className="divide-y">
                        {project.events.map((event) => (
                          <label
                            key={event.id}
                            className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/30 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(event.id)}
                              onChange={() => toggleEvent(event.id)}
                              className="h-4 w-4 rounded mt-0.5 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium">{event.name}</span>
                                {event.isKeyEvent && (
                                  <Badge className="text-xs px-1 py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">
                                    key
                                  </Badge>
                                )}
                                {event.requiresDataLayer && (
                                  <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                                    dL
                                  </Badge>
                                )}
                                {event.parameters.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {event.parameters.length} params
                                  </span>
                                )}
                              </div>
                              {event.trigger && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {event.trigger}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between bg-background">
          <p className="text-sm text-muted-foreground">
            {selectedCount === 0
              ? 'No events selected'
              : `${selectedCount} event${selectedCount === 1 ? '' : 's'} selected`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCopy}
              disabled={selectedCount === 0 || copying}
            >
              {copying ? 'Copying…' : `Copy ${selectedCount > 0 ? selectedCount : ''} event${selectedCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
