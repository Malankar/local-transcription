import type { MeetingImportCandidate, MeetingImportConnectorDescriptor } from '../../../shared/types'
import { assertSupportedConnector, type MeetingImportConnector } from './MeetingImportConnector'

const CONNECTOR_DESCRIPTOR: MeetingImportConnectorDescriptor = {
  id: 'google-workspace',
  label: 'Google Meet / Workspace',
  enabled: true,
}

export class GoogleWorkspaceConnector implements MeetingImportConnector {
  readonly descriptor = CONNECTOR_DESCRIPTOR

  async listCandidates(): Promise<MeetingImportCandidate[]> {
    // OAuth + remote listing intentionally deferred; seam stays stable for follow-up implementation.
    return []
  }

  async resolveMeetingFilePath(meetingId: string): Promise<string> {
    assertSupportedConnector('google-workspace', this.descriptor.id)

    if (!meetingId.startsWith('file:')) {
      throw new Error('Google Workspace import currently accepts only local file pointers (file:/absolute/path).')
    }

    const decodedPath = decodeURIComponent(meetingId.slice('file:'.length))
    if (!decodedPath.trim()) {
      throw new Error('Google Workspace import meeting id must include a local file path.')
    }

    return decodedPath
  }
}
