export type TaskComplexity = 'simple' | 'medium' | 'complex'

const COMPLEX_KEYWORDS = [
  '전략', '방향', '결정', '선택', '어떤게', '어느게', '어느 쪽',
  '비교', '차이', '장단점', 'pros', 'cons', '추천', '제안',
  '아키텍처', '설계', '구조 설계', '로드맵', '상용화',
  '진단', '기질', '회복탄력성', '조직진단', '창업자', '리포트',
  '데이터', '통계', '지표', '기관', '라이선스', '교육', '자격증',
  '리스크', '핵심', '중요도', '최선', '최적', '최고',
  '어떻게 해야', '어떻게 하는 게', '뭐가 나아',
]

const SIMPLE_PATTERNS: RegExp[] = [
  /^.{1,40}\?$/,
  /^(안녕|hi|hello|테스트|test)/i,
  /^(번역|translate)/i,
  /^(요약|summarize)/i,
  /^(설명|explain)\s+.{1,30}$/i,
]

export function classifyComplexity(message: string): TaskComplexity {
  const trimmed = message.trim()
  const lower = trimmed.toLowerCase()
  const len = trimmed.length

  if (trimmed.includes('@복잡')) return 'complex'
  if (trimmed.includes('@간단')) return 'simple'

  if (len < 25 || SIMPLE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'simple'
  }

  const complexHits = COMPLEX_KEYWORDS.filter((keyword) => lower.includes(keyword)).length

  if (complexHits >= 2 || len > 300) return 'complex'
  if (complexHits >= 1 || len > 100) return 'medium'

  return 'simple'
}
