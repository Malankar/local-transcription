import { useState, useRef, useEffect } from 'react'
import { Send, AlertCircle } from 'lucide-react'

import { ASSISTANT_OLLAMA_MODEL_CHAT, ASSISTANT_OLLAMA_MODEL_TITLE } from '../../../shared/assistantModels'
import { Button } from '@/components/ui/button'

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
    <div className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex shrink-0 flex-col border-b border-border p-4">
        <h3 className="text-sm font-semibold">Assistant</h3>
        <p className="mt-1 text-xs text-muted-foreground">Ask about this transcript</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'border border-border bg-muted text-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-4 py-2 text-foreground">
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

      <div className="shrink-0 border-t border-border p-4">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="sm" className="gap-2">
            <Send className="h-4 w-4" />
          </Button>
        </form>

        <div className="mt-3 flex gap-2 rounded bg-muted/30 p-3 text-xs text-muted-foreground">
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
