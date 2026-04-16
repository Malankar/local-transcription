import { describe, expect, it, vi } from 'vitest'

import { GoogleWorkspaceConnector } from '../../../../src/main/integrations/googleWorkspace/GoogleWorkspaceConnector'
import {
  GOOGLE_INTEGRATION_DISABLED_MESSAGE,
  isGoogleWorkspaceImportEnabled,
  MeetingImportService,
} from '../../../../src/main/integrations/googleWorkspace/MeetingImportService'
import type { MeetingImportConnector } from '../../../../src/main/integrations/googleWorkspace/MeetingImportConnector'

describe('MeetingImportService', () => {
  it('marks google connector disabled when feature flag is off', () => {
    const service = new MeetingImportService({
      googleWorkspaceEnabled: false,
      connectors: [new GoogleWorkspaceConnector()],
    })

    expect(service.listConnectors()).toEqual([
      {
        id: 'google-workspace',
        label: 'Google Meet / Workspace',
        enabled: false,
        reason: GOOGLE_INTEGRATION_DISABLED_MESSAGE,
      },
    ])
  })

  it('throws a guard error when importing while flag is off', async () => {
    const service = new MeetingImportService({
      googleWorkspaceEnabled: false,
      connectors: [new GoogleWorkspaceConnector()],
    })

    await expect(
      service.resolveImportFilePath({
        connectorId: 'google-workspace',
        meetingId: 'file:/tmp/meeting.wav',
      }),
    ).rejects.toThrow(GOOGLE_INTEGRATION_DISABLED_MESSAGE)
  })

  it('routes import calls through the connector contract when enabled', async () => {
    const connector: MeetingImportConnector = {
      descriptor: { id: 'google-workspace', label: 'Google Meet / Workspace', enabled: true },
      listCandidates: vi.fn().mockResolvedValue([]),
      resolveMeetingFilePath: vi.fn().mockResolvedValue('/tmp/meeting.wav'),
    }

    const service = new MeetingImportService({
      googleWorkspaceEnabled: true,
      connectors: [connector],
    })

    await expect(
      service.resolveImportFilePath({
        connectorId: 'google-workspace',
        meetingId: 'file:/tmp/meeting.wav',
      }),
    ).resolves.toBe('/tmp/meeting.wav')

    expect(connector.resolveMeetingFilePath).toHaveBeenCalledWith('file:/tmp/meeting.wav')
  })
})

describe('isGoogleWorkspaceImportEnabled', () => {
  it('parses truthy environment values', () => {
    expect(isGoogleWorkspaceImportEnabled({ LOCAL_TRANSCRIBE_ENABLE_GOOGLE_WORKSPACE_IMPORT: '1' })).toBe(true)
    expect(isGoogleWorkspaceImportEnabled({ LOCAL_TRANSCRIBE_ENABLE_GOOGLE_WORKSPACE_IMPORT: 'true' })).toBe(true)
  })

  it('defaults to false when env is absent', () => {
    expect(isGoogleWorkspaceImportEnabled({})).toBe(false)
  })
})
