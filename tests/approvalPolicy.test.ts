import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateApprovalReasons, DEFAULT_APPROVAL_POLICIES } from '../src/services/approvalPolicy'

test('external communication requests require approval', () => {
  const reasons = evaluateApprovalReasons({
    userMessage: '고객에게 답장 메일 보내고 파트너 공지문 초안도 작성해줘.',
    approvalRequired: false,
    approvalPolicies: DEFAULT_APPROVAL_POLICIES,
  })

  assert.deepEqual(reasons.map((reason) => reason.id), ['externalCommunication'])
})

test('pricing and schedule commitments can both be flagged', () => {
  const reasons = evaluateApprovalReasons({
    userMessage: '이번 리드에게 견적 제안서 보내고 다음 주 데모 일정도 확정해줘.',
    approvalRequired: false,
    approvalPolicies: DEFAULT_APPROVAL_POLICIES,
  })

  assert.deepEqual(reasons.map((reason) => reason.id), ['externalCommunication', 'pricingCommitment', 'scheduleCommitment'])
})

test('global approval setting always adds allTasks reason', () => {
  const reasons = evaluateApprovalReasons({
    userMessage: '오늘 회의 내용 요약해줘.',
    approvalRequired: true,
    approvalPolicies: DEFAULT_APPROVAL_POLICIES,
  })

  assert.equal(reasons[0]?.id, 'allTasks')
})

test('disabled approval policies do not add category reasons', () => {
  const reasons = evaluateApprovalReasons({
    userMessage: '계약서 초안 검토하고 고객에게 보내줘.',
    approvalRequired: false,
    approvalPolicies: {
      ...DEFAULT_APPROVAL_POLICIES,
      externalCommunication: false,
      legalCommitment: false,
    },
  })

  assert.deepEqual(reasons, [])
})
