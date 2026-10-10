# Workspace controls refinement

## Scope

- Fix single-choice native pickers whose inherited block layout wrapped the picker icon. Base-select controls now use an explicit nonwrapping flex row and an anchored icon with an opaque trailing area, so long selected labels cannot hide it. Multiple selects keep their existing behavior. Catalog sort and apply controls stack at 320px for readable labels.
- Add shared native scrollbar styling, light/dark colors, stable page gutter and smooth anchor navigation. Wheel, touch and keyboard scrolling remain browser controlled. Reduced motion disables smooth scrolling; assistant conversation scrolling retains its existing behavior.
- Expose saved models directly from the desktop header, mobile navigation and account sidebar. Add comparison and reservation shortcuts to the account sidebar using existing routes and authorization. Compact localized mobile labels retain full accessible names.
- Improve date/time control geometry and the existing marketing schedule editor with a readable localized timestamp, device time zone explanation and explicit clear action. Clear uses the existing undefined schedule behavior; saving and publishing still require their original actions. Invalid intermediate date input no longer reaches `toISOString()`.

The phrase "UI schedule" was ambiguous. A clarification was requested; the initial implementation targets existing date/time controls and marketing scheduling. It does not introduce a new scheduling subsystem or change business timing rules.

## Verification

- TypeScript `tsc --noEmit`: passed.
- Final Docker production build: passed; Next compilation reported 31.7 seconds. Existing lint and webpack cache warnings remain.
- Installed Chrome aggregate acceptance: **51/51 passed in 3.7 minutes**, one worker, no retries. It covers account/session, admin navigation, catalog controls, service intake, hero interactions and the twelve new workspace-control cases. No retained business records are reset. Browser schedule tests edit drafts in memory without saving or publishing.
- Intermediate acceptance uncovered a test fixture error: the service request form must be opened before querying its select. The initial aggregate run was stopped after 39 passing regressions and three fixture failures. After correcting the opening step, all ten targeted checks passed. Screenshot review then found that very long selected text could still obscure the icon and 320px navigation labels were too tall. Both were refined before the final build and acceptance run.

No scrolling package or runtime scroll interception is added. The shared scrollbar and control styles use native CSS; the system date/time picker and existing publishing confirmation flow remain intact. Chromium is tested directly; fallback native select styling remains available for browsers without base-select, but those engines have not been visually verified in this increment.

Post-suite screenshot review found that the opened picker's individual rotation changed the direction of its transform-based centering offset. The final CSS uses individual translation and clears the transform, keeping the icon centered during rotation. After the final rebuild, **19/19 affected catalog, picker, navigation and schedule checks passed in 1.2 minutes**, without retries. Screenshots disable animations to show the settled state.

Reviewed screenshots in `.artifacts/model-universe/workspace-controls/` include long-label service pickers at 320/390/768/1440px and light/dark marketing controls at 390/1440px in both languages. The final 320px opened picker keeps the arrow centered and visible; mobile navigation labels fit on one row. The web remains running at `http://localhost:6050`. Logs use the `workspace-controls-picker-*` prefix for the final image and affected checks, and `workspace-controls-accessible-browser.log` for the 51-case aggregate. Existing financial-policy and external-provider release gates are unaffected; these results do not certify the entire platform for production.
