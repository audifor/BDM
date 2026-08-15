export const RMB_HOLD_THRESHOLD_MS = 300

export class RightMouseHoldController {
  private timer: ReturnType<typeof setTimeout> | undefined
  private held = false
  public constructor(private readonly onHold: () => void, private readonly onClick: () => void, private readonly thresholdMs = RMB_HOLD_THRESHOLD_MS) {}
  public pointerDown(button: number): void {
    if (button !== 2) return
    this.clear(); this.held = false
    this.timer = setTimeout(() => { this.timer = undefined; this.held = true; this.onHold() }, this.thresholdMs)
  }
  public pointerUp(button: number): void {
    if (button !== 2) return
    const held = this.held; this.clear(); this.held = false
    if (!held) this.onClick()
  }
  public cancel(): void { this.clear(); this.held = false }
  public dispose(): void { this.cancel() }
  private clear(): void { if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined } }
}
