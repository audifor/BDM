# Courtside fixed system bars · first multi-workspace preview

A safe opt-in prototype of the **shared**, fixed top and bottom Courtside bars now exists in this development branch. It reuses the single top SystemBar and bottom Taskbar already mounted by the NG shell; their React instances stay mounted when the central application changes.

## How to activate

Run the branch normally with `npm run tauri dev`, load any career, then append `&bdm-ui=1` to a URL that already has a query, or `?bdm-ui=1` otherwise. Keep that parameter while navigating between BDM workspaces. This query flag is **preview-only**: it does not change default NG screens and does not write into GameWorld or Save.

With the flag off, HOME alone remains styled Courtside and other NG applications retain their existing chrome. With the flag on, all currently mounted NG workspaces share the Courtside-looking bars, without restyling their own internal pages.

This is not the final BDM UI shell; no Legacy/NG removal, no UI global default, no change to app routing. The Start menu is the current NG Start menu, deliberately unchanged until the next design review. Pinning/reorder full Courtside parity remains pending.

## HOME V2

The CSS in `courtside-home.css` positions fixtures across the two right columns, Dynamics across rows 2 and 3, Upcoming top right, Finances below Upcoming, Leaders (only four) bottom center, Objectives bottom right, standings full height left. This desktop composition requires a visual screenshot at 1920 × 1080 for certification.

## Validation

`npm run typecheck`, `npm run build`, focused HOME tests. The previous test expected six preseason roster rows, which contradicted the approved four-leader contract and was updated.
