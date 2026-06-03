import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { Sidebar } from '../../src/components/layout/Sidebar'
import { useUiStore } from '../../src/stores/uiStore'

beforeEach(() => {
  useUiStore.setState({ activeTab: 'dashboard', theme: 'indigo', aiProvider: 'gemini', eventLogs: [] })
})

describe('Sidebar', () => {
  it('renders all nav items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('clicking Upload sets activeTab to upload', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByText('Upload'))
    expect(useUiStore.getState().activeTab).toBe('upload')
  })
})
