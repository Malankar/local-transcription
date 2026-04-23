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
    engine: "whisper",
    runtime: "node",
    runtimeModelName: "base.en",
    downloadManaged: true,
    supportsGpuAcceleration: false,
    isDownloaded: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChild = new MockChildProcess();
    vi.mocked(fork).mockReturnValue(mockChild as unknown as ChildProcess);
    engine = new WhisperEngine(onStatus, onLog);
  });

  it("throws if initialize is called without a model", async () => {
    await expect(engine.initialize()).rejects.toThrow("No model configured");
  });

  describe("initialization", () => {
    it("starts worker and sends initialize request", async () => {
      engine.setModel(mockModel);
      const initPromise = engine.initialize();

      // Simulate spawn event
      mockChild.emit("spawn");

      // Wait for engine to send initialize request
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fork).toHaveBeenCalled();
      expect(mockChild.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "initialize",
          modelId: "base",
        }),
      );

      // Simulate ready response
      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", { type: "ready", requestId });

      await initPromise;
    });

    it("second initialize() call while first is pending returns the same promise (deduplication guard)", async () => {
      engine.setModel(mockModel);

      const init1 = engine.initialize();
      const init2 = engine.initialize(); // Should reuse the in-flight promise

      mockChild.emit("spawn");
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Only one fork and one initialize message should be sent
      expect(fork).toHaveBeenCalledTimes(1);
      expect(mockChild.send).toHaveBeenCalledTimes(1);

      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", { type: "ready", requestId });

      await Promise.all([init1, init2]);
    });

    it("second initialize() call after first completes is a no-op (connected guard)", async () => {
      engine.setModel(mockModel);

      // First init
      const init1 = engine.initialize();
      mockChild.emit("spawn");
      await new Promise((resolve) => setTimeout(resolve, 0));
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

  describe("transcription", () => {
    beforeEach(async () => {
      engine.setModel(mockModel);
      const initPromise = engine.initialize();
      mockChild.emit("spawn");
      await new Promise((resolve) => setTimeout(resolve, 0));
      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", { type: "ready", requestId });
      await initPromise;
      mockChild.send.mockClear();
    });

    it("sends transcribe request and returns results", async () => {
      const chunk: AudioChunk = {
        audio: new Float32Array(10),
        startMs: 0,
        endMs: 100,
      };
      const transcribePromise = engine.transcribe(chunk);

      // Give transcribe() a chance to proceed past await this.initialize()
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockChild.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "transcribe",
          chunk,
        }),
      );

      const requestId = mockChild.send.mock.calls[0][0].requestId;
      const mockSegments = [
        { id: "1", text: "Hello", startMs: 0, endMs: 100, timestamp: "T1" },
      ];
      mockChild.emit("message", {
        type: "result",
        requestId,
        segments: mockSegments,
      });

      const result = await transcribePromise;
      expect(result).toEqual(mockSegments);
    });

    it("rejects if worker reports an error", async () => {
      const chunk: AudioChunk = {
        audio: new Float32Array(10),
        startMs: 0,
        endMs: 100,
      };
      const transcribePromise = engine.transcribe(chunk);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", {
        type: "error",
        requestId,
        message: "Transcription failed",
      });

      await expect(transcribePromise).rejects.toThrow("Transcription failed");
    });

    it("rejects if worker exits unexpectedly", async () => {
      const chunk: AudioChunk = {
        audio: new Float32Array(10),
        startMs: 0,
        endMs: 100,
      };
      const transcribePromise = engine.transcribe(chunk);

      await new Promise((resolve) => setTimeout(resolve, 0));

      mockChild.emit("exit", 1, null);

      await expect(transcribePromise).rejects.toThrow(
        "Whisper worker exited unexpectedly",
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
      engine.setModel(mockModel);
      const initPromise = engine.initialize();
      mockChild.emit("spawn");
      await new Promise((resolve) => setTimeout(resolve, 0));
      const requestId = mockChild.send.mock.calls[0][0].requestId;
      mockChild.emit("message", { type: "ready", requestId });
      await initPromise;
      mockChild.send.mockClear();

      const chunk = { audio: new Float32Array(10), startMs: 0, endMs: 100 };
      const transcribePromise = engine.transcribe(chunk);
      await new Promise((resolve) => setTimeout(resolve, 0));

      engine.dispose();

      await expect(transcribePromise).rejects.toThrow(
        "Whisper worker disposed",
      );
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
