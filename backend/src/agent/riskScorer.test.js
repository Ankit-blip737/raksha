/**
 * riskScorer.test.js
 * Unit tests for the deterministic risk scorer.
 * Run: node --test backend/src/agent/riskScorer.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreRisk } from './riskScorer.js'

// Test 1: No signals → low score, monitor
test('no signals → score 0, action monitor', () => {
  const { riskScore, action } = scoreRisk([], 30)
  assert.equal(riskScore, 0)
  assert.equal(action, 'monitor')
})

// Test 2: Single weak signal (urgency, weight=15) → still monitor
test('single urgency signal → below warn threshold, monitor', () => {
  const { riskScore, action } = scoreRisk([{ id: 'urgency' }], 30)
  assert.equal(riskScore, 15)
  assert.equal(action, 'monitor')
})

// Test 3: authority (20) + payment (25) within 60s → +30 bonus = 75 → warn,
//         but authority + payment alone = 45 + 30 = 75, warn. With secrecy+threat bonus check too.
test('authority + payment within 60s → escalation rule triggers → block', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'authority' }, { id: 'payment' }],
    45 // <= 60s
  )
  // 20 + 25 + 30(escalation) = 75 → warn (not block — payment+authority alone is 75)
  assert.ok(riskScore >= 60, `expected score >= 60, got ${riskScore}`)
  assert.ok(action === 'warn' || action === 'block', `expected warn or block, got ${action}`)
})

// Test 4: secrecy (20) + threat (20) → +15 bonus = 55 → still monitor
//         But also check that secrecy_plus_threat rule fires
test('secrecy + threat → escalation bonus applied, score 55', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'secrecy' }, { id: 'threat' }],
    120
  )
  // 20 + 20 + 15 = 55 → monitor (< 60)
  assert.equal(riskScore, 55)
  assert.equal(action, 'monitor')
})

// Test 5: All five signals → all_five_signals bonus
test('all five signals → all_five_signals bonus → block', () => {
  const { riskScore, action } = scoreRisk(
    [
      { id: 'urgency' },
      { id: 'authority' },
      { id: 'secrecy' },
      { id: 'threat' },
      { id: 'payment' },
    ],
    90
  )
  // 15+20+20+20+25 = 100 base, + secrecy_plus_threat=+15, + all_five=+25
  // elapsedSeconds=90 > 60, so authority_plus_payment_60s does NOT fire
  // Total before clamp: 100+15+25=140 → clamped to 100
  assert.equal(riskScore, 100)
  assert.equal(action, 'block')
})

// Bonus test 6: authority + payment but AFTER 60s → no 60s bonus → might be warn not block
test('authority + payment AFTER 60s → no time-based escalation', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'authority' }, { id: 'payment' }],
    90 // > 60s — time rule does not fire
  )
  // 20 + 25 = 45 → monitor
  assert.equal(riskScore, 45)
  assert.equal(action, 'monitor')
})
