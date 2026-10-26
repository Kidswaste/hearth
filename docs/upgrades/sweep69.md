# sweep69: stale and failing quest + music checks (round 69)

Rounds 67 and 68 listed eight checks that failed on main: quest-studio, questhud61, quest-proof, showprep62, liveset64,
loopsong63, routine-feedback and visual-feedback. I looked at each one and decided whether the app or the check was
wrong. Two were real app bugs, and I fixed both. The rest were stale checks or runner wiring, and I updated them to the
current app. Then I ran the whole quest + music set once. Base for comparison: main d0f39c6.

## Real app bugs (fixed)

1. **Shows you went to now keep their ✓ on the Paris map at normal zoom.** (showprep62's "timed out: visited pins")
   The fix is in `showprep.js` `visitedPins()`. Since Codex's syndicated-shows work, showsync gives this week's ordinary
   venues `minZoom: 15`. If you had been to one of them (La Cigale, Bataclan in the fixture), its ✓ pin disappeared at
   the map's usual zoom. A venue you went to that isn't on this week's list did still show. **What the owner saw:**
   after logging "How was it?", that venue was missing from Life › Map until you zoomed far in. Now a visited venue
   shows at every zoom, like the others.
2. **Reading frames from a Lab recording no longer fails at random.** (it surfaced in routine-feedback)
   The fix is in `framereader.js` `grabPass()`. A scene recording (WebM) can hold two frames with the same millisecond
   timestamp. ffmpeg's JPEG writer then sometimes stopped with "Invalid pts (37) <= last (37)". The picked frames now
   get fresh times (`setpts=N/TB`), and nothing reads those times. I reproduced the error on a WebM with duplicate
   timestamps; it is intermittent in ffmpeg itself. **What the owner saw:** a ✦ Feedback / ↻ Auto-improve round now and
   then failed with that raw ffmpeg text instead of reviewing the take. The same could happen to any "frames" read
   of a recording.

## Stale checks (updated to the current UI, no app change)

3. **quest-studio**: the rail's Sidequest Studio button is now the **Life** space (`[data-space="life"]`, titled
   "Life"). Motion moved into Life › Settings (Reduce motion / Enable motion). The idea box ("+ Suggest a quest")
   moved to Find a quest › Saved ideas & cards. Today no longer lists daily invitations with "Not today", so that step
   and its reload line are dropped. The rail selector is updated the same way in quest-session, quest-deck,
   quest-workstation, quest-world, quest-life and quest-proof.
4. **quest-proof**: "Browse commissions →" is gone. The commission wall is now part of Find a quest (the five
   commissions are project cards there, opened with Open → Continue). "Save toward this" is now a ★ icon button named
   by its label.
5. **questhud61**: a started quest's hero button reads "Continue quest →" ("Continue with helper →" is gone). Hearth now
   starts on the Projects desk, so the check opens a chat before typing /quest. The Lab no longer has a chats list
   beside its preview. When there is no room, the open tracker panel may cover the preview's edge but never its middle.
6. **liveset64**: the pads are drawn again once the set arms. The check now reads the pad on screen, not a detached
   one (that was the "Filter off"). It also waits for the offered quest to open in Life before clicking "🎤 Rehearse your
   set", so the two can't race.
7. **loopsong63**: offering the song as proof opens its quest in Life (Codex's journal dialogs open there now), and
   that could land in the middle of the /song steps. The check now waits for it. /song then brings the Sound desk back
   as before.
8. **routine-feedback**: a scene that has just opened is still starting to play, and its pause lands about 0.5 s
   later. The check now reads the paused position after that. The recording does restore the paused position.
9. **weekquest62 / rewards63** (found red in the full run, same cause as questhud61): they now open a chat before
   their chat commands. On a Monday, weekquest62 also moved a planned chip onto today, which took the ✦ chip from
   today's quest. It now picks another day.
10. **unit:vst-live-host-test**: an instrument plays at its monitor volume × Hearth's playback volume (75 % by default,
    `volumemain.js`). The host was sent 0.075 for a 0.1 monitor. I traced every path, and this is the only place the
    volume is applied: the Python host plays to the device itself, and the Sound desk never feeds the host's answer
    back into its slider. It is applied once, not twice, so it is not a double cut you would hear. The test now
    expects monitor × master.

## Runner wiring

11. `dev/run-checks.js` `EXTRA_FLAGS`: routine-feedback and visual-feedback have no smoke line in their header, so they
    get `--fake-engines`, and visual-feedback is handed `window.FEEDBACK_FIXTURE` (the test video
    /tmp/hearth-test-videos/neon_tunnel_v1.mp4, made on demand). New group `sweep69`.

## Tests

- All eight from the brief now pass: quest-studio, quest-proof, questhud61, showprep62, liveset64, loopsong63,
  routine-feedback, visual-feedback. weekquest62 and rewards63 pass too.
- lazy, unit:boot-test, unit:capture-test (framereader) and unit:errorcalm-scan pass. All 24 quest/music unit tests
  pass, including unit:vst-live-host-test, unit:datasafe-scan and unit:winmac-test.
- Full quest + music run (46 app checks, 5 per lock hold). These are still red. Each one I re-ran on the untouched base
  d0f39c6 fails the same way, so none of them comes from this stream:
  - **Codex's Life redesign left stale checks** (I didn't run these on base; each fails on a button, page or class
    that no longer exists): quest-deck ("Mixtape UI timed out"), quest-session, quest-journal, quest-life ("illustrated
    desk navigation"), quest-workstation ("charcoal workstation"), quest-world ("Friends & dates" button), quest-icons,
    quest-focus, quest-field ("favorite keeps keyboard focus"), quest-paris ("search finds guide words").
  - mapfirst64: the layer strip labels changed (it expects Places · Shows…; it gets Layers, Food & stops, Nights…).
    Same on base.
  - leavesoon68: "a dismissed one rings no more" / "the missed row". Same on base. Worth a look next round: it could
    be a real reminder bug.
  - parkjam62: "the week's review hears the loop became proof". Same on base (listed since round 66).
  - vstembed64: "switching instrument closes Vital's editor cleanly". Same on base.
  - playback-volume and city-integration (Codex's): timeouts. Same on base.
  - questperf65: the place-details dialog is 17.5 ms vs its 16 ms budget (known, dialogperf68). It only goes over
    under load.

## For Codex

Changes to your check files are small, commented with "(sweep69)", and touch no app code:
- `dev/checks/quest-studio.js`, `quest-proof.js`: use the Life space, Settings for motion, Find a quest for ideas and
  commissions, and the ★ reward-goal icon.
- `dev/checks/quest-session.js`, `quest-deck.js`, `quest-workstation.js`, `quest-world.js`, `quest-life.js`: the rail
  selector only (`[data-space="life"]`). Their other steps still need your current UI (see the red list above).
- `dev/checks/routine-feedback.js`: waits for the pause before reading the start time.
- The runner now passes `--fake-engines` / `FEEDBACK_FIXTURE` to routine-feedback and visual-feedback.
- `framereader.js` (shared): `setpts=N/TB` in the one-pass frame grab.

## For the patch notes

- Venues you went to now keep their ✓ on the Life › Map at the normal zoom. Before, a venue that also had a show this
  week only showed once you zoomed far in.
- ✦ Feedback and ↻ Auto-improve rounds no longer fail now and then with a raw "Invalid pts" ffmpeg message while
  reading frames from a scene recording.
