# Paris friend outings

The map now has **Friend outings**, plus **Friend outings here** on compatible place panels. Choose someone from the existing social notebook, pick one of six initially visible cards, and start. **More ideas** reveals ten in total; **20 min or less** narrows the selection to four. Colourful icons, folded instructions and a responsive card grid keep the choices small.

## What to try

- Thomas / Ismaël: two-demo bench session, record relay, or a picnic with an eight-bar loop.
- Valentin: a tiny two-player game idea inspired by a real place.
- Guillaume: a one-song check-in or demo swap.
- Anyone, including Jean, Camille and Hugo: photo duet, museum remix, sunset postcard, show scouting or planning the next escape.

Suggestions use only the interests already supplied; no birthdays, contact details or availability are invented. Every friend can choose every mission. Each mission offers two existing guide destinations and a solo fallback. Activity times exclude travel. Venues are suggestions, not live opening-hours or ticket-availability claims.

Each accepted outing creates three ordinary proof/review steps, worth 90 XP total and a campaign badge after completion. Acceptance, copying an invitation and viewing a place award nothing. A friend's response or private conversation is never required as proof. Existing artifact uploads and chat evidence remain the review path.

The editable French invitation follows the chosen friend and venue. Copy it and send it yourself; Hearth does not contact anyone. Draft edits are for copying, not a separate saved message store.

## Treats

An optional goal chooser stocks one of eight treats: uninterrupted album, co-op hour, private premiere, night without a deliverable, bakery detour, coffee with a friend, artist purchase allowance, or next-show envelope. Four cost no money; the other four suggest editable €5 / €8 / €10 / €20 allowances. They use the existing sparks, refund and monthly budget system. Claim later in Treats; no payment, ticket booking or automatic redemption occurs. Existing customized names, prices and notes are preserved and displayed.

## Integration and validation

- Local changes are confined to Paris guide rules/UI, appended journal CSS, tests and this note. No data migration or eager-load addition.
- Campaign lookup uses mission + friend; reopening preserves the accepted place, brief, friend label and treat. User pins and quest-linked destinations survive guide removal.
- Rules tests exercise every mission/friend combination, actual reviewed completion, duplicate acceptance, reward edits, budget refusal/refund, invalid input and serialization.
- Isolated Electron check `dev/checks/paris-social.js` covers friend ordering, filters, compact cards, invitation copy (stubbed clipboard), reward previews, narrow layout, map navigation, acceptance, continuation and real reload. It uses a throwaway profile with no external tiles, messages or paid calls.
- Existing Paris discovery, city, field, walk, weekly planning and boot/lazy-registration checks run alongside it.

Publishing this change makes it available through Hearth's existing main-based updater. The running app and live checkout are not restarted or modified.
