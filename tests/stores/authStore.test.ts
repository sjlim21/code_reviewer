import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../src/stores/authStore'
import { act } from '@testing-library/react'

beforeEach(() => {
  useAuthStore.setState({
    session: null,
    isDemoSession: false,
    userProfile: null,
  })
})

describe('authStore', () => {
  it('setSession updates session', () => {
    const mockSession = { user: { id: 'user-1', email: 'test@test.com' } } as any
    act(() => useAuthStore.getState().setSession(mockSession))
    expect(useAuthStore.getState().session).toEqual(mockSession)
  })

  it('setDemoSession sets isDemoSession true', () => {
    act(() => useAuthStore.getState().setDemoSession(true))
    expect(useAuthStore.getState().isDemoSession).toBe(true)
  })

  it('signOut clears session and demo flag', () => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as any, isDemoSession: true })
    act(() => useAuthStore.getState().signOut())
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().isDemoSession).toBe(false)
  })
})
