declare module 'nodejs-whisper' {
  export interface WhisperOptions {
    outputInJson?: boolean
    outputInJsonFull?: boolean
    outputInText?: boolean
    outputInSrt?: boolean
    outputInCsv?: boolean
    outputInVtt?: boolean
    translateToEnglish?: boolean
    wordTimestamps?: boolean
    language?: string
  }

  export interface NodeWhisperOptions {
    modelName: string
    autoDownloadModelName?: string
    removeWavFileAfterTranscription?: boolean
    withCuda?: boolean
    logger?: typeof console
    modelPath?: string
    whisperOptions?: WhisperOptions
  }

  export function nodewhisper(filePath: string, options: NodeWhisperOptions): Promise<string>
}
