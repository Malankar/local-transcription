import { useState, useRef, useEffect } from 'react'
import { Send, AlertCircle } from 'lucide-react'

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

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    window.setTimeout(() => {
      const assistantResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateMockResponse(input, sessionTitle, transcript),
      }
      setMessages((prev) => [...prev, assistantResponse])
      setIsLoading(false)
    }, 800)
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
          <p>Uses selected model from settings</p>
        </div>
      </div>
    </div>
  )
}

function generateMockResponse(question: string, sessionTitle: string, transcript: string): string {
  const lowerQuestion = question.toLowerCase()

  if (lowerQuestion.includes('summary')) {
    return `Based on "${sessionTitle}", here are the key points:\n\n• Product team focused on Q2 roadmap execution\n• Performance optimization is the top priority\n• User feedback integration planned for later phase\n\nWould you like me to expand on any of these points?`
  }

  if (lowerQuestion.includes('action') || lowerQuestion.includes('todo')) {
    return `From this session, the action items are:\n\n→ Complete design asset handoff from creative team\n→ Finalize backend API documentation\n→ Schedule follow-up design review meeting\n→ Present roadmap to stakeholders by end of week`
  }

  if (lowerQuestion.includes('decision') || lowerQuestion.includes('decided')) {
    return `The key decisions made in this session were:\n\n1. Focus on performance optimization first\n2. User feedback integration will happen in a later phase\n3. Prioritize MVP release over additional features`
  }

  void transcript
  return `That's a great question! Based on the transcript of "${sessionTitle}", I can help you find specific information. Could you rephrase your question to be more specific about what you're looking for?`
}
