# Design QA — Quiet Workspace redesign

## Comparison target and evidence

- Source visual truth: `/Users/mfcheer/.codex/generated_images/01a062b1-92c2-7201-89de-2919c8c63072/exec-af910f45-2457-48eb-be42-3f8a3555635d.png`.
- Source dimensions: `1495 × 1058` pixels.
- Desktop implementation: `output/playwright/apple-workspace-v2.png`, captured at `1440 × 1024` CSS pixels, device scale factor `1`.
- Full-view comparison: `output/playwright/apple-workspace-v2-comparison.png`. Both images were normalized to `720 × 512` before horizontal comparison.
- Mobile implementation: `output/playwright/apple-workspace-v2-mobile.png`, captured at `390 × 844` CSS pixels, device scale factor `1`.
- Secondary-surface desktop evidence: `output/playwright/quiet-polish-settings.png`, captured at `1440 × 1024` CSS pixels.
- Secondary-surface mobile evidence: `output/playwright/quiet-polish-mobile.png`, captured at `390 × 844` CSS pixels.
- State: sample trip “东北大环线（示例）”; desktop shows all itinerary days with the map following the active day. Mobile shows 第 3 天 with the itinerary map expanded.

## Findings

- No actionable P0, P1, or P2 differences remain for the selected “Quiet Workspace” concept.
- [P3] The live OpenStreetMap canvas has denser road labels and a different crop from the illustrative map in the source. This is provider-driven and intentionally retained so live map interaction remains useful.

## Required fidelity surfaces

- **Fonts and typography:** Platform system font stack remains in use. The implementation reduces visual noise through a stronger day-title hierarchy, restrained metadata colors, and compact toolbar text. Chinese text remains readable at desktop and mobile sizes.
- **Spacing and layout rhythm:** The implementation now uses a 62px light toolbar and 8px exterior gutters around three 18px-radius workspace surfaces. The left library, central itinerary, and map retain the target’s continuous column rhythm; resize handles are visually quiet until interaction.
- **Colors and visual tokens:** The canvas is a near-neutral cool gray; surfaces are translucent white; selection/action blue is desaturated; coral remains reserved for map routes and warnings. Heavy navy blocks and pronounced shadows are absent.
- **Image quality and asset fidelity:** Existing product polar-bear mark is retained. Live map tiles remain provider-generated; no placeholder imagery or reconstructed icon assets were introduced.
- **Copy and content:** Existing travel planning language, trip data, map controls, export, and budget actions remain functional and familiar. The current-trip region remains visible in the toolbar.

## Responsive and interaction checks

- Desktop loaded in Chromium at `1440 × 1024`; the three workspace panels, map controls, list rows, and itinerary remained visible without clipping.
- Mobile loaded at `390 × 844`; the day rail, map, itinerary, and bottom actions remained distinct and usable.
- Primary interactions checked: desktop render, responsive resize, map/date workspace render, and browser console review. No application errors were reported.
- `npm run build` and `git diff --check` passed.
- Follow-up polish check: the settings dialog keeps the same cool-white material and restrained separators as the workspace; the mobile itinerary remains legible at `390px` with no clipping or console errors. Exported itinerary cards now use the same cool-white / graphite palette, coral day progress, and the `TripNote` brand lockup.
- Map language follow-up: `output/playwright/maptiler-settings.png` verifies the new MapTiler-aware settings entry in the live application with no console errors. The MapTiler SDK and its CSS are deferred into their own chunks, so the default OSM first-load bundle remains unaffected. A missing MapTiler Key retains the existing OSM layer rather than blocking maps, routes, markers, or map picking.
- Timeline density follow-up: `output/playwright/timeline-no-period-desktop.png` and `output/playwright/timeline-no-period-mobile.png` verify that broad time-of-day labels are removed while each concrete activity time, route hint, and drag/drop structure remains readable.
- Export-card follow-up: a real browser export completed successfully as `.playwright-cli/东北大环线（示例）-行程.png`. The image adds an OpenStreetMap-backed full-route overview with a required attribution, date-gradient route points, and separate transit strips between adjacent itinerary items, while retaining the existing single continuous card format.
- Adaptive map follow-up: the export map automatically expands into a wide city-route overview for cross-city trips, labels only key stops, and switches to a higher-zoom local route map with start/end place labels when all itinerary points sit within 45 km. The real browser export completed successfully after loading base-map tiles.

## Comparison history

1. **Initial mismatch:** Existing workspace surfaces ran edge-to-edge, while the approved target uses three calm, independently readable workspace surfaces with subtle exterior breathing room.
   - **Fix:** Added shared workspace gutters, 18px panel radii, light panel borders, a taller material toolbar, and quiet resize separators.
2. **Initial mismatch:** The itinerary’s sticky date navigation visually spanned the full content edge instead of reading as an internal control strip.
   - **Fix:** Pulled the date navigation into the central content surface with a restrained material background and matching radius.
3. **Post-fix evidence:** `output/playwright/apple-workspace-v2-comparison.png` shows the selected visual’s proportions, calm surfaces, and route emphasis reproduced without reducing live planning density.

## Follow-up polish

- Consider an optional low-detail custom basemap in a later map-provider pass if the live OSM label density becomes distracting.

final result: passed
