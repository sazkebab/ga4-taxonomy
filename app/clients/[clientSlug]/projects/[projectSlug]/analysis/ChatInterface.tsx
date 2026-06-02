'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ToolCall { name: string; summary: string }
interface Message {
  id:        string
  role:      string
  content:   string
  toolCalls: ToolCall[]
}

interface Props {
  apiBase:         string
  chatId:          string
  initialMessages: Message[]
  hasGa4:          boolean
  onTitleUpdate:   (title: string) => void
}

const TOOL_LABELS: Record<string, string> = {
  run_ga4_report:      'Running GA4 report',
  get_funnel_data:     'Analysing funnel',
  get_page_performance:'Checking page performance',
  get_top_events:      'Getting top events',
  get_conversion_trend:'Getting conversion trends',
  search_documents:    'Searching research documents',
}

export default function ChatInterface({ apiBase, chatId, initialMessages, hasGa4, onTitleUpdate }: Props) {
  const [messages,  setMessages]  = useState<Message[]>(initialMessages)
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTool])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, toolCalls: [] }
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', toolCalls: [] }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)
    setActiveTool(null)

    try {
      const res = await fetch(`${apiBase}/analysis/chats/${chatId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text }),
      })

      if (!res.ok || !res.body) {
        setMessages((prev) => prev.map((m) => m.id === assistantMsg.id
          ? { ...m, content: 'Error: could not reach the server.' } : m))
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      const toolCallsAccum: ToolCall[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'text') {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id
                ? { ...m, content: m.content + event.delta } : m))
            } else if (event.type === 'tool_start') {
              setActiveTool(event.name)
            } else if (event.type === 'tool_done') {
              setActiveTool(null)
              toolCallsAccum.push({ name: event.name, summary: event.summary })
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id
                ? { ...m, toolCalls: [...toolCallsAccum] } : m))
            } else if (event.type === 'done') {
              setActiveTool(null)
              // Auto-title: update sidebar if first message
              if (messages.length === 0) {
                onTitleUpdate(text.length > 60 ? text.slice(0, 57) + '…' : text)
              }
            } else if (event.type === 'error') {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id
                ? { ...m, content: `Error: ${event.message}` } : m))
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id
        ? { ...m, content: `Error: ${String(err)}` } : m))
    } finally {
      setStreaming(false)
      setActiveTool(null)
      textareaRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm pt-12">
            Ask anything about your GA4 data or user behaviour
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : ''}>
            {msg.role === 'user' ? (
              <div className="max-w-[70%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[85%] space-y-3">
                {/* Tool calls */}
                {msg.toolCalls.length > 0 && (
                  <div className="space-y-1">
                    {msg.toolCalls.map((tc, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2.5 py-1.5">
                        <span className="text-green-600">✓</span>
                        <span className="font-medium">{TOOL_LABELS[tc.name] ?? tc.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Message text */}
                {msg.content && (
                  <div className="bg-muted/30 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Active tool indicator */}
        {activeTool && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="animate-pulse">⚡</span>
            <span>{TOOL_LABELS[activeTool] ?? activeTool}…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        {!hasGa4 && (
          <p className="text-xs text-amber-600 mb-2">
            ⚠ No GA4 property configured — GA4 queries won't work until you add one in GA4 Sync
          </p>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            placeholder="Ask about your GA4 data, user behaviour, conversions… (Enter to send, Shift+Enter for new line)"
            className="resize-none text-sm min-h-[60px] max-h-40"
            disabled={streaming}
          />
          <Button onClick={send} disabled={streaming || !input.trim()} className="shrink-0">
            {streaming ? '…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
