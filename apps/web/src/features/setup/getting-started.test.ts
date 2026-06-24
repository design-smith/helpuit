import { describe, it, expect } from 'vitest'
import {
  GETTING_STARTED_STEPS,
  loadState,
  serializeState,
  toggleStep,
  dismiss,
  completedCount,
  type GettingStartedState,
} from './getting-started.js'

describe('getting-started state', () => {
  it('defaults to nothing done and not dismissed when storage is empty or junk', () => {
    expect(loadState(null)).toEqual({ done: {}, dismissed: false })
    expect(loadState('')).toEqual({ done: {}, dismissed: false })
    expect(loadState('not json{')).toEqual({ done: {}, dismissed: false })
  })

  it('only treats dismissed as a real boolean true (ignores garbage shapes)', () => {
    expect(loadState(JSON.stringify({ dismissed: 'yes', done: 5 }))).toEqual({ done: {}, dismissed: false })
  })

  it('round-trips through serialize/load', () => {
    const state: GettingStartedState = { done: { github: true, llm: true }, dismissed: false }
    expect(loadState(serializeState(state))).toEqual(state)
  })

  it('toggleStep flips a single step without mutating the input', () => {
    const before: GettingStartedState = { done: {}, dismissed: false }
    const after = toggleStep(before, 'github')
    expect(after.done.github).toBe(true)
    expect(before.done.github).toBeUndefined() // immutable
    expect(toggleStep(after, 'github').done.github).toBe(false) // toggles back
  })

  it('dismiss sets dismissed true without mutating the input', () => {
    const before: GettingStartedState = { done: { github: true }, dismissed: false }
    const after = dismiss(before)
    expect(after.dismissed).toBe(true)
    expect(after.done).toEqual({ github: true }) // preserves checked state
    expect(before.dismissed).toBe(false) // immutable
  })

  it('completedCount counts only known steps that are done', () => {
    expect(completedCount({ done: {}, dismissed: false })).toBe(0)
    const ids = GETTING_STARTED_STEPS.map((s) => s.id)
    const allDone = { done: Object.fromEntries(ids.map((id) => [id, true])), dismissed: false }
    expect(completedCount(allDone)).toBe(GETTING_STARTED_STEPS.length)
    // an unknown done key doesn't inflate the count
    expect(completedCount({ done: { bogus: true }, dismissed: false })).toBe(0)
  })
})
