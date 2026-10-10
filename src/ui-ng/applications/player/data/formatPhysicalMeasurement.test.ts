import { describe, expect, it } from 'vitest'

import { formatPhysicalMeasurement } from './formatPhysicalMeasurement'

describe('formatPhysicalMeasurement', () => {
  it('rounds height, weight and wingspan to whole display units', () => {
    expect(formatPhysicalMeasurement({ status: 'available', value: '202.8 cm' })).toEqual({ value: '203', unit: 'cm' })
    expect(formatPhysicalMeasurement({ status: 'available', value: '55.72 kg' })).toEqual({ value: '56', unit: 'kg' })
    expect(formatPhysicalMeasurement({ status: 'available', value: '195.8 cm' })).toEqual({ value: '196', unit: 'cm' })
  })

  it('supports legacy localized numeric readings without altering the input', () => {
    const source = { status: 'available' as const, value: '182,2 cm' }
    expect(formatPhysicalMeasurement(source)).toEqual({ value: '182', unit: 'cm' })
    expect(source.value).toBe('182,2 cm')
  })

  it('keeps honest unavailable and nonnumeric readings', () => {
    expect(formatPhysicalMeasurement({ status: 'unavailable', label: 'Not tracked' })).toEqual({ value: 'Not tracked', unit: '' })
    expect(formatPhysicalMeasurement({ status: 'available', value: 'Unknown' })).toEqual({ value: 'Unknown', unit: '' })
  })
})
