# Guided Sidequests

Sidequest now has a compact Quests / Map / Progress / Desk navigation rail. Hover, keyboard focus or click reveals the section's horizontal choices. Map is a main button; its category/search controls live in that row. Important actions retain readable labels instead of hiding behind tiny icons.

## One step beside your work

Choose **Guide me** on the current quest or in a quest card. The helper is an independent, always-on-top window, so it stays beside FL Studio or a Hearth workbench. It shows the current instruction, progress and the evidence behind automatic checks. Hide keeps the session active; Pause suspends observations; Back pauses before retrying an earlier step. Progress survives app restarts.

The FL recipe opens FL Studio, checks the chosen BPM, checks a bass part, then guides a small arrangement and export. A selected `.flp` gives automatic checks when saved, including piano-roll note data. The optional read-only FL MIDI script gives live checks. Installation alone never claims a live connection. See [FL setup and verification](guided-fl-studio.md).

Other quests use their actual first move and finish line, with a button to open the appropriate Hearth workbench. Only successful workbench opening auto-checks that step. Creative judgments are explicitly confirmed with a short note. Guided progress can award the journal's existing small-start credit once; final XP, proof and review remain in the existing journal flow. A finished checklist is not a reviewed artifact.

## Get ready, go, come home

**Map → Plan my outing**, **Guide my night** on a show, and the saved Outing Desk all lead to the same guided journey. Enter a home address once, choose destination and times, and save the plan. Ready/leave times are independent and editable. Reminders are native desktop notifications, persist across restarts and work with the planner closed while Hearth is running. Sleep/wake catches up with one useful departure reminder instead of two stale alerts; OS notification settings still apply. Delivery failures remain visible and use bounded retries.

**Build my return trip** explicitly requests real IGN walking/driving directions for both legs, with street instructions, route drawings and an estimate. Transit/cycling use a live directions planner with the exact home/venue endpoints; no invented schedule is shown. A walking estimate can suggest ready/leave times, which remain editable before saving. Home is saved per trip, so a changed default never reroutes an older journey. Addresses are sent externally only when requesting a route or opening its live planner.

The outing's six stages can live in the same small helper. Progress is persisted by the main process, even if the main renderer is closed. It does not pretend to track physical location. A linked quest still asks for the moment you brought back.

## Delivery and checks

New modules are isolated from the existing quest store. Main/preload register the companion and outing services; lazy groups load their UI without adding first-screen scripts. Existing sources, rewards, proof rules and event feeds remain intact.

Focused evidence: navigation desktop/narrow/keyboard/map checks; helper native window render; real workbench-to-step integration; outing-to-helper persistence; saved FLP checks against an installed factory project plus malformed/off-grid fixtures; reminder restart/cancel/failure tests; official IGN route probe; boot/lazy verification. All development uses temporary profiles; no personal FL projects, existing controller configurations or live Hearth data are modified.

Install through Hearth's normal updater. Main-process additions require its managed restart. Set the home address and choose the song project in the new UI; neither value is guessed.
