import type {
    AuthResponse,
    AuthSettings,
    MessagesResponse,
    SessionResponse,
    SessionsResponse
} from './types'

export function normalizeBaseUrl(input: string): string {
    const trimmed = input.trim()
    if (!trimmed) {
        return ''
    }

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
    return withProtocol.replace(/\/+$/, '')
}

export class HapiApiClient {
    private readonly baseUrl: string
    private readonly accessToken: string
    private jwtToken: string | null = null

    constructor(settings: AuthSettings) {
        this.baseUrl = normalizeBaseUrl(settings.hubUrl)
        this.accessToken = settings.accessToken.trim()
    }

    private buildUrl(path: string): string {
        return `${this.baseUrl}${path}`
    }

    private async authenticate(): Promise<AuthResponse> {
        const response = await fetch(this.buildUrl('/api/auth'), {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({ accessToken: this.accessToken })
        })

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(`认证失败 (${response.status}): ${body || response.statusText}`)
        }

        const payload = await response.json() as AuthResponse
        this.jwtToken = payload.token
        return payload
    }

    private async request<T>(path: string, init?: RequestInit, retry: boolean = true): Promise<T> {
        if (!this.jwtToken) {
            await this.authenticate()
        }

        const headers = new Headers(init?.headers)
        headers.set('authorization', `Bearer ${this.jwtToken}`)
        if (init?.body !== undefined && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const response = await fetch(this.buildUrl(path), {
            ...init,
            headers
        })

        if (response.status === 401 && retry) {
            await this.authenticate()
            return await this.request<T>(path, init, false)
        }

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(`请求失败 ${path} (${response.status}): ${body || response.statusText}`)
        }

        return await response.json() as T
    }

    async getSessions(): Promise<SessionsResponse> {
        return await this.request<SessionsResponse>('/api/sessions')
    }

    async getSession(sessionId: string): Promise<SessionResponse> {
        return await this.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
    }

    async getMessages(sessionId: string, limit: number = 100): Promise<MessagesResponse> {
        return await this.request<MessagesResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}`
        )
    }

    async sendMessage(sessionId: string, text: string): Promise<void> {
        await this.request('/api/sessions/${encodeURIComponent(sessionId)}/messages', {
            method: 'POST',
            body: JSON.stringify({ text })
        })
    }

    async approvePermission(sessionId: string, requestId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/approve`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async denyPermission(sessionId: string, requestId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/deny`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }
}
