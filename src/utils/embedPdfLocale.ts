export type EmbedPdfLocale = 'en' | 'es' | 'nl' | 'de' | 'fr' | 'zh-CN' | 'zh-TW' | 'ja' | 'sv' | 'pt-BR'

const localeByLanguage: Array<[RegExp, EmbedPdfLocale]> = [
  [/^en(?:[-_]|$)/i, 'en'],
  [/^es(?:[-_]|$)/i, 'es'],
  [/^nl(?:[-_]|$)/i, 'nl'],
  [/^de(?:[-_]|$)/i, 'de'],
  [/^fr(?:[-_]|$)/i, 'fr'],
  [/^zh[-_]?(?:tw|cht)(?:[-_]|$)/i, 'zh-TW'],
  [/^zh(?:[-_]|$)/i, 'zh-CN'],
  [/^ja(?:[-_]|$)/i, 'ja'],
  [/^sv(?:[-_]|$)/i, 'sv'],
  [/^pt[-_]br(?:[-_]|$)/i, 'pt-BR'],
]

export const embedPdfLocale = (language = '', pluginName = ''): EmbedPdfLocale => {
  const match = localeByLanguage.find(([pattern]) => pattern.test(language.trim()))
  return match?.[1] || (pluginName === 'SiReader' ? 'en' : 'zh-CN')
}
