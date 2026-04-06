import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { AppLogger } from '../../../src/main/logging/AppLogger'
import * as fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('AppLogger', () => {
  let logger: AppLogger
  const tempLogDir = join(tmpdir(), 'local-transcription-logs')

  beforeEach(() => {
    logger = new AppLogger()
    if (fs.existsSync(tempLogDir)) {
      fs.rmSync(tempLogDir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(tempLogDir)) {
      fs.rmSync(tempLogDir, { recursive: true, force: true })
    }
  })

  describe('log rotation', () => {
    it('truncates log file on configure if older size exceeds max bounds', () => {
      // Setup a dummy large file
      fs.mkdirSync(tempLogDir, { recursive: true })
      const logFile = join(tempLogDir, 'localtranscribe.log')
      // Create a 6MB dummy file
      const largeContent = Buffer.alloc(6 * 1024 * 1024, 'a')
      fs.writeFileSync(logFile, largeContent)

      logger.configure(tempLogDir)

      // The logic isn't implemented yet, so this expect should fail (it will be 6MB instead of truncated)
      const stats = fs.statSync(logFile)
      expect(stats.size).toBeLessThan(1024 * 1024) // Should be truncated
    })
  })

  describe('circular dependencies', () => {
    it('safely serializes context with circular structures', () => {
      const obj: any = { name: 'test' }
      obj.self = obj
      
      expect(() => logger.info('circular', obj)).not.toThrow()
    })
  })
})
