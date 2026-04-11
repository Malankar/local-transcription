import { describe, it, expect } from 'vitest'
import { TranscriptExporter } from '../../../src/main/export/TranscriptExporter'

describe('TranscriptExporter', () => {
  describe('toTxt', () => {
    it('formats segments into plain text separated by newlines', () => {
      const segments = [
        { id: '1', startMs: 0, endMs: 1000, text: 'Hello', timestamp: '00:01' },
        { id: '2', startMs: 1000, endMs: 2000, text: 'world.', timestamp: '00:02' }
      ]
      
      const result = TranscriptExporter.toTxt(segments)
      expect(result).toBe('Hello\nworld.')
    })

    it('trims whitespace from the edges of the joined text', () => {
      const segments = [
        { id: '1', startMs: 0, endMs: 1000, text: '  Hello  ', timestamp: '00:01' },
      ]
      const result = TranscriptExporter.toTxt(segments)
      expect(result).toBe('Hello')
    })

    it('dedupes overlapping chunk text before formatting', () => {
      const segments = [
        { id: '1', startMs: 0, endMs: 1800, text: 'Hello world', timestamp: '00:01' },
        { id: '2', startMs: 1700, endMs: 2600, text: 'world again', timestamp: '00:02' },
      ]

      const result = TranscriptExporter.toTxt(segments)

      expect(result).toBe('Hello world\nagain')
    })
  })

  describe('toSrt', () => {
    it('formats segments into SRT format', () => {
      const segments = [
        { id: '1', startMs: 0, endMs: 1500, text: 'Hello', timestamp: '00:01' },
        { id: '2', startMs: 1500, endMs: 3600000, text: 'world.', timestamp: '1:00:00' } 
      ]
      const result = TranscriptExporter.toSrt(segments)
      
      const expectedSrt = `1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n00:00:01,500 --> 01:00:00,000\nworld.`
      expect(result).toBe(expectedSrt)
    })
  })

  describe('toVtt', () => {
    it('formats segments into WebVTT format', () => {
      const segments = [
        { id: '1', startMs: 0, endMs: 1500, text: 'Hello', timestamp: '00:01' },
        { id: '2', startMs: 1500, endMs: 3600000, text: 'world.', timestamp: '1:00:00' } 
      ]
      const result = TranscriptExporter.toVtt(segments)
      
      const expectedVtt = `WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nHello\n\n00:00:01.500 --> 01:00:00.000\nworld.`
      expect(result).toBe(expectedVtt)
    })
  })
})
