import { describe, expect, it, vi } from 'vitest'

import { RightMouseHoldController } from './RightMouseHold'

describe('RightMouseHoldController', () => {
  it('distinguishes a short right click from a hold and cleans up cancellation', () => {
    vi.useFakeTimers()
    const hold = vi.fn(); const click = vi.fn()
    const controller = new RightMouseHoldController(hold, click, 300)
    controller.pointerDown(2); vi.advanceTimersByTime(299); controller.pointerUp(2)
    expect(click).toHaveBeenCalledTimes(1); expect(hold).not.toHaveBeenCalled()
    controller.pointerDown(2); vi.advanceTimersByTime(300); controller.pointerUp(2)
    expect(hold).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1)
    controller.pointerDown(2); controller.cancel(); vi.advanceTimersByTime(300)
    controller.pointerDown(0); vi.advanceTimersByTime(300)
    expect(hold).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1)
    controller.dispose(); vi.useRealTimers()
  })
})
