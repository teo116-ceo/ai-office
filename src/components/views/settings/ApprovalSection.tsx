import { APPROVAL_POLICY_HINTS, APPROVAL_POLICY_LABELS, APPROVAL_POLICY_ORDER } from '@/services/approvalPolicy'
import type { ApprovalPolicyId, ApprovalPolicySettings } from '@/types'
import { SectionCard, OptionRow, ToggleButton } from './SettingsPrimitives'

interface Props {
  approvalRequired: boolean
  approvalPolicies: ApprovalPolicySettings
  setApprovalRequired: (required: boolean) => void
  setApprovalPolicies: (policies: Partial<ApprovalPolicySettings>) => void
}

export default function ApprovalSection({
  approvalRequired,
  approvalPolicies,
  setApprovalRequired,
  setApprovalPolicies,
}: Props) {
  return (
    <SectionCard
      title="사전 승인 체계"
      description="AI 작업 결과를 즉시 완료 처리할지, 사람이 먼저 검토할지 정합니다."
    >
      <OptionRow
        label="전체 사전 검토"
        description={approvalRequired
          ? '모든 AI 업무 완료 시 승인 대기 상태로 전환됩니다.'
          : '비활성화 시 AI 업무는 바로 완료 처리됩니다.'}
        actions={
          <div className="flex gap-2">
            <ToggleButton active={approvalRequired} label="켜기" onClick={() => setApprovalRequired(true)} />
            <ToggleButton active={!approvalRequired} label="끄기" onClick={() => setApprovalRequired(false)} />
          </div>
        }
      />

      <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
        <p className="text-sm font-semibold text-white">고위험 업무별 승인</p>
        <p className="mt-1 text-xs text-office-text/60">
          대외 발신, 일정 확정, 결제, 계약처럼 직접적인 영향이 큰 업무만 별도로 걸러낼 수 있습니다.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {APPROVAL_POLICY_ORDER.map((policyId) => (
            <OptionRow
              key={policyId}
              label={APPROVAL_POLICY_LABELS[policyId as ApprovalPolicyId]}
              description={APPROVAL_POLICY_HINTS[policyId as ApprovalPolicyId]}
              actions={
                <div className="flex gap-2">
                  <ToggleButton
                    active={approvalPolicies[policyId as ApprovalPolicyId]}
                    label="켜기"
                    onClick={() => setApprovalPolicies({ [policyId]: true } as Partial<ApprovalPolicySettings>)}
                  />
                  <ToggleButton
                    active={!approvalPolicies[policyId as ApprovalPolicyId]}
                    label="끄기"
                    onClick={() => setApprovalPolicies({ [policyId]: false } as Partial<ApprovalPolicySettings>)}
                  />
                </div>
              }
            />
          ))}
        </div>
      </div>
    </SectionCard>
  )
}
