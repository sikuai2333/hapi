import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { HapiApiClient, normalizeBaseUrl } from './src/api/client'
import type { AuthSettings, DecryptedMessage, PermissionRequest, Session, SessionSummary } from './src/api/types'
import { clearAuthSettings, loadAuthSettings, saveAuthSettings } from './src/storage/auth'

function renderUnknown(value: unknown): string {
    if (value === null || value === undefined) {
        return ''
    }
    if (typeof value === 'string') {
        return value
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    if (Array.isArray(value)) {
        const parts = value
            .map((item) => renderUnknown(item))
            .filter((item) => item.length > 0)
        return parts.join('\n')
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>
        if (typeof record.text === 'string') {
            return record.text
        }
        if (record.content !== undefined) {
            const fromContent = renderUnknown(record.content)
            if (fromContent.length > 0) {
                return fromContent
            }
        }
        try {
            return JSON.stringify(value)
        } catch {
            return '[unserializable content]'
        }
    }
    return String(value)
}

function formatTime(ts?: number | null): string {
    if (!ts || Number.isNaN(ts)) {
        return '-'
    }
    return new Date(ts).toLocaleString()
}

function formatMessage(message: DecryptedMessage): string {
    const body = renderUnknown(message.content).trim()
    if (body.length > 0) {
        return body
    }
    return '[empty message]'
}

export default function App() {
    const [hubUrl, setHubUrl] = useState('http://127.0.0.1:8080')
    const [accessToken, setAccessToken] = useState('')
    const [storedSettings, setStoredSettings] = useState<AuthSettings | null>(null)
    const [sessions, setSessions] = useState<SessionSummary[]>([])
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
    const [sessionDetail, setSessionDetail] = useState<Session | null>(null)
    const [messages, setMessages] = useState<DecryptedMessage[]>([])
    const [composerText, setComposerText] = useState('')
    const [booting, setBooting] = useState(true)
    const [connecting, setConnecting] = useState(false)
    const [loadingSession, setLoadingSession] = useState(false)
    const [sendingMessage, setSendingMessage] = useState(false)
    const [connected, setConnected] = useState(false)
    const [errorText, setErrorText] = useState('')
    const [infoText, setInfoText] = useState('')
    const clientRef = useRef<HapiApiClient | null>(null)

    const requests = useMemo(() => {
        const raw = sessionDetail?.agentState?.requests ?? {}
        return Object.entries(raw).map(([id, request]) => {
            const data = request as PermissionRequest
            return {
                id,
                tool: data.tool ?? 'unknown',
                args: renderUnknown(data.arguments),
                createdAt: data.createdAt ?? null
            }
        })
    }, [sessionDetail])

    function setClient(settings: AuthSettings): void {
        clientRef.current = new HapiApiClient(settings)
    }

    function normalizeSettings(nextHubUrl: string, nextAccessToken: string): AuthSettings | null {
        const normalizedHubUrl = normalizeBaseUrl(nextHubUrl)
        const normalizedAccessToken = nextAccessToken.trim()
        if (!normalizedHubUrl) {
            setErrorText('Hub 地址不能为空')
            return null
        }
        if (!normalizedAccessToken) {
            setErrorText('Access Token 不能为空')
            return null
        }
        return {
            hubUrl: normalizedHubUrl,
            accessToken: normalizedAccessToken
        }
    }

    async function loadSession(sessionId: string, withIndicator: boolean = true): Promise<void> {
        const client = clientRef.current
        if (!client) {
            return
        }
        if (withIndicator) {
            setLoadingSession(true)
        }
        setErrorText('')
        try {
            const [sessionResponse, messagesResponse] = await Promise.all([
                client.getSession(sessionId),
                client.getMessages(sessionId, 120)
            ])
            setSelectedSessionId(sessionId)
            setSessionDetail(sessionResponse.session)
            setMessages(messagesResponse.messages)
        } catch (error) {
            const message = error instanceof Error ? error.message : '加载会话失败'
            setErrorText(message)
        } finally {
            if (withIndicator) {
                setLoadingSession(false)
            }
        }
    }

    async function refreshSessions(preferredSessionId?: string): Promise<void> {
        const client = clientRef.current
        if (!client) {
            return
        }

        const response = await client.getSessions()
        const sorted = [...response.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
        setSessions(sorted)

        if (sorted.length === 0) {
            setSelectedSessionId(null)
            setSessionDetail(null)
            setMessages([])
            return
        }

        const nextSessionId = preferredSessionId && sorted.some((item) => item.id === preferredSessionId)
            ? preferredSessionId
            : sorted[0].id

        await loadSession(nextSessionId, false)
    }

    async function connectUsingSettings(settings: AuthSettings): Promise<void> {
        setConnecting(true)
        setErrorText('')
        setInfoText('')
        setClient(settings)
        try {
            await refreshSessions(selectedSessionId ?? undefined)
            setConnected(true)
            setInfoText('连接成功')
        } catch (error) {
            const message = error instanceof Error ? error.message : '连接失败'
            setConnected(false)
            setErrorText(message)
        } finally {
            setConnecting(false)
        }
    }

    async function handleSaveSettings(): Promise<void> {
        const nextSettings = normalizeSettings(hubUrl, accessToken)
        if (!nextSettings) {
            return
        }
        setErrorText('')
        await saveAuthSettings(nextSettings)
        setStoredSettings(nextSettings)
        setHubUrl(nextSettings.hubUrl)
        setAccessToken(nextSettings.accessToken)
        setInfoText('设置已保存')
    }

    async function handleConnect(): Promise<void> {
        const nextSettings = normalizeSettings(hubUrl, accessToken)
        if (!nextSettings) {
            return
        }
        await saveAuthSettings(nextSettings)
        setStoredSettings(nextSettings)
        setHubUrl(nextSettings.hubUrl)
        setAccessToken(nextSettings.accessToken)
        await connectUsingSettings(nextSettings)
    }

    async function handleClearSettings(): Promise<void> {
        await clearAuthSettings()
        setStoredSettings(null)
        setConnected(false)
        setSessions([])
        setSelectedSessionId(null)
        setSessionDetail(null)
        setMessages([])
        setAccessToken('')
        clientRef.current = null
        setErrorText('')
        setInfoText('本地设置已清除')
    }

    async function handleRefresh(): Promise<void> {
        if (!storedSettings) {
            return
        }
        await connectUsingSettings(storedSettings)
    }

    async function handleSendMessage(): Promise<void> {
        if (!selectedSessionId) {
            setErrorText('请先选择会话')
            return
        }
        const text = composerText.trim()
        if (!text) {
            return
        }

        const client = clientRef.current
        if (!client) {
            setErrorText('当前未连接，请先连接 Hub')
            return
        }

        setSendingMessage(true)
        setErrorText('')
        try {
            await client.sendMessage(selectedSessionId, text)
            setComposerText('')
            await loadSession(selectedSessionId, false)
        } catch (error) {
            const message = error instanceof Error ? error.message : '发送失败'
            setErrorText(message)
        } finally {
            setSendingMessage(false)
        }
    }

    async function handleApprove(requestId: string): Promise<void> {
        if (!selectedSessionId) {
            return
        }
        const client = clientRef.current
        if (!client) {
            return
        }
        setErrorText('')
        try {
            await client.approvePermission(selectedSessionId, requestId)
            await loadSession(selectedSessionId, false)
        } catch (error) {
            const message = error instanceof Error ? error.message : '审批失败'
            setErrorText(message)
        }
    }

    async function handleDeny(requestId: string): Promise<void> {
        if (!selectedSessionId) {
            return
        }
        const client = clientRef.current
        if (!client) {
            return
        }
        setErrorText('')
        try {
            await client.denyPermission(selectedSessionId, requestId)
            await loadSession(selectedSessionId, false)
        } catch (error) {
            const message = error instanceof Error ? error.message : '拒绝失败'
            setErrorText(message)
        }
    }

    useEffect(() => {
        let active = true

        const bootstrap = async () => {
            try {
                const loaded = await loadAuthSettings()
                if (!active || !loaded) {
                    return
                }
                setStoredSettings(loaded)
                setHubUrl(loaded.hubUrl)
                setAccessToken(loaded.accessToken)
                setConnecting(true)
                setErrorText('')
                setInfoText('')
                setClient(loaded)
                const client = clientRef.current
                if (!client) {
                    throw new Error('客户端初始化失败')
                }

                const response = await client.getSessions()
                const sorted = [...response.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
                setSessions(sorted)

                if (sorted.length > 0) {
                    const firstSession = sorted[0].id
                    const [sessionResponse, messagesResponse] = await Promise.all([
                        client.getSession(firstSession),
                        client.getMessages(firstSession, 120)
                    ])
                    setSelectedSessionId(firstSession)
                    setSessionDetail(sessionResponse.session)
                    setMessages(messagesResponse.messages)
                }

                setConnected(true)
                setInfoText('连接成功')
            } catch (error) {
                if (!active) {
                    return
                }
                const message = error instanceof Error ? error.message : '初始化失败'
                setErrorText(message)
                setConnected(false)
            } finally {
                if (active) {
                    setConnecting(false)
                    setBooting(false)
                }
            }
        }

        bootstrap().catch(() => {
            if (active) {
                setBooting(false)
            }
        })

        return () => {
            active = false
        }
    }, [])

    return (
        <SafeAreaProvider>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.root}>
                    <Text style={styles.title}>HAPI Mobile</Text>
                    <Text style={styles.subtitle}>React Native 客户端（Token 持久化 + 会话控制）</Text>

                    {booting ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator size="large" color="#0f766e" />
                            <Text style={styles.loadingText}>正在加载本地配置...</Text>
                        </View>
                    ) : (
                        <ScrollView contentContainerStyle={styles.content}>
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>连接设置</Text>
                                <Text style={styles.label}>Hub 地址</Text>
                                <TextInput
                                    style={styles.input}
                                    value={hubUrl}
                                    onChangeText={setHubUrl}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    placeholder="http://192.168.1.10:8080"
                                    placeholderTextColor="#94a3b8"
                                />
                                <Text style={styles.label}>CLI Access Token</Text>
                                <TextInput
                                    style={styles.input}
                                    value={accessToken}
                                    onChangeText={setAccessToken}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    secureTextEntry
                                    placeholder="CLI_API_TOKEN"
                                    placeholderTextColor="#94a3b8"
                                />
                                <View style={styles.buttonRow}>
                                    <Pressable style={styles.primaryButton} onPress={handleSaveSettings}>
                                        <Text style={styles.primaryButtonText}>保存</Text>
                                    </Pressable>
                                    <Pressable style={styles.primaryButton} onPress={handleConnect}>
                                        <Text style={styles.primaryButtonText}>
                                            {connecting ? '连接中...' : connected ? '重连' : '连接'}
                                        </Text>
                                    </Pressable>
                                </View>
                                <Pressable style={styles.secondaryButton} onPress={handleClearSettings}>
                                    <Text style={styles.secondaryButtonText}>清除本地配置</Text>
                                </Pressable>
                            </View>

                            {errorText ? (
                                <View style={styles.errorBanner}>
                                    <Text style={styles.errorText}>{errorText}</Text>
                                </View>
                            ) : null}

                            {infoText ? (
                                <View style={styles.infoBanner}>
                                    <Text style={styles.infoText}>{infoText}</Text>
                                </View>
                            ) : null}

                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>会话列表</Text>
                                    <Pressable style={styles.miniButton} onPress={handleRefresh}>
                                        <Text style={styles.miniButtonText}>刷新</Text>
                                    </Pressable>
                                </View>
                                {connecting ? (
                                    <View style={styles.inlineLoading}>
                                        <ActivityIndicator color="#0f766e" />
                                        <Text style={styles.inlineLoadingText}>正在同步会话...</Text>
                                    </View>
                                ) : sessions.length === 0 ? (
                                    <Text style={styles.placeholderText}>暂无会话，先在桌面端启动一个 HAPI 会话。</Text>
                                ) : (
                                    sessions.map((session) => (
                                        <Pressable
                                            key={session.id}
                                            style={[
                                                styles.sessionItem,
                                                session.id === selectedSessionId ? styles.sessionItemActive : null
                                            ]}
                                            onPress={() => {
                                                loadSession(session.id, true).catch(() => {})
                                            }}
                                        >
                                            <Text style={styles.sessionTitle} numberOfLines={1}>
                                                {session.metadata?.path || session.id}
                                            </Text>
                                            <Text style={styles.sessionMeta}>
                                                {session.active ? 'active' : 'inactive'} · {formatTime(session.updatedAt)}
                                            </Text>
                                        </Pressable>
                                    ))
                                )}
                            </View>

                            {selectedSessionId ? (
                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>当前会话</Text>
                                    {loadingSession ? (
                                        <View style={styles.inlineLoading}>
                                            <ActivityIndicator color="#0f766e" />
                                            <Text style={styles.inlineLoadingText}>加载会话详情...</Text>
                                        </View>
                                    ) : sessionDetail ? (
                                        <>
                                            <Text style={styles.metaText}>ID: {sessionDetail.id}</Text>
                                            <Text style={styles.metaText}>
                                                状态: {sessionDetail.active ? 'active' : 'inactive'}
                                            </Text>
                                            <Text style={styles.metaText}>
                                                主机: {sessionDetail.metadata?.host || '-'}
                                            </Text>
                                            <Text style={styles.metaText}>
                                                模式: {sessionDetail.metadata?.flavor || '-'}
                                            </Text>

                                            <Text style={styles.sectionTitle}>待审批请求</Text>
                                            {requests.length === 0 ? (
                                                <Text style={styles.placeholderText}>当前没有待处理请求。</Text>
                                            ) : (
                                                requests.map((request) => (
                                                    <View style={styles.requestCard} key={request.id}>
                                                        <Text style={styles.requestTitle}>{request.tool}</Text>
                                                        <Text style={styles.requestMeta}>requestId: {request.id}</Text>
                                                        <Text style={styles.requestMeta}>
                                                            createdAt: {formatTime(request.createdAt)}
                                                        </Text>
                                                        <Text style={styles.requestArgs} numberOfLines={6}>
                                                            {request.args || '{}'}
                                                        </Text>
                                                        <View style={styles.buttonRow}>
                                                            <Pressable
                                                                style={styles.approveButton}
                                                                onPress={() => {
                                                                    handleApprove(request.id).catch(() => {})
                                                                }}
                                                            >
                                                                <Text style={styles.actionButtonText}>批准</Text>
                                                            </Pressable>
                                                            <Pressable
                                                                style={styles.denyButton}
                                                                onPress={() => {
                                                                    handleDeny(request.id).catch(() => {})
                                                                }}
                                                            >
                                                                <Text style={styles.actionButtonText}>拒绝</Text>
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                ))
                                            )}
                                        </>
                                    ) : (
                                        <Text style={styles.placeholderText}>会话详情加载失败。</Text>
                                    )}
                                </View>
                            ) : null}

                            {selectedSessionId ? (
                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>消息</Text>
                                    {messages.length === 0 ? (
                                        <Text style={styles.placeholderText}>暂无消息</Text>
                                    ) : (
                                        messages.map((message) => (
                                            <View style={styles.messageItem} key={message.id}>
                                                <Text style={styles.messageMeta}>
                                                    #{message.seq ?? '-'} · {formatTime(message.createdAt)}
                                                </Text>
                                                <Text style={styles.messageText}>{formatMessage(message)}</Text>
                                            </View>
                                        ))
                                    )}
                                </View>
                            ) : null}

                            {selectedSessionId ? (
                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>发送消息</Text>
                                    <TextInput
                                        style={styles.composerInput}
                                        value={composerText}
                                        onChangeText={setComposerText}
                                        multiline
                                        placeholder="输入要发给当前会话的消息"
                                        placeholderTextColor="#94a3b8"
                                    />
                                    <Pressable
                                        style={styles.primaryButton}
                                        onPress={handleSendMessage}
                                        disabled={sendingMessage}
                                    >
                                        <Text style={styles.primaryButtonText}>
                                            {sendingMessage ? '发送中...' : '发送'}
                                        </Text>
                                    </Pressable>
                                </View>
                            ) : null}
                        </ScrollView>
                    )}
                </View>
            </SafeAreaView>
        </SafeAreaProvider>
    )
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f8fafc'
    },
    root: {
        flex: 1,
        paddingHorizontal: 14,
        paddingTop: 8
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#0f172a'
    },
    subtitle: {
        marginTop: 4,
        marginBottom: 8,
        color: '#334155'
    },
    loadingBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10
    },
    loadingText: {
        color: '#0f172a'
    },
    content: {
        gap: 12,
        paddingBottom: 24
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 12,
        gap: 8
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a'
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    label: {
        marginTop: 4,
        color: '#334155',
        fontSize: 13
    },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 10,
        color: '#0f172a',
        backgroundColor: '#ffffff'
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 8
    },
    primaryButton: {
        flex: 1,
        backgroundColor: '#0f766e',
        borderRadius: 10,
        paddingVertical: 11,
        alignItems: 'center'
    },
    primaryButtonText: {
        color: '#ffffff',
        fontWeight: '700'
    },
    secondaryButton: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#94a3b8',
        paddingVertical: 10,
        alignItems: 'center'
    },
    secondaryButtonText: {
        color: '#334155',
        fontWeight: '600'
    },
    miniButton: {
        backgroundColor: '#0f766e',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6
    },
    miniButtonText: {
        color: '#ffffff',
        fontWeight: '600'
    },
    errorBanner: {
        backgroundColor: '#fee2e2',
        borderColor: '#fecaca',
        borderWidth: 1,
        borderRadius: 10,
        padding: 10
    },
    errorText: {
        color: '#991b1b'
    },
    infoBanner: {
        backgroundColor: '#dcfce7',
        borderColor: '#bbf7d0',
        borderWidth: 1,
        borderRadius: 10,
        padding: 10
    },
    infoText: {
        color: '#166534'
    },
    inlineLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    inlineLoadingText: {
        color: '#334155'
    },
    placeholderText: {
        color: '#64748b'
    },
    sessionItem: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        padding: 10,
        gap: 3
    },
    sessionItemActive: {
        borderColor: '#0f766e',
        backgroundColor: '#f0fdfa'
    },
    sessionTitle: {
        color: '#0f172a',
        fontWeight: '600'
    },
    sessionMeta: {
        color: '#475569',
        fontSize: 12
    },
    metaText: {
        color: '#1e293b',
        fontSize: 13
    },
    sectionTitle: {
        marginTop: 8,
        fontSize: 14,
        fontWeight: '700',
        color: '#0f172a'
    },
    requestCard: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        padding: 10,
        gap: 4
    },
    requestTitle: {
        color: '#0f172a',
        fontWeight: '700'
    },
    requestMeta: {
        color: '#475569',
        fontSize: 12
    },
    requestArgs: {
        marginTop: 4,
        color: '#1e293b',
        fontSize: 12
    },
    approveButton: {
        flex: 1,
        backgroundColor: '#0f766e',
        borderRadius: 8,
        paddingVertical: 8,
        alignItems: 'center'
    },
    denyButton: {
        flex: 1,
        backgroundColor: '#b91c1c',
        borderRadius: 8,
        paddingVertical: 8,
        alignItems: 'center'
    },
    actionButtonText: {
        color: '#ffffff',
        fontWeight: '700'
    },
    messageItem: {
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingBottom: 8,
        marginBottom: 8
    },
    messageMeta: {
        color: '#475569',
        fontSize: 12,
        marginBottom: 2
    },
    messageText: {
        color: '#0f172a',
        lineHeight: 20
    },
    composerInput: {
        minHeight: 90,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 10,
        textAlignVertical: 'top',
        color: '#0f172a'
    }
})
