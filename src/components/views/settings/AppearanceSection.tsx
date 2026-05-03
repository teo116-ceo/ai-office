import type { FontFamily, FontSize, ThemeMode } from '@/types'
import { THEME_PRESETS } from '@/utils/themePresets'
import { OptionRow, SectionCard } from './SettingsPrimitives'

const FONT_OPTIONS: Array<{ id: FontFamily; label: string; preview: string; style: string }> = [
  { id: 'system', label: '시스템 기본', preview: 'Aa 가나다', style: "'Segoe UI', sans-serif" },
  { id: 'noto-sans-kr', label: 'Noto Sans KR', preview: 'Aa 가나다', style: "'Noto Sans KR', sans-serif" },
  { id: 'ibm-plex-sans-kr', label: 'IBM Plex Sans', preview: 'Aa 가나다', style: "'IBM Plex Sans KR', sans-serif" },
  { id: 'gowun-dodum', label: '고운돋움', preview: 'Aa 가나다', style: "'Gowun Dodum', sans-serif" },
  { id: 'press-start-2p', label: 'Pixel', preview: 'Aa ABC', style: "'Press Start 2P', monospace" },
]

const SIZE_OPTIONS: Array<{ id: FontSize; label: string; textClass: string }> = [
  { id: 'small', label: '작게', textClass: 'text-xs' },
  { id: 'medium', label: '보통', textClass: 'text-sm' },
  { id: 'large', label: '크게', textClass: 'text-base' },
  { id: 'xlarge', label: '아주 크게', textClass: 'text-lg' },
]

interface Props {
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  fontFamily: FontFamily
  setFontFamily: (font: FontFamily) => void
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
}

export default function AppearanceSection({
  themeMode,
  setThemeMode,
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
}: Props) {
  const activeTheme = THEME_PRESETS.find((preset) => preset.id === themeMode) ?? THEME_PRESETS[0]

  return (
    <SectionCard
      title="화면 스타일"
      description="테마, 글꼴, 글자 크기를 앱 전체에 맞게 조정합니다."
    >
      <OptionRow
        label="테마"
        description={`현재 선택: ${activeTheme.label}`}
        actions={
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setThemeMode(preset.id)}
                className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                  themeMode === preset.id
                    ? 'border-office-active bg-office-active/15'
                    : 'border-office-panel/70 bg-office-panel hover:border-office-active'
                }`}
              >
                <div className="flex items-center gap-2">
                  {preset.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="h-4 w-4 rounded-full border border-black/5"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
                <p
                  className={`mt-3 text-sm font-semibold ${
                    themeMode === preset.id ? 'text-office-active' : 'text-white'
                  }`}
                >
                  {preset.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-office-text/60">{preset.description}</p>
              </button>
            ))}
          </div>
        }
      />

      <OptionRow
        label="글꼴"
        description="앱 전체에 적용되는 기본 글꼴입니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {FONT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFontFamily(option.id)}
                title={option.label}
                className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-colors ${
                  fontFamily === option.id
                    ? 'border-office-active bg-office-active/20 text-office-active'
                    : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                }`}
              >
                <span className="text-base leading-none" style={{ fontFamily: option.style }}>
                  {option.preview}
                </span>
                <span className="text-[10px] opacity-70">{option.label}</span>
              </button>
            ))}
          </div>
        }
      />

      <OptionRow
        label="글자 크기"
        description="앱 전체 텍스트 크기를 조절합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {SIZE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFontSize(option.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-4 py-2 transition-colors ${
                  fontSize === option.id
                    ? 'border-office-active bg-office-active/20 text-office-active'
                    : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                }`}
              >
                <span className={`${option.textClass} font-semibold leading-none`}>가</span>
                <span className="text-[10px] opacity-70">{option.label}</span>
              </button>
            ))}
          </div>
        }
      />
    </SectionCard>
  )
}
