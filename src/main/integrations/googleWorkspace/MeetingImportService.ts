import type {
  MeetingImportCandidate,
  MeetingImportConnectorDescriptor,
  MeetingImportConnectorId,
  MeetingImportRequest,
} from '../../../shared/types'
import type { MeetingImportConnector } from './MeetingImportConnector'

const GOOGLE_INTEGRATION_DISABLED_MESSAGE =
  'Google Workspace integration is disabled. Set LOCAL_TRANSCRIBE_ENABLE_GOOGLE_WORKSPACE_IMPORT=1 to enable it.'

interface MeetingImportServiceOptions {
  googleWorkspaceEnabled: boolean
  connectors: MeetingImportConnector[]
}

export class MeetingImportService {
  private readonly googleWorkspaceEnabled: boolean
  private readonly connectorsById: Map<MeetingImportConnectorId, MeetingImportConnector>

  constructor(options: MeetingImportServiceOptions) {
    this.googleWorkspaceEnabled = options.googleWorkspaceEnabled
    this.connectorsById = new Map(
      options.connectors.map((connector) => [connector.descriptor.id, connector] as const),
    )
  }

  listConnectors(): MeetingImportConnectorDescriptor[] {
    return [...this.connectorsById.values()].map((connector) => {
      if (!this.googleWorkspaceEnabled && connector.descriptor.id === 'google-workspace') {
        return {
          ...connector.descriptor,
          enabled: false,
          reason: GOOGLE_INTEGRATION_DISABLED_MESSAGE,
        }
      }

      return connector.descriptor
    })
  }

  async discoverCandidates(connectorId: MeetingImportConnectorId): Promise<MeetingImportCandidate[]> {
    const connector = this.getEnabledConnector(connectorId)
    return connector.listCandidates()
  }

  async resolveImportFilePath(request: MeetingImportRequest): Promise<string> {
    const connector = this.getEnabledConnector(request.connectorId)
    return connector.resolveMeetingFilePath(request.meetingId)
  }

  private getEnabledConnector(connectorId: MeetingImportConnectorId): MeetingImportConnector {
    if (!this.googleWorkspaceEnabled && connectorId === 'google-workspace') {
      throw new Error(GOOGLE_INTEGRATION_DISABLED_MESSAGE)
    }

    const connector = this.connectorsById.get(connectorId)
    if (!connector) {
      throw new Error(`Unsupported meeting import connector "${connectorId}".`)
    }

    return connector
  }
}

export function isGoogleWorkspaceImportEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.LOCAL_TRANSCRIBE_ENABLE_GOOGLE_WORKSPACE_IMPORT
  if (!value) {
    return false
  }

  return value === '1' || value.toLowerCase() === 'true'
}

export { GOOGLE_INTEGRATION_DISABLED_MESSAGE }
