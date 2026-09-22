# Design QA — Apple-style visual refresh

## Comparison target and evidence

- Source visual truth: `/Users/mfcheer/.codex/generated_images/01a062b1-92c2-7201-89de-2919c8c63072/exec-fb05850d-1552-4307-80f5-d1f2892a8b68.png`.
- Source dimensions: `1495 × 1058` pixels.
- Desktop implementation: `output/playwright/apple-desktop.png`, rendered at `1440 × 1024` CSS pixels, device scale factor `1`.
- Desktop comparison: `output/playwright/apple-design-comparison.png`. The implementation was normalized to `1495 × 1058` before side-by-side review.
- State: sample trip “东北大环线（示例）”, workspace view, “第1天” selected, right map in “跟随日期” state.
- Mobile implementation: `output/playwright/apple-mobile.png`, `360 × 732` CSS pixels, and settings page `output/playwright/apple-mobile-settings.png` at the same size.

## Findings

- No actionable P0, P1, or P2 visual issues remain.
- [P3] The live OpenStreetMap tile imagery is necessarily more detailed than the illustrative map in the source concept. The content, line/label contrast, and control hierarchy remain legible and are intentionally kept provider-driven.

## Required fidelity surfaces

- **Fonts and typography:** System-first font stack uses the platform SF/PingFang family; title, list-row, metadata, and compact control hierarchy match the reference’s restrained optical weight. Mobile inputs retain the existing 16px protection against iOS zoom.
- **Spacing and layout rhythm:** The fixed top bar plus existing left / center / right workspace proportions are preserved. List rows, quiet separators, 10–12px control radii, and reduced elevation align with the approved reference without sacrificing dense itinerary editing.
- **Colors and visual tokens:** Canvas changed to cool `#f5f5f7`; graphite text, pale blue selection/action states, and coral-only route/warning semantics are applied globally. Decorative gradients and dark primary-action treatment were removed.
- **Image quality and assets:** Existing polar-bear product mark remains intact. Live map tiles and map data continue to come from the configured map provider; no raster placeholder was introduced.
- **Copy and content:** Existing TripNote travel, planning, map, export, settings, backup, and mobile labels remain unchanged, preserving user familiarity.

## Responsive and interaction checks

- Desktop workspace loaded in Chromium at `1440 × 1024` and presents the revised three-column surface without clipping.
- Mobile itinerary loaded at `360 × 732`; top header, horizontal date rail, map controls, timeline, and fixed action dock remain visible and separated.
- Mobile settings was opened through the settings control and visually checked at `360 × 732`; settings sections, backup actions, and map configuration entry retain the new material hierarchy.
- Production build passed with `npm run build`; `git diff --check` passed. Browser console showed only the React DevTools development notice, with no application errors.

## Comparison history

1. **Initial implementation:** Global cool-gray/blue token refresh, material top bars, lightweight dividers, modal shell, settings surface, mobile day rail/dock, wishlist surfaces, and map controls were applied.
2. **Review result:** Desktop comparison found no major structural mismatch because the approved target explicitly preserves the existing three-column layout. Mobile and settings screenshots confirmed the same hierarchy was carried into responsive and subpage contexts.

## Follow-up polish

- If a future custom map skin is introduced, its road-label density can be tuned to more closely resemble the calm illustrative map treatment.

final result: passed
