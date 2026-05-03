import type {
  ApprovalPolicyId,
  ApprovalPolicySettings,
  TaskApprovalReason,
  UploadedFile,
} from '@/types'

interface ApprovalPolicyDefinition {
  id: ApprovalPolicyId
  label: string
  description: string
  keywords: string[]
}

const APPROVAL_POLICY_DEFINITIONS: ApprovalPolicyDefinition[] = [
  {
    id: 'externalCommunication',
    label: '외부 발신',
    description: '고객, 파트너, 투자자 등 외부 채널로 보내는 답장이나 공지는 검토 후 발신해야 합니다.',
    keywords: [
      'email', 'reply', 'customer', 'client', 'prospect', 'investor', 'partner', 'announcement',
      '메일', '이메일', '회신', '답장', '발신', '고객', '클라이언트', '리드', '수신자', '파트너', '공지',
    ],
  },
  {
    id: 'pricingCommitment',
    label: '가격·견적 확정',
    description: '가격, 견적, 제안서, 할인 조건은 승인 없이 확정하면 위험합니다.',
    keywords: [
      'pricing', 'price', 'quote', 'proposal', 'discount', 'package',
      '가격', '요금', '비용', '견적', '제안', '제안서', '할인', '플랜', '패키지',
    ],
  },
  {
    id: 'paymentExecution',
    label: '결제·송금',
    description: '결제, 송금, 청구, 정산, 비용 집행은 사용자가 직접 확인해야 합니다.',
    keywords: [
      'payment', 'invoice', 'billing', 'charge', 'wire', 'bank transfer', 'expense',
      '결제', '송금', '이체', '청구', '청구서', '세금계산서', '입금', '출금', '정산', '비용 집행',
    ],
  },
  {
    id: 'scheduleCommitment',
    label: '일정 확정',
    description: '미팅, 데모, 인터뷰, 납기 확정은 대외 일정과 약속에 직접 영향을 줍니다.',
    keywords: [
      'schedule', 'calendar', 'demo', 'appointment', 'book', 'interview',
      '일정', '캘린더', '데모', '인터뷰', '예약', '확정', '납기',
    ],
  },
  {
    id: 'legalCommitment',
    label: '계약·법무',
    description: '계약서 검토, NDA, 정책 문구는 법적 책임과 연결되므로 승인 검토가 필요합니다.',
    keywords: [
      'contract', 'agreement', 'nda', 'terms', 'privacy policy', 'msa', 'legal',
      '계약', '계약서', '서명', '법무', '법률', 'nda', '개인정보처리방침', '정책', '동의서',
    ],
  },
]

export const DEFAULT_APPROVAL_POLICIES: ApprovalPolicySettings = {
  externalCommunication: true,
  pricingCommitment: true,
  paymentExecution: true,
  scheduleCommitment: true,
  legalCommitment: true,
}

export const APPROVAL_POLICY_ORDER = APPROVAL_POLICY_DEFINITIONS.map((item) => item.id)

export const APPROVAL_POLICY_LABELS = APPROVAL_POLICY_DEFINITIONS.reduce<Record<ApprovalPolicyId, string>>(
  (accumulator, item) => {
    accumulator[item.id] = item.label
    return accumulator
  },
  {} as Record<ApprovalPolicyId, string>,
)

export const APPROVAL_POLICY_HINTS = APPROVAL_POLICY_DEFINITIONS.reduce<Record<ApprovalPolicyId, string>>(
  (accumulator, item) => {
    accumulator[item.id] = item.description
    return accumulator
  },
  {} as Record<ApprovalPolicyId, string>,
)

function buildApprovalSourceText(userMessage: string, attachments: UploadedFile[]) {
  return [
    userMessage,
    ...attachments.map((attachment) => `${attachment.name}\n${attachment.summary}\n${attachment.promptContext}`),
  ].join('\n').toLowerCase()
}

function hasKeywordMatch(sourceText: string, keywords: string[]) {
  return keywords.some((keyword) => sourceText.includes(keyword.toLowerCase()))
}

export function evaluateApprovalReasons({
  userMessage,
  attachments = [],
  approvalRequired,
  approvalPolicies,
}: {
  userMessage: string
  attachments?: UploadedFile[]
  approvalRequired: boolean
  approvalPolicies: ApprovalPolicySettings
}): TaskApprovalReason[] {
  const reasons: TaskApprovalReason[] = []

  if (approvalRequired) {
    reasons.push({
      id: 'allTasks',
      label: '전체 작업 사전 검토',
      description: '설정에서 모든 AI 작업 결과를 사전 승인 대상으로 지정했습니다.',
    })
  }

  const sourceText = buildApprovalSourceText(userMessage, attachments)

  for (const policy of APPROVAL_POLICY_DEFINITIONS) {
    if (!approvalPolicies[policy.id]) continue
    if (!hasKeywordMatch(sourceText, policy.keywords)) continue

    reasons.push({
      id: policy.id,
      label: policy.label,
      description: policy.description,
    })
  }

  return reasons
}

export function evaluateOutputApprovalReasons(
  aiOutput: string,
  approvalPolicies: ApprovalPolicySettings,
  existingReasons: TaskApprovalReason[],
): TaskApprovalReason[] {
  const existingIds = new Set(existingReasons.map((reason) => reason.id))
  const outputLower = aiOutput.toLowerCase()
  const added: TaskApprovalReason[] = []

  for (const policy of APPROVAL_POLICY_DEFINITIONS) {
    if (!approvalPolicies[policy.id]) continue
    if (existingIds.has(policy.id)) continue
    if (!hasKeywordMatch(outputLower, policy.keywords)) continue

    added.push({
      id: policy.id,
      label: `${policy.label} (AI 결과 감지)`,
      description: `AI 결과물에서 ${policy.label} 관련 표현이 감지되었습니다. 사전 검토 후 승인하세요.`,
    })
  }

  return added
}
