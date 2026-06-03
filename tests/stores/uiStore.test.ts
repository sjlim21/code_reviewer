import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../../src/stores/uiStore'
import { act } from '@testing-library/react'

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'dashboard',
    theme: 'indigo',
    aiProvider: 'gemini',
    eventLogs: [],
  })
})

describe('uiStore', () => {
  it('setActiveTab updates tab', () => {
    act(() => useUiStore.getState().setActiveTab('upload'))
    expect(useUiStore.getState().activeTab).toBe('upload')
  })

  it('setTheme updates theme', () => {
    act(() => useUiStore.getState().setTheme('emerald'))
    expect(useUiStore.getState().theme).toBe('emerald')
  })

  it('addEventLog keeps max 100 entries', () => {
    act(() => {
      for (let i = 0; i < 105; i++) {
        useUiStore.getState().addEventLog({ message: `event ${i}`, type: 'info', timestamp: Date.now() })
      }
    })
    expect(useUiStore.getState().eventLogs).toHaveLength(100)
  })

  it('setTheme persists to localStorage', () => {
    act(() => useUiStore.getState().setTheme('emerald'))
    expect(localStorage.getItem('codeeye-theme')).toBe('emerald')
  })

  it('setAiProvider persists to localStorage', () => {
    act(() => useUiStore.getState().setAiProvider('claude'))
    expect(localStorage.getItem('codeeye-ai-provider')).toBe('claude')
  })
})
