import { fork, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

import type { AudioChunk, TranscriptSegment } from '../../shared/types'
import type { WorkerRequest, WorkerRequestPayload, WorkerResponse } from './workerProtocol'

export class WhisperEngine {
  private child: ChildProcess | null = null
  private initializing: Promise<void> | null = null
  private nextRequestId = 0
  private readonly pending = new Map<
    string,
    {
      resolve: (value: TranscriptSegment[] | void) => void
      reject: (error: Error) => void
    }
  >()
  private currentModelName: string | null = null

  constructor(
    private readonly onStatus: (detail: string) => void,
    private readonly onLog: (message: string, context?: unknown) => void
  ) {}

  setModel(modelName: string): void {
    if (this.currentModelName === modelName) return
    this.dispose()
    this.currentModelName = modelName
  }

  async initialize(): Promise<void> {
    if (!this.currentModelName) {
      throw new Error('No model configured. Select and download a model first.')
    }

    if (this.child?.connected) {
      return
    }

    if (this.initializing !== null) {
      return this.initializing
    }

    const modelName = this.currentModelName
    this.initializing = (async () => {
      await this.ensureWorker()
      await this.sendRequest<void>({ type: 'initialize', modelName })
    })()

    try {
      await this.initializing
    } finally {
      this.initializing = null
    }
  }

  async transcribe(chunk: AudioChunk): Promise<TranscriptSegment[]> {
    await this.initialize()
    return this.sendRequest<TranscriptSegment[]>({ type: 'transcribe', chunk })
  }

  dispose(): void {
    if (!this.child) {
      return
    }

    const child = this.child
    this.child = null

    try {
      if (child.connected) {
        child.send({
          type: 'shutdown',
          requestId: this.createRequestId(),
        } as WorkerRequest)
      }
    } catch (error) {
      this.onLog('Failed to request Whisper worker shutdown', error)
    }

    child.disconnect()
    if (!child.killed) {
      child.kill()
    }
    this.rejectPending(new Error('Whisper worker disposed'))
  }

  private async ensureWorker(): Promise<void> {
    if (this.child?.connected) {
      return
    }

    const workerPath = join(__dirname, 'whisper-worker.js')
    this.onLog('Starting Whisper worker process', {
      workerPath,
      execPath: process.execPath,
    })

    await new Promise<void>((resolve, reject) => {
      const child = fork(workerPath, [], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
        execPath: process.execPath,
        serialization: 'advanced',
        silent: true,
      })

      let settled = false

      const cleanup = (): void => {
        child.off('spawn', handleSpawn)
        child.off('error', handleError)
      }

      const handleSpawn = (): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        resolve()
      }

      const handleError = (error: Error): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        reject(error)
      }

      child.once('spawn', handleSpawn)
      child.once('error', handleError)

      child.on('message', (message: WorkerResponse) => {
        this.handleWorkerMessage(message)
      })

      child.on('exit', (code, signal) => {
        const detail = { code, signal }
        this.onLog('Whisper worker exited', detail)

        const exitedChild = this.child === child
        if (exitedChild) {
          this.child = null
        }

        const codePart = code === null ? '' : ` with code ${code}`
        const signalPart = signal ? ` (${signal})` : ''
        this.rejectPending(new Error(`Whisper worker exited unexpectedly${codePart}${signalPart}`))
      })

      child.stdout?.on('data', (chunk: Buffer) => {
        const detail = chunk.toString('utf8').trim()
        if (detail) {
          this.onLog('Whisper worker stdout', { detail })
        }
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        const detail = chunk.toString('utf8').trim()
        if (detail) {
          this.onLog('Whisper worker stderr', { detail })
        }
      })

      this.child = child
    }).catch((error) => {
      this.onLog('Failed to start Whisper worker process', error)
      throw error
    })
  }

  private sendRequest<T extends TranscriptSegment[] | void>(message: WorkerRequestPayload): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.child?.connected) {
        reject(new Error('Whisper worker is not running'))
        return
      }

      const requestId = this.createRequestId()
      this.pending.set(requestId, {
        resolve: resolve as (value: TranscriptSegment[] | void) => void,
        reject,
      })

      try {
        this.child.send({ ...message, requestId } as WorkerRequest)
      } catch (error) {
        this.pending.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private handleWorkerMessage(message: WorkerResponse): void {
    switch (message.type) {
      case 'status':
        this.onStatus(message.detail)
        break
      case 'log':
        this.onLog(message.message, message.context)
        break
      case 'ready': {
        const pending = this.pending.get(message.requestId)
        if (!pending) {
          return
        }
        this.pending.delete(message.requestId)
        pending.resolve()
        break
      }
      case 'result': {
        const pending = this.pending.get(message.requestId)
        if (!pending) {
          return
        }
        this.pending.delete(message.requestId)
        pending.resolve(message.segments)
        break
      }
      case 'error': {
        const pending = this.pending.get(message.requestId)
        if (!pending) {
          this.onLog('Whisper worker reported untracked error', message)
          return
        }
        this.pending.delete(message.requestId)
        const error = new Error(message.message)
        if (message.stack) {
          error.stack = message.stack
        }
        pending.reject(error)
        break
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }

  private createRequestId(): string {
    this.nextRequestId += 1
    return `worker-${this.nextRequestId}`
  }
}
