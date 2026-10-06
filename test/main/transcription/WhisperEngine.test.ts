import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhisperEngine } from "../../../src/main/transcription/WhisperEngine";
import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { TranscriptionModel, AudioChunk } from "../../../src/shared/types";

vi.mock("node:child_process", () => {
  const fork = vi.fn();
  return {
    fork,
    default: { fork },
  };
});

class MockChildProcess extends EventEmitter {
  connected = true;
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  send = vi.fn();
  disconnect = vi.fn();
  kill = vi.fn();
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function makeChunk(): AudioChunk {
  return { audio: new Float32Array(10), startMs: 0, endMs: 100 };
}

async function initializeEngine(
  engine: WhisperEngine,
  mockChild: MockChildProcess,
  model: TranscriptionModel,
): Promise<void> {
  engine.setModel(model);
  const initPromise = engine.initialize();
  mockChild.emit("spawn");
  await tick();
  const requestId = mockChild.send.mock.calls[0][0].requestId;
  mockChild.emit("message", { type: "ready", requestId });
  await initPromise;
  mockChild.send.mockClear();
}

describe("WhisperEngine", () => {
  let engine: WhisperEngine;
  let mockChild: MockChildProcess;
  const onStatus = vi.fn();
  const onLog = vi.fn();

  const mockModel: TranscriptionModel = {
    id: "base",
    name: "Base",
    description: "",
    sizeMb: 140,
    languages: "en",
    accuracy: 3,
    speed: 4,
    recommended: true,
    engine: "sherpa",
    runtime: "node",
    runtimeModelName: "base.en",
    downloadManaged: true,
    supportsGpuAcceleration: false,
    streaming: false,
    isDownloaded: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChild = new MockChildProcess();
    vi.mocked(fork).mockReturnValue(mockChild as unknown as ChildProcess);
    engine = new WhisperEngine(onStatus, onLog, "/vad/silero_vad.onnx");
  });

  it("throws if initialize is called without a model", async () => {
    await expect(engine.initialize()).rejects.toThrow("No model configured");
  });

  describe("initialization", () => {
    it("starts worker and sends initialize request", async () => {
      engine.setModel(mockModel);
      const initPromise = engine.initialize();

      mockChild.emit("spawn");
      await tick();
      expect(fork).toHaveBeenCalled();
      expect(mockChild.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "initialize",
          modelId: "base",
          vadModelPath: "/vad/silero_vad.onnx",
        }),
      );

      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", { type: "ready", requestId });

      await initPromise;
    });

    it("second initialize() call while first is pending returns the same promise (deduplication guard)", async () => {
      engine.setModel(mockModel);

      const init1 = engine.initialize();
      const init2 = engine.initialize(); // Should reuse the in-flight promise

      mockChild.emit("spawn");
      await tick();

      // Only one fork and one initialize message should be sent
      expect(fork).toHaveBeenCalledTimes(1);
      expect(mockChild.send).toHaveBeenCalledTimes(1);

      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", { type: "ready", requestId });

      await Promise.all([init1, init2]);
    });

    it("second initialize() call after first completes is a no-op (connected guard)", async () => {
      engine.setModel(mockModel);

      const init1 = engine.initialize();
      mockChild.emit("spawn");
      await tick();
      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", { type: "ready", requestId });
      await init1;

      // child.connected is true on the mock — second call should return immediately
      const init2 = engine.initialize();
      await expect(init2).resolves.toBeUndefined();

      // fork must NOT have been called a second time
      expect(fork).toHaveBeenCalledTimes(1);
    });
  });

  describe("session", () => {
    const sentOfType = (type: string) =>
      mockChild.send.mock.calls.map(([m]) => m).filter((m) => m.type === type);
    const replyReady = (type: string) =>
      mockChild.emit("message", { type: "ready", requestId: sentOfType(type).at(-1).requestId });

    async function startReadySession(): Promise<void> {
      await initializeEngine(engine, mockChild, mockModel);
      const sessionPromise = engine.startSession();
      await tick();
      replyReady("session-start");
      await sessionPromise;
    }

    it("buffers audio pushed before ready, then flushes it in order", async () => {
      engine.setModel(mockModel);
      const sessionPromise = engine.startSession();
      mockChild.emit("spawn");
      await tick();

      const first = makeChunk();
      engine.pushAudio(first);
      replyReady("initialize");
      await tick();

      expect(sentOfType("session-start")).toHaveLength(1);
      const second = { ...makeChunk(), startMs: 100, endMs: 200 };
      engine.pushAudio(second);
      expect(sentOfType("audio")).toHaveLength(0);

      replyReady("session-start");
      await sessionPromise;

      const audio = sentOfType("audio");
      expect(audio.map((m) => m.chunk)).toEqual([first, second]);
      expect(audio[0]).not.toHaveProperty("requestId");
      expect(typeof audio[0].sentAt).toBe("number");
    });

    it("posts audio directly once the session is ready", async () => {
      await startReadySession();
      const chunk = makeChunk();

      engine.pushAudio(chunk);

      expect(sentOfType("audio")).toEqual([
        { type: "audio", chunk, sentAt: expect.any(Number) },
      ]);
    });

    it("ignores audio when no session is active", async () => {
      await initializeEngine(engine, mockChild, mockModel);
      engine.pushAudio(makeChunk());
      expect(mockChild.send).not.toHaveBeenCalled();
    });

    it("endSession sends session-end and resolves on ready", async () => {
      await startReadySession();

      let ended = false;
      const endPromise = engine.endSession().then(() => {
        ended = true;
      });
      await tick();
      expect(sentOfType("session-end")).toHaveLength(1);
      expect(ended).toBe(false);

      replyReady("session-end");
      await endPromise;
      expect(ended).toBe(true);
    });

    it("re-emits segment, partial and lag events", async () => {
      await startReadySession();
      const segment = { id: "1", text: "Hello", startMs: 0, endMs: 100, timestamp: "T1" };
      const onSegment = vi.fn();
      const onPartial = vi.fn();
      const onLag = vi.fn();
      engine.on("segment", onSegment);
      engine.on("partial", onPartial);
      engine.on("lag", onLag);

      mockChild.emit("message", { type: "segment", segment });
      mockChild.emit("message", { type: "partial", text: "Hel" });
      mockChild.emit("message", { type: "lag", behindMs: 1500 });

      expect(onSegment).toHaveBeenCalledWith(segment);
      expect(onPartial).toHaveBeenCalledWith("Hel");
      expect(onLag).toHaveBeenCalledWith(1500);
    });

    it("emits worker errors without a pending request as 'error' events", async () => {
      await startReadySession();
      const onError = vi.fn();
      engine.on("error", onError);

      mockChild.emit("message", { type: "error", message: "Decoder crashed" });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Decoder crashed" }));
    });

    it("rejects startSession when the worker reports an error for it", async () => {
      await initializeEngine(engine, mockChild, mockModel);
      const sessionPromise = engine.startSession();
      await tick();

      mockChild.emit("message", {
        type: "error",
        requestId: sentOfType("session-start")[0].requestId,
        message: "Session failed",
      });

      await expect(sessionPromise).rejects.toThrow("Session failed");
    });

    it("emits an 'error' event when the worker exits during a session", async () => {
      await startReadySession();
      const onError = vi.fn();
      engine.on("error", onError);

      mockChild.emit("exit", 1, null);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("exited unexpectedly") }),
      );
    });
  });

  describe("dispose", () => {
    it("kills the worker process", async () => {
      engine.setModel(mockModel);
      engine.initialize().catch(() => {}); // Start initialization
      mockChild.emit("spawn");

      engine.dispose();

      expect(mockChild.disconnect).toHaveBeenCalled();
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it("rejects all pending requests when disposed", async () => {
      await initializeEngine(engine, mockChild, mockModel);

      const sessionPromise = engine.startSession();
      await tick();

      engine.dispose();

      await expect(sessionPromise).rejects.toThrow("Whisper worker disposed");
    });
  });

  describe("setModel", () => {
    it("does not dispose when called with the same model", () => {
      engine.setModel(mockModel);
      const disposeSpy = vi.spyOn(engine, "dispose");

      engine.setModel(mockModel); // same — should be a no-op

      expect(disposeSpy).not.toHaveBeenCalled();
    });

    it("disposes the current worker when model changes", () => {
      engine.setModel(mockModel);
      const disposeSpy = vi.spyOn(engine, "dispose");

      const differentModel = {
        ...mockModel,
        id: "large",
        runtimeModelName: "large",
      };
      engine.setModel(differentModel);

      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
