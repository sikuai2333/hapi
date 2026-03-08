import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthSettings } from '../api/types'

const AUTH_STORAGE_KEY = '@hapi/mobile/auth-settings/v1'

export async function loadAuthSettings(): Promise<AuthSettings | null> {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
        return null
    }

    try {
        const parsed = JSON.parse(raw) as Partial<AuthSettings>
        if (!parsed.hubUrl || !parsed.accessToken) {
            return null
        }
        return {
            hubUrl: parsed.hubUrl,
            accessToken: parsed.accessToken
        }
    } catch {
        return null
    }
}

export async function saveAuthSettings(settings: AuthSettings): Promise<void> {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(settings))
}

export async function clearAuthSettings(): Promise<void> {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY)
}
