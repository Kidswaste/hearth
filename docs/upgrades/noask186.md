# noask186: an AI that works without approval cards; the fold button under the folded text (round 186)

The owner (18 Nov 2026), after round 185 left pushes, deletes, installs and the network asking: "make it stop asking
for the other stuff too - also, sometimes text is hidden by pictures and i can't scroll past it to see the text"
(a screenshot of a Forge Debug reply: a table fading out, then a picture).

## Shipped
- `agent.noAsk` (`Access.setNoAsk(agentId, on, { confirm })`, `access.js`). In `check()`, an "ask" verdict for an
  agent with `noAsk` goes ahead without a card and is logged `by: 'trust'`, unless `Access.stillAsks(c)`:
  action `secrets` or `system`, a delete / write / move whose reason says "outside", or a reason "Hearth can't …"
  (unreadable command, unchecked .NET file calls). "deny" verdicts are untouched (passwords, the data folder lock,
  levels below Full). The Trash rewrite of plain deletes still runs.
- ⋯ AI setup › Files on this computer: a "Work without asking" switch for a Claude AI at Full (`access-ui.js`),
  with a confirm when turned on by hand.
- `Forge.trustOnce()` (`tools/forge.js`): after `grantFolder`, the Forge agent gets `noAsk` once
  (`settings.forgeNoAsk`); turned off by the owner it stays off. Not under the checks (`window.__smoke`).
- The fold: `.show-more-msg` is inserted right after the reply's `.body` (four places: `native.js` ×3,
  `chat-cmds.js`) instead of appended to the message, where it came after suggestion chips, cards and pictures.
  It is a full-width button (`features.css`). A click on a folded reply's text opens it (not on a link, picture or
  button, nor with text selected).

## Not done
- Where the picture in the screenshot sits in the message was not identified from the owner's chat (its data is not
  read); the fix does not depend on it, since the button no longer follows anything but the text.
- Astra: its sandbox decides, the switch is not shown for it.

## Checks
- `dev/checks/noask186.js`: before, `git push`, `git reset --hard`, `npm install`, `curl` each show a card; with
  the switch none asks and all go ahead; a keys file and a delete outside the folders still ask; `sudo` is still
  refused; off again, it asks. A folded long reply: the button is the body's next sibling, as wide as the reply,
  and a click on the text opens it.
- `dev/checks/forgechat183.js`: the Forge agent gets the setting once; turned off, not again.
