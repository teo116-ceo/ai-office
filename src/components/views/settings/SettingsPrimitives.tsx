import type { ReactNode } from 'react'

export function SectionCard({
  title,
  description,
  titleExtra,
  children,
}: {
  title: string
  description: string
  titleExtra?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">{title}</p>
        {titleExtra}
      </div>
      <p className="mt-2 text-sm text-office-text/60">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  )
}

export function OptionRow({
  label,
  description,
  actions,
}: {
  label: string
  description: string
  actions: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-1 text-xs text-office-text/60">{description}</p>
      </div>
      {actions}
    </div>
  )
}

export function ToggleButton({
  active,
  label,
  onClick,
  disabled = false,
  title,
}: {
  active: boolean
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? (label === '켜기' ? '이 기능을 켭니다' : label === '끄기' ? '이 기능을 끕니다' : label)}
      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
        active
          ? 'border-office-active bg-office-active/20 text-office-active'
          : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
      } ${disabled ? 'cursor-not-allowed opacity-50 hover:border-office-panel/70 hover:text-office-text' : ''}`}
    >
      {label}
    </button>
  )
}

export function UsageRow({
  label,
  value,
  emphasize = false,
}: {
  label: string
  value: string | ReactNode
  emphasize?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-office-text/60">{label}</span>
      <span className={emphasize ? 'text-office-active' : 'text-white'}>{value}</span>
    </div>
  )
}
