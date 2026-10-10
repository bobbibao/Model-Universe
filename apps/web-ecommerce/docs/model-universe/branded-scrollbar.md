# Branded floating scrollbar

## Experience

The document uses a slim floating handle with a lavender/violet/cyan gradient, rounded ends and a restrained glow. It appears on edge hover, keyboard focus, dragging or native document scrolling, then fades after 1.1 seconds of inactivity. Hover expands the handle from 5px to 8px inside an 18px interaction rail. It occupies no document gutter and stays below application dialogs.

Nested panels retain their native scrollbar geometry with a transparent track and branded thumb. Their thumb appears on hover, focus or scrolling. This avoids replacing panel markup, intercepting wheel input or loading a scrolling library. Nested bars reserve their native thin width; the document handle is the true overlay.

Touch/coarse-pointer devices, forced-colors mode and the initial no-JavaScript page keep native scrolling. Reduced motion removes the handle's transitions. The overlay does not intercept wheel/touch or simulate inertia. Its drag and track-click actions update native document position; arrow, Page Up/Down, Home and End keys are supported. The scrollbar exposes its controlled page, orientation and percentage to assistive technology.

## Implementation boundaries

One shared client component reads document geometry in an animation frame and updates only the handle and accessibility value. ResizeObserver tracks document resizing; a scoped attribute observer follows body/root scroll locks. Event handlers and timers are cleaned up on unmount. Scroll measurement is disabled when the floating handle is not applicable. Retained business records and permissions are unchanged.

## Verification

- TypeScript `tsc --noEmit`: passed. Final Docker production build passed; Next compilation reported 29.4 seconds. Existing repository lint/cache warnings remain.
- Four focused installed-Chrome cases passed in 16.2 seconds: VI/EN auto-hide/hover, drag, track click, keyboard, native wheel, scroll locking/unlocking, reduced motion, forced colors, real touch-context fallback and independent dark admin sidebar scrolling.
- The final aggregate passed **65/65 installed-Chrome cases in 4.5 minutes**, one worker and no retries. It includes the four focused cases plus account, catalog, service intake, hero/session, assistant, admin navigation and marketing schedule regressions on the same final image.
- Reviewed light/dark hover screenshots in `.artifacts/model-universe/branded-scrollbar/`. The root handle floats outside the content, the native sidebar thumb hides after activity, and the dark variant remains visible against the workspace background. The aggregate also exercises responsive pages from 320px through desktop sizes.
- Initial focused checks had two assertion failures: the existing global reduced-motion rule uses an effectively instant 10-microsecond transition instead of literal zero. The assertion now verifies a sub-millisecond duration; behavior was unchanged. Subsequent focused and aggregate runs passed.
- Evidence logs: `branded-scrollbar-final-build.log`, `branded-scrollbar-verified-browser.log` and `branded-scrollbar-regression.log`. The retained web remains at `http://localhost:6050`; no retained business records were reset.

Firefox and WebKit were not visually verified in this increment. Existing financial-policy/provider production gates are unaffected; this UI verification does not certify the whole commerce platform.
