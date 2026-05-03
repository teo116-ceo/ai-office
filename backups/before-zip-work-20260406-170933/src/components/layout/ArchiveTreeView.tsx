import { useState } from 'react'
import type { ArchiveEntry, ArchiveSummary } from '@/types'
import { formatFileSize } from '@/services/fileContext'

// ─── 트리 노드 타입 ────────────────────────────────────────────────────────────
interface TreeNode {
  name: string
  fullPath: string
  isDir: boolean
  children: Map<string, TreeNode>
  entry?: ArchiveEntry
}

function buildTree(entries: ArchiveEntry[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', isDir: true, children: new Map() }

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean)
    let node = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const fullPath = parts.slice(0, i + 1).join('/')

      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          fullPath,
          isDir: !isLast,
          children: new Map(),
          entry: isLast ? entry : undefined,
        })
      }

      const child = node.children.get(part)!
      if (isLast) {
        child.entry = entry
        child.isDir = false
      }
      node = child
    }
  }

  return root
}

// ─── 개별 노드 ─────────────────────────────────────────────────────────────────
function TreeNodeRow({
  node,
  depth,
  accent,
}: {
  node: TreeNode
  depth: number
  accent: string
}) {
  const [open, setOpen] = useState(depth < 2)
  const [excerptOpen, setExcerptOpen] = useState(false)
  const hasChildren = node.children.size > 0
  const entry = node.entry

  const kindColor = entry?.kind === 'text' ? '#64ffda' : '#8d99ae'
  const icon = node.isDir ? (open ? '▾' : '▸') : (entry?.kind === 'text' ? '≡' : '○')

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded px-1 py-[2px] text-[11px] transition-colors hover:bg-white/5"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {/* 폴더 토글 or 파일 아이콘 */}
        <button
          type="button"
          className="w-3 shrink-0 text-center text-[10px]"
          style={{ color: node.isDir ? accent : kindColor }}
          onClick={() => node.isDir && setOpen((v) => !v)}
        >
          {icon}
        </button>

        {/* 이름 */}
        <span
          className="min-w-0 flex-1 truncate"
          style={{ color: node.isDir ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.65)' }}
        >
          {node.name}
        </span>

        {/* 크기 + 발췌 버튼 */}
        {entry && (
          <span className="ml-1 shrink-0 text-[10px] text-white/30">
            {formatFileSize(entry.size)}
          </span>
        )}
        {entry?.excerpt && (
          <button
            type="button"
            className="ml-1 shrink-0 rounded border border-white/10 px-1 text-[9px] text-white/40 transition-colors hover:border-white/25 hover:text-white/70"
            onClick={() => setExcerptOpen((v) => !v)}
          >
            {excerptOpen ? '닫기' : '내용'}
          </button>
        )}
      </div>

      {/* 발췌 내용 */}
      {excerptOpen && entry?.excerpt && (
        <div
          className="mx-2 mb-1 overflow-x-auto rounded border border-white/10 bg-black/30 p-2 text-[10px] leading-relaxed"
          style={{ paddingLeft: `${depth * 12 + 16}px` }}
        >
          <pre className="whitespace-pre-wrap break-all text-white/60">{entry.excerpt}</pre>
          {entry.truncated && (
            <p className="mt-1 text-[9px] text-white/30">— 파일이 길어 일부만 표시됨</p>
          )}
        </div>
      )}

      {/* 자식 노드 */}
      {node.isDir && open && hasChildren && (
        <div>
          {Array.from(node.children.values())
            .sort((a, b) => {
              // 폴더 먼저, 그 다음 이름순
              if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map((child) => (
              <TreeNodeRow key={child.fullPath} node={child} depth={depth + 1} accent={accent} />
            ))}
        </div>
      )}
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ArchiveTreeView({
  archive,
  accent = '#64ffda',
}: {
  archive: ArchiveSummary
  accent?: string
}) {
  const [treeOpen, setTreeOpen] = useState(false)
  const tree = buildTree(archive.entries)
  const topNodes = Array.from(tree.children.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const textCount = archive.entries.filter((e) => e.kind === 'text').length
  const binaryCount = archive.entries.filter((e) => e.kind === 'binary').length

  return (
    <div className="mt-2">
      {/* 헤더 토글 */}
      <button
        type="button"
        onClick={() => setTreeOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[11px] transition-colors hover:border-white/20 hover:bg-white/5"
      >
        <span style={{ color: accent }}>{treeOpen ? '▾' : '▸'}</span>
        <span className="font-semibold text-white/80">파일 구조 트리</span>
        <span className="ml-auto text-white/35">
          {archive.directoryCount}폴더 · 텍스트 {textCount} · 바이너리 {binaryCount}
        </span>
      </button>

      {/* 트리 본문 */}
      {treeOpen && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded border border-white/10 bg-black/20 py-1">
          {topNodes.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-white/40">항목 없음</p>
          ) : (
            topNodes.map((node) => (
              <TreeNodeRow key={node.fullPath} node={node} depth={0} accent={accent} />
            ))
          )}

          {archive.entryCount > archive.entries.length && (
            <p className="px-3 py-1 text-[10px] text-white/30">
              + 나머지 {archive.entryCount - archive.entries.length}개 항목 생략됨
            </p>
          )}
        </div>
      )}
    </div>
  )
}
