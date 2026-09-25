import { computed, onScopeDispose, ref } from 'vue'
import { showMessage } from 'siyuan'
import { storageEngine, type StorageKey } from './storage/engine'

export interface LicenseInfo {
  userId: string
  userName: string
  type: string
  activatedAt: number
  expiresAt: number
  features: string[]
  licenseVersion: number
  lastVerifiedAt: number
  isValid: boolean
  source: 'membership'
}

export interface LicenseResult {
  success: boolean
  license?: LicenseInfo
  message?: string
  error?: string
}


const PAID_FEATURES: Record<string, string> = {
  'reader-theme': 'trial',
  'reader-stats': 'trial',
  'quick-mark': 'annual',
  'quick-send': 'annual',
  'folder-group': 'trial',
  'smart-group': 'monthly',
  'book-edit': 'trial',
  'batch-operation': 'trial',
  'doc-assets': 'monthly',
  'book-search': 'monthly',
  'tts': 'trial',
  'tts-online': 'monthly',
  'translate': 'trial',
  'dict-offline': 'trial',
  'dict-advanced': 'trial',
  'siyuan-sync': 'monthly',
}

const LEVELS: Record<string, number> = { free: 0, trial: 1, monthly: 2, annual: 3, lifetime: 4 }

export class LicenseManager {
  static readonly API = 'https://vip.745201.xyz'
  static readonly USAGE_API = 'https://api.745201.xyz/simedia'
  static readonly KEY = 'sireader_license'
  static readonly USAGE_DAY_KEY = 'sireader_usage_report_day'
  static readonly REFRESH_INTERVAL = 7 * 24 * 60 * 60 * 1000
  private static readonly licenseKey: StorageKey<LicenseInfo | null> = { name: LicenseManager.KEY, defaultValue: () => null }
  private static readonly usageDayKey: StorageKey<string> = { name: LicenseManager.USAGE_DAY_KEY, defaultValue: () => '' }
  private static operationId(label: string) { return `${label}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}` }

  private static async requestJson(url: string, init: RequestInit = {}) {
    try {
      const response = await fetch(url, init)
      return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) as any }
    }
    catch (error) {
      const proxy = await fetch('/api/network/forwardProxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: init.method || 'GET',
          contentType: String((init.headers as Record<string, string> | undefined)?.['Content-Type'] || 'application/json'),
          headers: [],
          payload: typeof init.body === 'string' ? init.body : {},
          timeout: 15000,
        }),
      }).catch(() => null)
      const result = proxy?.ok ? await proxy.json().catch(() => null) : null
      const data = result?.code === 0 ? result.data : null
      if (data) {
        let body: any = {}
        try { body = typeof data.body === 'string' ? JSON.parse(data.body || '{}') : data.body || {} } catch {}
        return { ok: Number(data.status) >= 200 && Number(data.status) < 300, status: Number(data.status || 0), data: body }
      }
      throw error
    }
  }

  static can(feature: string, license: LicenseInfo | null): boolean {
    const required = PAID_FEATURES[feature]
    if (!required) return true
    if (!license || !this.isUsable(license)) return false
    return (LEVELS[license.type] || 0) >= (LEVELS[required] || 0)
  }

  static async getLicense(): Promise<LicenseInfo | null> {
    try {
      const license = await this.loadStored()
      if (!license || !this.isUsable(license)) return null
      if (Date.now() - license.lastVerifiedAt < this.REFRESH_INTERVAL) {
        void this.reportUsage(license.userId)
        return license
      }
      const fresh = await this.verifyFromServer()
      if (!fresh) return license
      await this.save(fresh)
      void this.reportUsage(fresh.userId)
      return fresh
    }
    catch {
      return null
    }
  }

  static async recover(): Promise<LicenseResult> {
    const user = await this.getUser()
    if (!user) return { success: false, error: '未检测到当前思源账号' }
    try {
      const license = await this.verifyFromServer(user)
      if (!license) return { success: false, error: '未检测到有效会员权益' }
      await this.save(license)
      return { success: true, license, message: '会员权益已同步' }
    }
    catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '恢复权益失败' }
    }
  }

  static async verifyFromServer(user?: { userId: string; userName: string }): Promise<LicenseInfo | null> {
    const account = user || await this.getUser()
    if (!account) return null
    const response = await this.requestJson(`${this.API}/state?account=${encodeURIComponent(account.userId)}`)
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(response.data?.message || response.data?.error || `会员信息读取失败（${response.status}）`)
    }
    const license = this.fromMemberships(response.data, account)
    if (license) void this.reportUsage(account.userId)
    return license
  }

  private static async reportUsage(userId: string) {
    const day = new Date().toISOString().slice(0, 10)
    const reportedDay = await storageEngine.read(this.usageDayKey).catch(() => '')
    if (reportedDay === day) return
    try {
      const response = await fetch(`${this.USAGE_API}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, product: 'sireader' }),
      })
      if (response.ok) await storageEngine.transact(this.usageDayKey, [{ id: this.operationId('usage-day'), type: 'set', path: [], value: day }])
    }
    catch { /* usage reporting must never block license verification */ }
  }

  static async createMiniProgramBindingQr(account?: { userId?: string; userName?: string }) {
    const user = account?.userId
      ? { userId: String(account.userId), userName: String(account.userName || '思源账号') }
      : await this.getUser()
    if (!user?.userId) throw new Error('未检测到当前思源账号')

    const response = await this.requestJson(`${this.API}/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: user.userId, accountName: user.userName, source: '思阅插件' }),
    })
    const payload = response.data
    if (!response.ok || !payload.token) throw new Error(payload.message || `绑定二维码生成失败（${response.status}）`)

    // 小程序码接口直接返回图片，交给浏览器原生加载，避免读取和转码大图片。
    return { data: `${this.API}/bind/${encodeURIComponent(payload.token)}/code`, token: payload.token as string, expiresAt: payload.expiresAt || '' }
  }

  static async bind(account?: { userId?: string; userName?: string }, signal?: AbortSignal, onQr?: (qr: { data: string; expiresAt: string }) => void) {
    const session = await this.createMiniProgramBindingQr(account)
    if (signal?.aborted) return null
    onQr?.({ data: session.data, expiresAt: session.expiresAt })
    return this.waitForBinding(session.token, session.expiresAt, signal)
  }

  static async verifyBindingSession(token: string): Promise<LicenseInfo | null> {
    const response = await this.requestJson(`${this.API}/bind/${encodeURIComponent(token)}`)
    if (!response.ok) return null
    const data = response.data
    const binding = data.binding || data.data?.binding
    if (!binding?.accountId) return null
    return this.fromMemberships(data, {
      userId: String(binding.accountId),
      userName: String(binding.accountName || '思源账号'),
    }) || this.normalizeLicense({ userId: String(binding.accountId), userName: String(binding.accountName || '思源账号'), type: 'free', activatedAt: 0, expiresAt: 0, features: [], licenseVersion: 1, lastVerifiedAt: Date.now() })
  }

  static async waitForBinding(token: string, expiresAt = '', signal?: AbortSignal): Promise<LicenseInfo | null> {
    const deadline = Date.parse(expiresAt) || Date.now() + 10 * 60 * 1000
    let delay = 1500
    while (Date.now() < deadline && !signal?.aborted) {
      const license = await this.verifyBindingSession(token)
      if (license) return license
      await new Promise<void>(resolve => setTimeout(resolve, delay))
      delay = Math.min(5000, delay + 750)
    }
    return null
  }

  static async save(license: LicenseInfo) {
    await storageEngine.transact(this.licenseKey, [{ id: this.operationId('license'), type: 'set', path: [], value: this.normalizeLicense(license) }])
  }

  static async getUserAvatar(): Promise<string | null> {
    const cached = (globalThis as any)?.window?.siyuan?.user?.userAvatarURL
    if (cached) return String(cached)
    try {
      const response = await fetch('/api/setting/getCloudUser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const payload = await response.json().catch(() => ({})) as any
      return response.ok && payload.code === 0 && payload.data?.userAvatarURL ? String(payload.data.userAvatarURL) : null
    }
    catch {
      return null
    }
  }

  static async getUser(): Promise<{ userId: string; userName: string } | null> {
    const cached = (globalThis as any)?.window?.siyuan?.user
    if (cached?.userId) return {
      userId: String(cached.userId),
      userName: String(cached.userName || cached.userNickname || cached.userId),
    }
    try {
      const response = await fetch('/api/setting/getCloudUser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const payload = await response.json().catch(() => ({})) as any
      const user = payload.data
      return response.ok && payload.code === 0 && user?.userId
        ? { userId: String(user.userId), userName: String(user.userName || user.userNickname || user.userId) }
        : null
    }
    catch {
      return null
    }
  }

  static normalizeLicense(payload: Partial<LicenseInfo> & { userId: string; type: string }): LicenseInfo {
    const expiresAt = this.toTimestamp(payload.expiresAt)
    return {
      userId: String(payload.userId || ''),
      userName: String(payload.userName || ''),
      type: String(payload.type || ''),
      activatedAt: this.toTimestamp(payload.activatedAt),
      expiresAt,
      features: Array.isArray(payload.features) ? payload.features : [],
      licenseVersion: Number(payload.licenseVersion || 1),
      lastVerifiedAt: Number(payload.lastVerifiedAt || Date.now()),
      isValid: expiresAt <= 0 || expiresAt > Date.now(),
      source: 'membership',
    }
  }

  private static async loadStored(): Promise<LicenseInfo | null> {
    const state = await storageEngine.readState(this.licenseKey)
    const raw: any = state.found ? state.value : null
    if (!raw || typeof raw !== 'object' || raw.encrypted || !raw.userId || !raw.type) return null
    return this.normalizeLicense(raw)
  }

  private static fromMemberships(data: any, account: { userId: string; userName: string }): LicenseInfo | null {
    const memberships = Array.isArray(data)
      ? data
      : Array.isArray(data.memberships) ? data.memberships : Array.isArray(data.data?.memberships) ? data.data.memberships : []
    const item = memberships.filter((membership: any) => {
      if (String(membership?.product || '').toLowerCase() !== 'sireader') return false
      const status = String(membership?.status || '').toLowerCase()
      return status === 'active'
    }).sort((a: any, b: any) => {
      const rank = (value: any) => ({ trial: 1, monthly: 2, annual: 3, lifetime: 4 }[String(value?.plan || value?.type || '').toLowerCase()] || 0)
      const rankDiff = rank(b) - rank(a)
      if (rankDiff) return rankDiff
      const expiry = (value: any) => Number(value?.expiresAt ?? value?.expires_at ?? 0)
      const aExpiry = expiry(a); const bExpiry = expiry(b)
      if (aExpiry === 0 && bExpiry !== 0) return -1
      if (bExpiry === 0 && aExpiry !== 0) return 1
      return bExpiry - aExpiry
    })[0]
    if (!item) return null

    const binding = data.binding || data.data?.binding
    return this.normalizeLicense({
      userId: account.userId,
      userName: String(binding?.accountName || account.userName),
      type: String(item.plan || item.type || 'monthly'),
      activatedAt: this.toTimestamp(item.activatedAt ?? item.activated_at),
      expiresAt: this.toTimestamp(item.expiresAt ?? item.expires_at),
      features: Array.isArray(item.features) ? item.features : [],
      licenseVersion: Number(item.licenseVersion || item.license_version || 1),
      lastVerifiedAt: Date.now(),
    })
  }

  private static isUsable(license: LicenseInfo): boolean {
    return license.expiresAt <= 0 || license.expiresAt > Date.now()
  }

  private static toTimestamp(value: unknown): number {
    if (value == null || value === '') return 0
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
    const parsed = Date.parse(String(value))
    return Number.isFinite(parsed) ? parsed : 0
  }

}

export function useLicense(_i18n?: any) {
  const license = ref<LicenseInfo | null>(null)
  const userAvatar = ref<string | null>(null)
  const qr = ref<{ data: string; expiresAt: string } | null>(null)
  const loading = ref(false)
  const processing = ref(false)
  let bindingAbort: AbortController | null = null

  const updateLicense = async (value: LicenseInfo | null) => {
    license.value = value
    userAvatar.value = value ? await LicenseManager.getUserAvatar() : null
  }
  const load = async () => {
    loading.value = true
    try { await updateLicense(await LicenseManager.getLicense()) }
    finally { loading.value = false }
  }
  const cancelBind = () => {
    bindingAbort?.abort()
    bindingAbort = null
    qr.value = null
    processing.value = false
  }
  const bind = async () => {
    cancelBind()
    const controller = new AbortController()
    bindingAbort = controller
    processing.value = true
    qr.value = { data: '', expiresAt: '' }
    try {
      const synced = await LicenseManager.bind(undefined, controller.signal, value => { qr.value = value })
      if (controller.signal.aborted) return
      qr.value = null
      if (!synced) return showMessage('绑定二维码已失效，请重新生成', 3000, 'error')
      if (synced.type !== 'free') {
        await LicenseManager.save(synced)
        await updateLicense(synced)
        showMessage('绑定成功，会员权益已同步', 2500, 'info')
      } else showMessage('账号已绑定，当前未开通思阅会员', 2500, 'info')
    }
    catch (error) {
      if (!controller.signal.aborted) {
        qr.value = null
        const message = error instanceof TypeError ? '会员服务连接失败，请检查网络后重试' : error instanceof Error ? error.message : '扫码绑定失败'
        showMessage(message, 3000, 'error')
      }
    }
    finally {
      if (bindingAbort === controller) {
        bindingAbort = null
        processing.value = false
      }
    }
  }
  const recover = async () => {
    processing.value = true
    try {
      const result = await LicenseManager.recover()
      if (!result.success || !result.license) return showMessage(result.error || '未检测到有效会员权益', 3000, 'error')
      await updateLicense(result.license)
      showMessage(result.message || '会员权益已同步', 2500, 'info')
    }
    finally { processing.value = false }
  }
  const can = computed(() => (feature: string) => LicenseManager.can(feature, license.value))
  const showUpgrade = (featureName: string) => showMessage(
    `${featureName}需要相应会员权限<div style="margin-top:12px;text-align:right"><button class="b3-button b3-button--text" onclick="window._openLicenseContent?.()">查看会员</button></div>`,
    0,
    'info',
  )
  onScopeDispose(cancelBind)
  load()
  return { license, userAvatar, qr, loading, processing, load, bind, cancelBind, recover, can, showUpgrade }
}
