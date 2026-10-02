import ffmpegStatic from 'ffmpeg-static'

/** Packaged builds unpack native binaries from ASAR (see asarUnpack in electron-builder.yml). */
export function toUnpackedPath(path: string): string {
  return path.replace(/app\.asar([\\/])/u, 'app.asar.unpacked$1')
}

// Bundled binary so users don't install ffmpeg.
export const FFMPEG_PATH = ffmpegStatic ? toUnpackedPath(ffmpegStatic) : 'ffmpeg'
