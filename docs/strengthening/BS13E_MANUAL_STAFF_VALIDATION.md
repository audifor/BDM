# BS13E · Manual Staff Validation

Status: **Awaiting visual validation.** Do not use devtools, logs, or save-file inspection.

## Before testing

1. Use a save with at least two Training-eligible Staff members, a healthy team roster, and a date without a fixture. Save a baseline before changing responsibility or workload.
2. In the main navigation, open **Staff**, then **Responsibilities**. Locate **Create team Training plan**. Choose **Delegated** and select the Staff holder shown in the row. Record the selected name.
3. In the **Training** app, open the **Staff** tab and note each eligible person’s role/proficiency and workload. Return to the team schedule.

## Test A · Strong Training Staff

1. Reload the baseline save.
2. In **Staff → Responsibilities**, set **Create team Training plan** to **Delegated** and assign the eligible person with the stronger relevant role evaluation. Keep other responsibility assignments unchanged.
3. In **Training → Equipo**, schedule a team session on the next available non-fixture date. Choose the same module and intensity you will use in Test B and C. Keep duration and participation settings fixed.
4. Open the session’s **Staff ejecutor** selector and choose the same executor you will use in the comparison runs. Save the session and advance one day.
5. In **Training → Completed sessions**, expand the completed session.

**Look at:** Planned and Effective lines, Plan Staff name/role/quality/workload, execution band, participants, and recorded development consequence.

**Expected:** The history identifies who planned and who executed the work, preserves their role, and shows planned versus effective module/intensity without a raw multiplier.

## Test B · Weaker Training Staff

1. Reload the same baseline save.
2. In **Staff → Responsibilities**, replace only the **Create team Training plan** holder with a different eligible Staff member whose relevant role evaluation is weaker. Keep the mode delegated.
3. Repeat Test A’s exact module, intensity, date offset, duration, participation, executor, and advance-day action.
4. Expand the completed session in **Training → Completed sessions**.

**Look at:** Plan Staff attribution, quality band, effective module/intensity, and participant development outcome.

**Expected:** The named planner changes. Where the seeded quality choice changes the effective plan or quality, the UI shows that difference directly. If both candidates produce the same effective plan, compare the visible quality and recorded stimulus summary; do not infer a difference that the records do not show.

## Test C · Overloaded Training Staff

1. Reload the same baseline save.
2. Keep the strong holder and session setup from Test A.
3. In **Staff → Responsibilities**, assign that same Staff member additional currently supported responsibilities using their existing eligible rows until the Staff workspace reports a high/overloaded workload. Do not change the Training holder.
4. Run the exact session from Test A and inspect its history.

**Look at:** The plan Staff row’s workload note and quality, then the effective plan and consequence.

**Expected:** If the decision-time workload snapshot is overloaded, the completed history says **high workload**. A quality/effective-plan change is visible only if the existing deterministic Training result changes for this save.

## Medical / advisory flow

1. Open **Medical** and select a roster player with an active injury eligible for a treatment or return-to-play recommendation. If no eligible injury exists, use a save that already contains one; do not fabricate an injury for this check.
2. Advance the game through the normal daily cycle until the recommendation appears, then open the recommendation detail.
3. Read Staff name, role, quality band, recommendation details, and current status.
4. Choose **Accept** or **Dismiss** using the visible action. Reopen the recommendation history and confirm the status.
5. If accepted, inspect the same player’s Medical state and confirm the change belongs to the existing Medical workflow. If dismissed, confirm the recommendation is marked dismissed and did not apply its proposed change.

## Staff person Recent Impact

1. Open **Staff**, choose the roster/person list, and open a Staff member who executed Training or produced an advisory in the last 30 in-game days.
2. On **Overview**, inspect **Recent impact · 30 days**.
3. Confirm the counts and latest entries match visible completed sessions/advisories and that role/result are readable. Confirm no overall performance score or cross-role ranking appears.

## Coach / Staff consistency

1. Open the Head Coach’s Staff person profile and note professional attribute values.
2. Open the Coach screen for that same person.
3. Confirm the same professional attributes match in both views.

## Opposition scouting consequence (additional check)

1. Use a save where the next opponent can receive an opposition scouting report and the **Opposition scouting** responsibility has an eligible advisory Staff holder.
2. Advance through the normal report generation cycle, then open **Staff → Advisory** and select the opposition report.
3. Confirm the Staff source/role, report quality band, recommendation, and **Pending/Informational** state are visible. Accept only if an acceptance action is offered.
4. Open **Tactics** for that game and verify the accepted defensive emphasis or pace adjustment appears in the existing Team Game Plan. Do not expect a live MatchEngine change.

## Record the result

The milestone can move from **TECH READY / AWAITING VISUAL VALIDATION** only after the user confirms the Training A/B comparison, Recent Impact inspection, and at least one Medical or opposition advisory flow in the UI.
