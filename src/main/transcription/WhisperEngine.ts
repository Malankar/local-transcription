import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { join } from "node:path";

import type {
  AudioChunk,
  TranscriptSegment,
  TranscriptionModel,
} from "../../shared/types";
import type {
  WorkerRequest,
  WorkerRequestPayload,
  WorkerResponse,
} from "./workerProtocol";

interface WhisperEngineEvents {
  segment: [TranscriptSegment];
  partial: [string];
  lag: [number];
  error: [Error];
}

/**
 * Owns the transcription worker process. A capture is one session: `startSession()`, then
 * `pushAudio()` per frame, then `endSession()` once capture stops. Audio pushed while the model
 * is still loading is buffered, so nothing recorded during warm-up is lost.
 */
export class WhisperEngine extends EventEmitter<WhisperEngineEvents> {
  private child: ChildProcess | null = null;
  private initializing: Promise<void> | null = null;
  private nextRequestId = 0;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: void) => void;
      reject: (error: Error) => void;
    }
  >();
  private currentModel: TranscriptionModel | null = null;
  private currentLanguage: string | undefined;
  private sessionActive = false;
  private sessionReady = false;
  private sessionStarting: Promise<void> | null = null;
  private pendingAudio: { chunk: AudioChunk; sentAt: number }[] = [];

  constructor(
    private readonly onStatus: (detail: string) => void,
    private readonly onLog: (message: string, context?: unknown) => void,
    private readonly vadModelPath: string,
  ) {
    super();
  }

  /** `language` is already resolved for this model (see resolveModelLanguage). */
  setModel(model: TranscriptionModel, language?: string): void {
    if (
      this.currentModel?.id === model.id &&
      this.currentModel.runtimeModelName === model.runtimeModelName &&
      this.currentLanguage === language
    ) {
      return;
    }

    this.dispose();
    this.currentModel = model;
    this.currentLanguage = language;
  }

  /** Model id currently configured for the worker, if any (may not be initialized yet). */
  getConfiguredModelId(): string | null {
    return this.currentModel?.id ?? null;
  }

  async initialize(): Promise<void> {
    if (!this.currentModel) {
      throw new Error(
        "No model configured. Select and download a model first.",
      );
    }

    if (this.child?.connected) {
      return;
    }

    if (this.initializing !== null) {
      return this.initializing;
    }

    const model = this.currentModel;
    this.initializing = (async () => {
      await this.ensureWorker();
      await this.sendRequest<void>({
        type: "initialize",
        modelId: model.id,
        engine: model.engine,
        runtimeModelName: model.runtimeModelName,
        useGpuAcceleration: model.supportsGpuAcceleration,
        sherpaKind: model.sherpaKind,
        language: this.currentLanguage,
        vadModelPath: this.vadModelPath,
      });
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  /** Loads the model (if needed) and opens a session; audio pushed meanwhile is buffered. */
  async startSession(): Promise<void> {
    this.sessionActive = true;
    this.sessionReady = false;
    this.pendingAudio = [];

    this.sessionStarting = (async () => {
      await this.initialize();
      await this.sendRequest<void>({ type: "session-start" });
      if (!this.sessionActive) return;
      this.sessionReady = true;
      for (const { chunk, sentAt } of this.pendingAudio) {
        this.post({ type: "audio", chunk, sentAt });
      }
      this.pendingAudio = [];
    })();

    try {
      await this.sessionStarting;
    } catch (error) {
      this.sessionActive = false;
      this.pendingAudio = [];
      throw error;
    } finally {
      this.sessionStarting = null;
    }
  }

  pushAudio(chunk: AudioChunk): void {
    if (!this.sessionActive) return;
    const sentAt = Date.now();
    if (this.sessionReady) {
      this.post({ type: "audio", chunk, sentAt });
    } else {
      this.pendingAudio.push({ chunk, sentAt });
    }
  }

  /** Resolves once every buffered phrase has been transcribed and emitted. */
  async endSession(): Promise<void> {
    if (!this.sessionActive) return;
    await this.sessionStarting?.catch(() => {});
    this.sessionActive = false;
    if (!this.sessionReady) return;
    this.sessionReady = false;
    await this.sendRequest<void>({ type: "session-end" });
  }

  dispose(): void {
    this.sessionActive = false;
    this.sessionReady = false;
    this.pendingAudio = [];
    if (!this.child) {
      return;
    }

    const child = this.child;
    this.child = null;

    try {
      if (child.connected) {
        child.send({
          type: "shutdown",
          requestId: this.createRequestId(),
        } as WorkerRequest);
      }
    } catch (error) {
      this.onLog("Failed to request Whisper worker shutdown", error);
    }

    child.disconnect();
    if (!child.killed) {
      child.kill();
    }
    this.rejectPending(new Error("Whisper worker disposed"));
  }

  private async ensureWorker(): Promise<void> {
    if (this.child?.connected) {
      return;
    }

    const workerPath = join(__dirname, "whisper-worker.js");
    this.onLog("Starting Whisper worker process", {
      workerPath,
      execPath: process.execPath,
    });

    await new Promise<void>((resolve, reject) => {
      const child = fork(workerPath, [], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
        },
        execPath: process.execPath,
        serialization: "advanced",
        silent: true,
      });

      let settled = false;

      const cleanup = (): void => {
        child.off("spawn", handleSpawn);
        child.off("error", handleError);
      };

      const handleSpawn = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const handleError = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      child.once("spawn", handleSpawn);
      child.once("error", handleError);

      child.on("message", (message: WorkerResponse) => {
        this.handleWorkerMessage(message);
      });

      child.on("exit", (code, signal) => {
        const detail = { code, signal };
        this.onLog("Whisper worker exited", detail);

        const exitedChild = this.child === child;
        if (exitedChild) {
          this.child = null;
          if (this.sessionActive) {
            this.sessionActive = false;
            this.sessionReady = false;
            this.emitError(new Error("Transcription stopped: the transcription engine exited unexpectedly."));
          }
        }

        const codePart = code === null ? "" : ` with code ${code}`;
        const signalPart = signal ? ` (${signal})` : "";
        this.rejectPending(
          new Error(
            `Whisper worker exited unexpectedly${codePart}${signalPart}`,
          ),
        );
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        const detail = chunk.toString("utf8").trim();
        if (detail) {
          this.onLog("Whisper worker stdout", { detail });
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const detail = chunk.toString("utf8").trim();
        if (detail) {
          this.onLog("Whisper worker stderr", { detail });
        }
      });

      this.child = child;
    }).catch((error) => {
      this.onLog("Failed to start Whisper worker process", error);
      throw error;
    });
  }

  /** Fire-and-forget message (audio frames); failures come back as `error` events. */
  private post(message: WorkerRequestPayload): void {
    try {
      this.child?.send(message as WorkerRequest);
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** EventEmitter throws on `error` without listeners; don't let that crash main. */
  private emitError(error: Error): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
    } else {
      this.onLog("Transcription error with no listener", error);
    }
  }

  private sendRequest<T extends void>(
    message: WorkerRequestPayload,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.child?.connected) {
        reject(new Error("Whisper worker is not running"));
        return;
      }

      const requestId = this.createRequestId();
      this.pending.set(requestId, {
        resolve: resolve as (value: void) => void,
        reject,
      });

      try {
        this.child.send({ ...message, requestId } as WorkerRequest);
      } catch (error) {
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private handleWorkerMessage(message: WorkerResponse): void {
    switch (message.type) {
      case "status":
        this.onStatus(message.detail);
        break;
      case "log":
        this.onLog(message.message, message.context);
        break;
      case "ready": {
        const pending = this.pending.get(message.requestId);
        if (!pending) {
          return;
        }
        this.pending.delete(message.requestId);
        pending.resolve();
        break;
      }
      case "segment":
        this.emit("segment", message.segment);
        break;
      case "partial":
        this.emit("partial", message.text);
        break;
      case "lag":
        this.emit("lag", message.behindMs);
        break;
      case "error": {
        const pending = message.requestId ? this.pending.get(message.requestId) : undefined;
        if (!pending || !message.requestId) {
          this.emitError(new Error(message.message));
          return;
        }
        this.pending.delete(message.requestId);
        const error = new Error(message.message);
        if (message.stack) {
          error.stack = message.stack;
        }
        pending.reject(error);
        break;
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private createRequestId(): string {
    this.nextRequestId += 1;
    return `worker-${this.nextRequestId}`;
  }
}
