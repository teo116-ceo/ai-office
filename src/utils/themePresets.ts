import type { ThemeMode } from '@/types'

export type ThemePreset = {
  id: ThemeMode
  label: string
  description: string
  swatches: [string, string, string]
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark',
    label: '기본 다크',
    description: '짙은 남색 기반의 기본 오피스 테마',
    swatches: ['#0f172a', '#1e293b', '#64ffda'],
  },
  {
    id: 'pastel-sky',
    label: '스카이',
    description: '연한 하늘색과 크림 톤이 섞인 밝은 테마',
    swatches: ['#f4f7ff', '#dbeafe', '#7c9cff'],
  },
  {
    id: 'pastel-mint',
    label: '민트',
    description: '민트와 세이지가 섞인 차분한 테마',
    swatches: ['#f3fbf8', '#d7f3e8', '#67c7b3'],
  },
  {
    id: 'pastel-lavender',
    label: '라벤더',
    description: '라벤더와 블루베리 톤의 부드러운 집중 테마',
    swatches: ['#f7f4ff', '#e9ddff', '#8d7ae6'],
  },
  {
    id: 'pastel-peach',
    label: '피치',
    description: '복숭아와 살구 톤의 따뜻한 업무 테마',
    swatches: ['#fff7f2', '#ffe2d1', '#f39b7f'],
  },
  {
    id: 'pastel-pink',
    label: '핑크',
    description: '연한 핑크와 로즈 톤이 섞인 부드러운 테마',
    swatches: ['#fff5fa', '#ffd9e8', '#f29dbd'],
  },
]

export const THEME_PRESET_IDS = THEME_PRESETS.map((preset) => preset.id)

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value !== null && THEME_PRESET_IDS.includes(value as ThemeMode)
}

export function getNextThemeMode(current: ThemeMode): ThemeMode {
  const index = THEME_PRESET_IDS.indexOf(current)
  if (index === -1) {
    return THEME_PRESET_IDS[0]
  }

  return THEME_PRESET_IDS[(index + 1) % THEME_PRESET_IDS.length]
}

export function getThemePreset(mode: ThemeMode): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === mode) ?? THEME_PRESETS[0]
}
