import { useState, useRef, useEffect } from 'react'
import { Send, AlertCircle } from 'lucide-react'

import { ASSISTANT_OLLAMA_MODEL_CHAT, ASSISTANT_OLLAMA_MODEL_TITLE } from '../../../shared/assistantModels'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatAssistantProps {
  sessionTitle: string
  transcript: string
}

export function ChatAssistant({ sessionTitle, transcript }: ChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hi! I'm here to help you understand the transcript of "${sessionTitle}". Ask me anything about this session.`,
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    }

    const convoForApi = [...messages.slice(1), userMessage].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const { text } = await window.api.assistantChat({
        sessionTitle,
        transcript,
        messages: convoForApi,
        thinkingMode,
      })
      const assistantResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: text,
      }
      setMessages((prev) => [...prev, assistantResponse])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Something went wrong: ${msg}. Is Ollama running at 127.0.0.1:11434 with ${ASSISTANT_OLLAMA_MODEL_CHAT} pulled?`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 w-[min(100%,clamp(22rem,36vw,40rem))] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex shrink-0 flex-col border-b border-border bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Assistant</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Ask about this session (local Ollama)</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`rounded-xl px-3.5 py-2.5 shadow-sm ${
                message.role === 'user'
                  ? 'max-w-[85%] bg-primary text-primary-foreground'
                  : 'w-full min-w-0 border border-border bg-background text-foreground'
              }`}
            >
              <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-border bg-muted/50 px-4 py-2.5">
              <div className="flex gap-2">
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: '0.2s' }}
                />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: '0.4s' }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-muted/20 p-4">
        <div className="mb-3 flex flex-col gap-2.5 rounded-md border border-border/60 bg-background/60 px-3 py-2.5 text-xs">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-foreground">
            <span className="text-muted-foreground">Thinking mode (brief bullets + answer)</span>
            <Switch checked={thinkingMode} onCheckedChange={setThinkingMode} disabled={isLoading} aria-label="Thinking mode" />
          </label>

        </div>
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="sm" className="gap-2 shadow-sm">
            <Send className="h-4 w-4" aria-hidden />
            <span className="sr-only">Send</span>
          </Button>
        </form>

        <div className="mt-3 flex gap-2 rounded-lg border border-border/60 bg-background/80 p-3 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Local chat uses Ollama <span className="font-mono">{ASSISTANT_OLLAMA_MODEL_CHAT}</span> (titles use{' '}
            <span className="font-mono">{ASSISTANT_OLLAMA_MODEL_TITLE}</span>).
          </p>
        </div>
      </div>
    </div>
  )
}
