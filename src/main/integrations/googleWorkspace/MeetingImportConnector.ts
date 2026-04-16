import type {
  MeetingImportCandidate,
  MeetingImportConnectorDescriptor,
  MeetingImportConnectorId,
} from '../../../shared/types'

export interface MeetingImportConnector {
  readonly descriptor: MeetingImportConnectorDescriptor
  listCandidates(): Promise<MeetingImportCandidate[]>
  resolveMeetingFilePath(meetingId: string): Promise<string>
}

export function assertSupportedConnector(
  connectorId: MeetingImportConnectorId,
  expected: MeetingImportConnectorId,
): void {
  if (connectorId !== expected) {
    throw new Error(`Unsupported meeting import connector "${connectorId}".`)
  }
}
