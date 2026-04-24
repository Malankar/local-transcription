import { useState, useRef, useEffect, type ReactNode } from 'react'
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

function splitAssistantContent(content: string): { reasoning?: string; answer: string } {
  const lines = content.split(/\r?\n/)
  const reasoningStart = lines.findIndex((line) => /^#{1,6}\s*Reasoning(?:\s*\([^)]*\))?\s*$/i.test(line.trim()))
  if (reasoningStart === -1) return { answer: content }

  const answerOffset = lines
    .slice(reasoningStart + 1)
    .findIndex((line) => /^#{1,6}\s*Answer\s*$/i.test(line.trim()))

  if (answerOffset === -1) return { answer: content }

  const answerStart = reasoningStart + 1 + answerOffset
  return {
    reasoning: lines.slice(reasoningStart + 1, answerStart).join('\n').trim(),
    answer: lines.slice(answerStart + 1).join('\n').trim(),
  }
}

type MarkdownBlockNode =
  | { id: string; type: 'code'; language: string; text: string }
  | { id: string; type: 'heading'; level: number; text: string }
  | { id: string; type: 'list'; ordered: boolean; items: { id: string; text: string }[] }
  | { id: string; type: 'paragraph'; text: string }

const INLINE_MARKDOWN_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/
const BULLET_ITEM_PATTERN = /^[-*]\s+/
const NUMBERED_ITEM_PATTERN = /^\d+\.\s+/
const BLOCK_START_PATTERN = /^(#{1,6}\s+|[-*]\s+|\d+\.\s+|```)/

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(INLINE_MARKDOWN_PATTERN)) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))

    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code key={match.index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={match.index}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={match.index}>{token.slice(1, -1)}</em>)
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

function readCodeBlock(lines: string[], start: number): { block: MarkdownBlockNode; next: number } {
  const language = lines[start].trim().slice(3).trim()
  const codeLines: string[] = []
  let next = start + 1

  while (next < lines.length && !lines[next].trim().startsWith('```')) {
    codeLines.push(lines[next])
    next += 1
  }

  return {
    block: { id: `code-${start}`, type: 'code', language, text: codeLines.join('\n') },
    next: next < lines.length ? next + 1 : next,
  }
}

function readListBlock(lines: string[], start: number, ordered: boolean): { block: MarkdownBlockNode; next: number } {
  const pattern = ordered ? NUMBERED_ITEM_PATTERN : BULLET_ITEM_PATTERN
  const items: { id: string; text: string }[] = []
  let next = start

  while (next < lines.length && pattern.test(lines[next].trim())) {
    items.push({ id: `item-${next}`, text: lines[next].trim().replace(pattern, '') })
    next += 1
  }

  return { block: { id: `list-${start}`, type: 'list', ordered, items }, next }
}

function readParagraphBlock(lines: string[], start: number): { block: MarkdownBlockNode; next: number } {
  const paragraphLines = [lines[start].trim()]
  let next = start + 1

  while (next < lines.length && lines[next].trim() && !BLOCK_START_PATTERN.test(lines[next].trim())) {
    paragraphLines.push(lines[next].trim())
    next += 1
  }

  return {
    block: { id: `paragraph-${start}`, type: 'paragraph', text: paragraphLines.join(' ') },
    next,
  }
}

function readNextBlock(lines: string[], start: number): { block?: MarkdownBlockNode; next: number } {
  const trimmed = lines[start].trim()
  if (!trimmed) return { next: start + 1 }
  if (trimmed.startsWith('```')) return readCodeBlock(lines, start)

  const heading = HEADING_PATTERN.exec(trimmed)
  if (heading) {
    return {
      block: { id: `heading-${start}`, type: 'heading', level: Math.min(heading[1].length, 4), text: heading[2] },
      next: start + 1,
    }
  }

  if (BULLET_ITEM_PATTERN.test(trimmed)) return readListBlock(lines, start, false)
  if (NUMBERED_ITEM_PATTERN.test(trimmed)) return readListBlock(lines, start, true)
  return readParagraphBlock(lines, start)
}

function parseMarkdownBlocks(text: string): MarkdownBlockNode[] {
  const lines = text.split(/\r?\n/)
  const blocks: MarkdownBlockNode[] = []
  let index = 0

  while (index < lines.length) {
    const nextBlock = readNextBlock(lines, index)
    if (nextBlock.block) blocks.push(nextBlock.block)
    index = nextBlock.next
  }

  return blocks
}

function renderMarkdownBlock(block: MarkdownBlockNode): ReactNode {
  if (block.type === 'code') {
    return (
      <pre key={block.id} className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
        <code className="font-mono" data-language={block.language || undefined}>
          {block.text}
        </code>
      </pre>
    )
  }

  if (block.type === 'heading') {
    const HeadingTag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4'
    return (
      <HeadingTag key={block.id} className="font-semibold leading-snug">
        {renderInlineMarkdown(block.text)}
      </HeadingTag>
    )
  }

  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul'
    const listClass = block.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'
    return (
      <ListTag key={block.id} className={listClass}>
        {block.items.map((item) => (
          <li key={item.id}>{renderInlineMarkdown(item.text)}</li>
        ))}
      </ListTag>
    )
  }

  return <p key={block.id}>{renderInlineMarkdown(block.text)}</p>
}

function MarkdownBlock({ text }: Readonly<{ text: string }>) {
  return <div className="space-y-3 break-words text-sm leading-relaxed">{parseMarkdownBlocks(text).map(renderMarkdownBlock)}</div>
}

function AssistantMessage({ content }: Readonly<{ content: string }>) {
  const { reasoning, answer } = splitAssistantContent(content)

  return (
    <div className="space-y-3">
      {reasoning && (
        <details className="group rounded-lg border border-border bg-muted/30 px-3 py-2" open={false}>
          <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground marker:text-muted-foreground">
            Reasoning
          </summary>
          <div className="mt-2 border-t border-border/70 pt-2 text-muted-foreground">
            <MarkdownBlock text={reasoning} />
          </div>
        </details>
      )}
      <MarkdownBlock text={answer} />
    </div>
  )
}

export function ChatAssistant({ sessionTitle, transcript }: Readonly<ChatAssistantProps>) {
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
      role: m.role,
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
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
              ) : (
                <AssistantMessage content={message.content} />
              )}
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
