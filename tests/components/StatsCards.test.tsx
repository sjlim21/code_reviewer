import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatsCards } from '../../src/components/dashboard/StatsCards'

describe('StatsCards', () => {
  it('renders all 4 severity counts', () => {
    render(<StatsCards critical={3} high={7} medium={12} low={5} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
