# CAREER-F3.1 - Regression matrix

| Area | Command / evidence | Result | Interpretation |
|---|---|---:|---|
| HRPG, Staff, CoachCareer, Home, Save V4, Match port | controlled 19-file command | 201/201 | PASS; no Career regression |
| F0B autonomy | `PlayableF0B.test.ts` | 4/4 | PASS; training, delegation, scouting and MatchEngine continuity |
| F1 arrival | `CareerF1Arrival.test.ts`, `PlayableF1.test.ts` | 20/20 | PASS; identity, briefing, meeting and arrival continuity |
| F2 Director Hub | `PlayableF2Mechanisms.test.ts`, `PlayableF2Attribution.test.ts`, `PlayableF2.test.ts` | 24/24 | PASS; training, tactics, attribution, Save V4 and multi-seed evidence |
| F3 Human Career | `PlayableF3HumanCareer.test.ts` | 3/3 | PASS; A/B/C 30 days and D club change |
| HRPG UI command | `DirectorHubPanel.test.tsx` | included above | PASS; click reaches canonical store command and Save V4 |
| TypeScript | `npm run typecheck` | PASS | clean project references |
| Frontend build | `npm run build` | PASS | existing chunk/circularity warnings only |
| Rust formatting | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS | no formatting drift |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` | PASS | native layer compiles |
| Determinism boundary | `rg 'Math\\.random\\(' src` | 0 | PASS |
| Domain/Engine boundary | UI imports scan | 0 | PASS |
| Global suite | single-worker `--bail=1` run | inconclusive | performance fixture reached; no final summary |
| Native Windows | Computer Use enumeration | pending | native pipe unavailable |

No F3.1 production code correction was required. The milestone closes evidence and integration debt without changing WorldDB or Career authorities.
