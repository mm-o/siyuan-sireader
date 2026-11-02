import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const storage = vi.hoisted(() => ({ settings: null as any }))
vi.mock('siyuan', () => ({ showMessage: vi.fn(), fetchSyncPost: vi.fn() }), { virtual: true })
vi.mock('@/api', () => ({ readDir: vi.fn(async () => []), searchDocs: vi.fn(async () => []) }), { virtual: true })
vi.mock('@/core/bookshelf', () => ({ bookshelfManager: { getSetting: vi.fn(async () => storage.settings), patchSetting: vi.fn(async () => {}) } }), { virtual: true })
vi.mock('@/core/storage', () => ({ normalizeSiyuanCloudUrl: (value: string) => value, removeManagedFileTransactionally: vi.fn(), writeManagedFile: vi.fn(), diffLeaves: vi.fn(() => ({})) }), { virtual: true })
vi.mock('@/services/OfflineTTS', () => ({
  OFFICIAL_TTS_MODELS_URL: 'https://example.com/tts-models',
  OfflineTTSManager: class { list = vi.fn(async () => [{ id: 'kokoro-82m-zh-en', name: 'Kokoro', kind: 'kokoro', installed: false }, { id: 'zh-CN-xiao-ya', name: 'Piper', kind: 'piper-vits', installed: false }]); voices = vi.fn(() => []); }
}), { virtual: true })
vi.mock('@/services/TTSEngine', () => ({ loadLocalVoices: vi.fn(async () => []), loadOnlineVoices: vi.fn(async () => []) }), { virtual: true })

describe('TTS setting defaults', () => {
  beforeEach(() => {
    storage.settings = null
    vi.stubGlobal('window', Object.assign(new EventTarget(), { __sireader_settings: undefined, open: vi.fn() }))
    vi.stubGlobal('CustomEvent', class extends Event { detail: any; constructor(type: string, options: any = {}) { super(type); this.detail = options.detail } })
  })

  it('disables automatic page turning for a new installation', async () => {
    vi.resetModules()
    const { settingsManager } = await import('@/composables/useSetting')
    expect((await settingsManager.get()).tts?.autoTurnPage).toBe(false)
  })

  it('keeps EPUB book styles by default and merges saved override choices', async () => {
    vi.resetModules()
    const { settingsManager } = await import('@/composables/useSetting')
    const defaults = await settingsManager.get()
    expect(defaults.textSettings.overrideFontSize).toBe(false)
    expect(defaults.paragraphSettings.overrideLineHeight).toBe(false)
    storage.settings = { textSettings: { overrideAlignment: true, textAlign: 'left' }, paragraphSettings: { overrideIndent: true, textIndent: 1 } }
    const saved = await settingsManager.get()
    expect(saved.textSettings.overrideAlignment).toBe(true)
    expect(saved.textSettings.textAlign).toBe('left')
    expect(saved.textSettings.overrideFontSize).toBe(false)
    expect(saved.paragraphSettings.overrideIndent).toBe(true)
    expect(saved.paragraphSettings.textIndent).toBe(1)
    expect(saved.paragraphSettings.overrideLineHeight).toBe(false)
  })

  it('restores disabled overrides even after repeatedly editing fresh and reset settings', async () => {
    vi.resetModules()
    const { settingsManager, resetToDefaults } = await import('@/composables/useSetting')
    const settings = await settingsManager.get()
    settings.textSettings.overrideFontSize = true
    resetToDefaults(settings)
    expect(settings.textSettings.overrideFontSize).toBe(false)
    settings.paragraphSettings.overrideIndent = true
    resetToDefaults(settings)
    expect(settings.paragraphSettings.overrideIndent).toBe(false)
  })

  it('preserves a saved automatic page turning preference', async () => {
    storage.settings = { tts: { autoTurnPage: true } }
    vi.resetModules()
    const { settingsManager } = await import('@/composables/useSetting')
    expect((await settingsManager.get()).tts?.autoTurnPage).toBe(true)
  })

  it('defaults PDF scrolling to vertical and preserves a saved horizontal preference', async () => {
    vi.resetModules()
    const { settingsManager } = await import('@/composables/useSetting')
    expect((await settingsManager.get()).pdfScrollDirection).toBe('vertical')

    storage.settings = { pdfScrollDirection: 'horizontal' }
    vi.resetModules()
    const { settingsManager: savedSettingsManager } = await import('@/composables/useSetting')
    expect((await savedSettingsManager.get()).pdfScrollDirection).toBe('horizontal')
  })

  it('offers PDF scroll direction and normalizes missing values to vertical', async () => {
    vi.resetModules()
    const { PDF_SCROLL_DIRECTION_ITEM, getPdfScrollStrategy } = await import('@/composables/useSetting')

    expect(PDF_SCROLL_DIRECTION_ITEM.opts).toEqual(['vertical', 'horizontal'])
    expect(getPdfScrollStrategy()).toBe('vertical')
    expect(getPdfScrollStrategy('horizontal')).toBe('horizontal')
  })

  it('renders disabled setting-row actions as inert', async () => {
    vi.resetModules()
    const { SettingRows } = await import('@/composables/useSetting')
    const action = vi.fn()
    const render = (SettingRows as any).setup({ rows: [{ key: 'model', text: 'Kokoro', actionTitle: '下载', actionIcon: '#iconDownload', action, actionDisabled: true }] }, { emit: vi.fn(), slots: {} })
    const button = render()[0].children.at(-1)

    expect(button.props['aria-disabled']).toBe('true')
    button.props.onClick({ stopPropagation: vi.fn() })
    expect(action).not.toHaveBeenCalled()
  })

  it('owns TTS voice selection and favorite updates outside the Vue view', async () => {
    vi.resetModules()
    const { useTTSSettings } = await import('@/composables/useSetting')
    const state = ref({ tts: { voice: 'old', favoriteVoices: [] } }) as any
    const save = vi.fn()
    const tts = useTTSSettings(state, { i18n: {}, save, can: () => true, showUpgrade: vi.fn() })
    const voice = { name: 'en-US-Voice', displayName: 'Voice', locale: 'en-US' }

    tts.selectVoice(voice)
    tts.toggleFavorite(voice)

    expect(state.value.tts.voice).toBe(voice.name)
    expect(state.value.tts.favoriteVoices).toEqual([voice])
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('uses one official model-list link for every manually imported offline model', async () => {
    vi.resetModules()
    const { useTTSSettings } = await import('@/composables/useSetting')
    const tts = useTTSSettings(ref({ tts: { voice: 'old', favoriteVoices: [] } }) as any, { i18n: {}, save: vi.fn(), can: () => true, showUpgrade: vi.fn(), openArchiveImport: vi.fn(), openFolderImport: vi.fn() })
    const links = tts.offlineRows.value.flatMap((item: any) => item.actions || []).filter((action: any) => action.title === '打开官网模型列表')

    links[0].onClick()

    expect(links).toHaveLength(1)
    expect(window.open).toHaveBeenCalledWith('https://example.com/tts-models', '_blank', 'noopener')
  })

  it('imports local models instead of downloading pinned archives', async () => {
    vi.resetModules()
    const { useTTSSettings } = await import('@/composables/useSetting')
    const openArchiveImport = vi.fn(), openFolderImport = vi.fn()
    const tts = useTTSSettings(ref({ tts: { voice: 'old', favoriteVoices: [] } }) as any, { i18n: {}, save: vi.fn(), can: () => true, showUpgrade: vi.fn(), openArchiveImport, openFolderImport })
    await tts.loadOffline()
    const rows = tts.offlineRows.value
    const kokoro = rows.find((item: any) => item.key === 'import-kokoro')
    const piper = rows.find((item: any) => item.key === 'import-piper')

    expect(kokoro.actionTitle).toBe('导入模型包')
    expect(piper.actionTitle).toBe('导入文件夹')
    kokoro.action()
    piper.action()
    expect(openArchiveImport).toHaveBeenCalledOnce()
    expect(openFolderImport).toHaveBeenCalledOnce()
  })

  it('shows Kokoro and Piper import actions before loading installed models', async () => {
    vi.resetModules()
    const { useTTSSettings } = await import('@/composables/useSetting')
    const tts = useTTSSettings(ref({ tts: { voice: 'old', favoriteVoices: [] } }) as any, { i18n: {}, save: vi.fn(), can: () => true, showUpgrade: vi.fn(), openArchiveImport: vi.fn(), openFolderImport: vi.fn() })
    const rows = tts.offlineRows.value

    expect(rows.find((item: any) => item.key === 'import-kokoro')?.actionTitle).toBe('导入模型包')
    expect(rows.find((item: any) => item.key === 'import-piper')?.actionTitle).toBe('导入文件夹')
  })
})
