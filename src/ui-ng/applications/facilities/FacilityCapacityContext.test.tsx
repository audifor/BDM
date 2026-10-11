// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { acceptedYouthTrainingFixture } from '@/app/youth/testFixtures'
import { FacilityCapacityContext } from './FacilityCapacityContext'

afterEach(cleanup)
it('shows canonical intervals and honest unknown demand without offering an allocation command', () => {
  const f = acceptedYouthTrainingFixture()
  render(<FacilityCapacityContext world={f.world} teamId={f.youth.id} />)
  expect(screen.getByText(/Nominal capacity alone does not verify/)).toBeInTheDocument()
  expect(screen.getByText(/nominal capacity unknown; unit unknown/)).toBeInTheDocument()
  expect(screen.getByText(/t:training/)).toHaveTextContent(`${f.date} 10:00, 60 minutes`)
  expect(screen.getByText(/Training venues require explicit confirmation/)).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
