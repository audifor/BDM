# MG7F Handoff Offensive Logic

Before MG7F, `HANDOFF` existed only in the `OffensiveAction` kind list. It had no receiver approach, ball transfer, or continuation.

`HANDOFF.initiatorId` is the giver and must match canonical `SpatialState.ball.owner` before completion. The other action participant is the receiver. Both must be distinct active teammates present in SpatialState; active screen, drive, transition, and participant cut conflicts invalidate the handoff.

During approach, MatchEngine uses MG6 base-spacing target overrides to hold the giver and move the receiver to the giver's current position. Transfer occurs at `1.25 m` or less. MG6 supplies the positions; `transferHandoffBall` validates the complete pair and then calls canonical `controlBallByPlayer`, so invalid input leaves the original SpatialState untouched.

The handoff remains the primary action while approaching and through the transfer step. The original giver remains `initiatorId`; after transfer, `SpatialState.ball.owner` is the receiver and drives the next handler and matchup. The next step selects DRIVE, SHOT, PASS, or RESET using existing receiver tendencies. Drive reuses `DriveIntent` and MG6 movement; shot and pass continue through existing resolution. If no option is available, the action clears and normal offense resumes. No transfer rollback occurs after completion.

No P&R intent or screen is created. A third-player MG7E off-ball cut can coexist with the handoff. Choices use the canonical decision RNG. Live and Instant continue to share MatchEngine.

No handoff tendency currently exists, so MG7F adds none; the runtime consumes an already active canonical HANDOFF action. No PlayerTruth, tactical fields, events, stats, or renderer behavior changed.

Known limits: no team action that initiates handoffs, Chicago/Zoom/Pistol systems, keeper/reject/slip/re-screen behavior, giver continuation, or specialized DHO defensive reads.

Focused `MatchSession.test.ts` cases cover near transfer, invalid receiver atomicity, distant approach, MG7E coexistence, and receiver drive/shot continuation. Typecheck is run once because the MatchEngine module exports a new runtime contract. Build and full suites are skipped per MG7F scope.

**MG7F result: PASS.**
