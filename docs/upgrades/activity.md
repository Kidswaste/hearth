# activity (round 27): one calm place that says what the AIs and Hearth are doing

You asked before to see clearly what chats are doing: agents deployed, where the thinking is, whether something is
stuck. Since then hooks, missions, helper agents, Lab crews, renders, sync and updates also run by themselves. Now one
small ◉ at the bottom of the rail shows up only while something runs or waits for you, and its panel says it all in
plain words. Nothing new to set up; desktop notifications use the switch you already had.

## The rail indicator
1. **◉ Activity** at the bottom of the rail, only while something runs or waits for you, with a count. It's hidden
   the rest of the time.
2. It **turns ember** when something waits for you, and breathes gently while things only run. With reduced motion
   on, it stays still.
3. **Right-click ◉ › Stop all replies** (or "Stop the reply" when only one is running).
4. **Right-click ◉ › Desktop notifications on / off**: the same switch as Settings.
5. **Right-click ◉ › More › Clear the history.**

## The Activity panel (click ◉, or Ctrl/⌘+K "Activity…")
6. **Now running**: each chat's reply shows its AI, the chat, what it's doing (thinking, writing, running a tool on
   what), how long it's been going and how many steps it's taken, with ↗ Open and ■ Stop.
7. **Helper agents** sit under their reply: what each one does, what it's working on now (or its result) and its
   time. This covers Split it up, Claude's / Astra's own agents and Lab crews.
8. **Missions asked of another AI** (Research, Second opinion only) show as running, with how many have answered.
9. **Other work with a bar** (renders, flows, comps, captures, installs) shows under Now running, with its own
   buttons (■ cancel…) and ↗ Show it.
10. **Waiting for you › permission asks**: the AI, what it wants to do, and **Allow once / Deny** right in the panel,
    or ↗ to open the chat.
11. **Waiting for you › questions** an AI asked you in a reply, with ↗ to answer them in the chat.
12. **Waiting for you › Plan first**: "Claude's plan is ready" with **▶ Go ahead** from the panel. It does the same
    as the button under the plan.
13. **Waiting for you › sync**: conflicts to look at, sync waiting for you, or a sync error, with **Look**.
14. **Waiting for you › failed while you looked elsewhere**: a reply that ended in an error, or a render that
    failed, with ↗ Open and ✕ Dismiss. A failed reply clears itself once you open that chat.
15. **Waiting for you › a job with no news for a while** (a hung bar), with ↗ Show it.
16. **Hearth update ready** (what's new…) sits quietly at the bottom when main has something new. It isn't counted,
    because ⬆ already shows it.
17. **Last 24 h**: hooks that fired, missions done, long replies (20 s or more, or with helpers), renders done
    (click: open the file) or failed, other long jobs finished, Hearth updated, and conflicts sync settled by itself.
    Click any of them to open it. The list is kept across restarts for 24 h.
18. **Show all / Show fewer** for the history (the newest 12 show first).
19. **"All quiet"** when nothing runs, nothing waits and nothing happened today.

## Stuck replies
20. **Looks stuck**: a reply with no news for 2 minutes moves to Waiting for you, with the reason chat-live already
    reads (for example "may still be working on three eval · CPU 0 %"). It offers **Wait** (2 more minutes),
    **Stop & retry from here**, **Stop** and ↗ Open. It reuses the chat's own liveness reading; nothing is measured
    twice.

## Desktop notifications (Mac and Windows)
21. Only while Hearth is in the background, and only for things that need you or long jobs: a reply looks stuck,
    a plan is ready, sync needs you, a render failed, or a render or other job that took a minute or more finished.
22. **Never noisy**: at most one every 20 s; anything more is summed up in one ("Hearth: 3 things"). Permission asks,
    questions and finished replies already notify by themselves, so you don't get them twice.
23. Clicking a notification brings Hearth forward on the thing (the chat, the file, the conflicts).
24. **One switch**: Settings › General "Desktop notifications while I'm elsewhere: replies, things that need me, long
    jobs finishing" (the old reply switch, renamed; `/notify on|off` too). No new setting.

## Chat and keys
25. `/whats-running` (alias `/activity-all`) opens the panel and writes the same summary in the chat;
    `/whats-running text` only writes it. Asking "what's running?" works through it.
26. The keys sheet lists the ◉ right-click menu.

## Light
27. **Nothing runs while idle**: no timer when nothing is running. While a reply runs, one check every 5 s reads
    the stuck state; with the panel open, it refreshes once a second. Rows are kept and only the words that changed
    are rewritten. The indicator only animates opacity.
28. It loads as a small lazy group right after the first screen (`activity`, ≈ 40 KB with its CSS). It reads the
    signals Hearth already had (Native hooks, ChatLive, Missions, Hooks, Renders, Progress, Sync, Updater) plus three
    tiny events: `hearth:needs-you` (access.js, native.js), `hearth:mission` (missions.js) and `hearth:hook-fired`
    (hooks.js).

## Tested
- `node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/activity.js` (also
  `sh dev/run-checks.sh activity`) passes. It checks: no indicator and no timer while idle; a `hang` reply shows
  under Now running and then looks stuck, with a notification while in the background, Wait, then Stop; a
  `subagents` reply lists its helpers and lands in the history; Plan first gives "plan is ready", a notification and
  ▶ Go ahead sends the go-ahead; a permission ask is allowed from the panel; hook and mission history; a Progress
  item shows up and goes away; no notification with the switch off or while in front; and back to idle with no timer.
- `node dev/lazy-manifest.js` (the lazy build matches) and `node dev/boot-test.js` (554 checks).
- Real desktop notifications on macOS / Windows were not seen here (Electron's `Notification` under Xvfb). They use
  the same call as the existing reply notifications.
