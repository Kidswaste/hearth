# Guided FL Studio quests

Hearth's floating Quest Guide stays above the music app, shows one instruction at a time, and records each completed step with its evidence. Hide keeps the session watching; Pause suspends observation. Back undoes one step and pauses so the observer does not immediately re-complete it. Guide progress survives a restart. Final proof/review remains in Sidequest; reaching the end does not award a quest automatically.

## Easiest connection: a saved FL project

In the helper, choose **Connect FL → Choose this song's .flp**. Set the BPM and save in FL Studio. The guide reads the saved tempo, advances, and asks for the bass. Name its Channel Rack channel **Bass**, add notes in the piano roll or step sequencer, and save again. The parser checks actual note records belonging to that named channel, including off-grid notes. It never writes to your project. Each step requires a save after that step became active; selecting an old file alone does not pass steps. Only the selected file is observed, only during an active guide; nothing scans your project folders. If using Save As, choose the new file in the helper.

This checks saved content, not sound quality or whether a plugin is audible. A named bass channel without notes does not pass. Unsupported or incomplete projects show an error and leave the step incomplete. The observer accepts ordinary complete FLP projects up to 64 MB, and does not load plugin state or sample files. Zipped project bundles should be opened/saved as .flp in FL first.

## Optional live connection

**Connect FL → Install FL connection** installs a read-only Python controller script into the selected FL Studio user-data folder. For a nonstandard user folder choose **Custom FL data folder** first. In FL Studio MIDI settings, enable an unused physical or virtual MIDI input, then select **Hearth Quest Guide (user)** as its controller type. Refresh the MIDI device list or reload the script if necessary. Keep existing control-surface scripts on their current input. Installation is not connection: the helper says **Connected** only after a fresh paired observation arrives from FL.

No spare MIDI input? Use the saved-project method; no MIDI driver or controller is required. The live script observes BPM, playback, and named bass-channel grid notes/activity. Grid notes can miss off-grid piano-roll content; use the saved-project observer for that. A live bass auto-check requires notes, transport playback and actual channel activity. Neither route claims an AI listened to or rated the music.

The script uses Image-Line's documented `OnIdle`, `mixer.getCurrentTempo`, `channels.getChannelName`, `channels.getGridBit`, `channels.getActivityLevel` and `transport.isPlaying` APIs. It consumes no MIDI notes, sends no MIDI, captures no sound or screen, and sends nothing over the network. Its local file lease expires twelve seconds after Hearth stops. Disabling the controller in FL stops the script altogether.

Manual confirmation is always explicit and stores your short completion note separately from automatic evidence. Unsupported creative judgment and final export remain manual steps followed by the existing proof/review flow.

References: [Image-Line MIDI API](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/midi_scripting.htm), [public FLP field documentation](https://pyflp.readthedocs.io/en/latest/). The FLP reader is an independent bounded binary reader; it does not bundle PyFLP or any plugin runtime.

Verification: `node dev/questguide-test.js`, `node dev/questguide-flp-test.js`. Both use isolated temporary profiles. Factory FLP checks use FL Studio's installed demonstration projects, never personal projects. Live MIDI setup still needs the user's enabled FL input; a fixture test is not a claim that this computer has that connection enabled.
