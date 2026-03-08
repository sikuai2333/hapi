export type AuthSettings = {
    hubUrl: string
    accessToken: string
}

export type AuthResponse = {
    token: string
    user: {
        id: number
        username?: string
        firstName?: string
        lastName?: string
    }
}

export type PermissionRequest = {
    tool: string
    arguments: unknown
    createdAt?: number | null
}

export type AgentState = {
    controlledByUser?: boolean | null
    requests?: Record<string, PermissionRequest> | null
}

export type SessionMetadata = {
    path?: string
    host?: string
    flavor?: string | null
}

export type SessionSummary = {
    id: string
    active: boolean
    updatedAt: number
    metadata?: SessionMetadata | null
}

export type Session = {
    id: string
    active: boolean
    createdAt: number
    updatedAt: number
    metadata?: SessionMetadata | null
    agentState?: AgentState | null
    thinking?: boolean
}

export type DecryptedMessage = {
    id: string
    seq: number | null
    localId: string | null
    content: unknown
    createdAt: number
}

export type SessionsResponse = {
    sessions: SessionSummary[]
}

export type SessionResponse = {
    session: Session
}

export type MessagesResponse = {
    messages: DecryptedMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}
