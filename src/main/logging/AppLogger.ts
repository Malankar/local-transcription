import { mkdirSync, appendFileSync } from 'fs'
import { dirname, join } from 'path'

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export class AppLogger {
  private logFilePath: string | null = null

  configure(logsDirectory: string, fileName = 'localtranscribe.log'): string {
    return this.configureFile(join(logsDirectory, fileName))
  }

  configureFile(logFilePath: string): string {
    mkdirSync(dirname(logFilePath), { recursive: true })
    this.logFilePath = logFilePath
    this.info('Logger initialized', { logFilePath: this.logFilePath })
    return this.logFilePath
  }

  debug(message: string, context?: unknown): void {
    this.write('DEBUG', message, context)
  }

  info(message: string, context?: unknown): void {
    this.write('INFO', message, context)
  }

  warn(message: string, context?: unknown): void {
    this.write('WARN', message, context)
  }

  error(message: string, context?: unknown): void {
    this.write('ERROR', message, context)
  }

  getLogFilePath(): string | null {
    return this.logFilePath
  }

  private write(level: LogLevel, message: string, context?: unknown): void {
    const line = formatLogLine(level, message, context)

    if (level === 'ERROR') {
      console.error(line)
    } else if (level === 'WARN') {
      console.warn(line)
    } else {
      console.log(line)
    }

    if (!this.logFilePath) {
      return
    }

    try {
      mkdirSync(dirname(this.logFilePath), { recursive: true })
      appendFileSync(this.logFilePath, `${line}\n`, 'utf8')
    } catch (error) {
      console.error(formatLogLine('ERROR', 'Failed to write log file', error))
    }
  }
}

function formatLogLine(level: LogLevel, message: string, context?: unknown): string {
  const timestamp = new Date().toISOString()
  const suffix = context === undefined ? '' : ` ${safeSerialize(context)}`
  return `[${timestamp}] [${level}] ${message}${suffix}`
}

function safeSerialize(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack,
    })
  }

  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ unserializable: String(value) })
  }
}
