# History Color Alignment Design

## Goal

Bring the History screen into the same visual system as Transcribe, Models, and Settings by reducing the intensity of its purple and cyan treatments while keeping a slightly premium feel through subtle tinting.

This change is intentionally limited to color and surface treatment. The existing History layout, structure, and information hierarchy should remain intact.

## Current Problem

The History screen currently feels more saturated and atmospheric than the rest of the app:

- The right panel uses a strong multi-color radial background that does not appear on sibling screens.
- Session cards use pronounced tinted gradients that make the list feel louder than Models and Settings.
- Selected states rely more on glow and large-area tinting than the calmer border-and-surface emphasis used elsewhere.

The result is a screen that feels visually related to the app, but not fully aligned with its restraint.

## Chosen Direction

Use a neutral-first palette with subtle premium tinting.

This means:

- Keep dark surfaces as the dominant visual material.
- Use the existing primary accent sparingly for emphasis.
- Preserve profile distinction between meeting and live sessions, but constrain that distinction to small accents and selected states rather than full-card saturation.
- Remove the sense of a full-screen color wash.

This direction keeps the History view feeling slightly elevated without competing with the rest of the application.

## Visual Changes

### Page background

- Replace the custom right-panel radial gradient with a mostly neutral background.
- If any tint remains, it should be extremely subtle and read as a surface tone rather than a decorative glow.

### Left session list cards

- Reduce the intensity of the meeting and live card gradients.
- Make unselected cards read primarily as `card` surfaces with only a light tinted overlay.
- Keep hover feedback, but make it border- and surface-based rather than glow-based.

### Selected session cards

- Keep selected cards visibly elevated.
- Use a slightly brighter border, a restrained tint, and a softer shadow.
- Avoid strong neon or bloom-like emphasis.

### Accent treatment

- Reuse the same accent strength already seen in Models and Settings, especially `primary/10`, `primary/15`, and `primary/20`-style emphasis.
- Keep profile-specific icon chips and accent dots, but tone down card-wide saturation.

### Empty and detail states

- Align empty-state icon chips and detail-card accents with the same restrained palette.
- Keep the transcript reading panel premium through contrast and material, not through additional color effects.

## Implementation Notes

- Update the capture profile appearance helper so History cards inherit quieter base and selected styles.
- Simplify the History content pane background to a neutral surface.
- Tweak the empty state and selected-session card accents to match the rest of the app's surface language.
- Avoid introducing new theme tokens unless the existing palette proves insufficient.

## Constraints

- No layout restructuring.
- No content changes.
- No interaction changes beyond visual feedback intensity.
- Preserve the existing meeting/live differentiation.

## Verification

The redesign is successful when:

- The History screen feels visually consistent beside Models and Transcribe.
- Selected and hover states remain clear without relying on strong glow.
- The screen still feels slightly premium through subtle tinting and polished surfaces.
