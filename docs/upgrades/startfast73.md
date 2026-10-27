# startfast73: a quicker start and a Hearth that sleeps when you're away (round 73)

The owner says Hearth "feels slow overall" now that the hiccups are mostly gone. This stream measured a cold start on
the heavy owner-like profile (dev/bigprofile.js, round 70: 1,500 chats, 120 long ones, 50 Lab scenes, a full quest
journal…) with CPU profiles of both processes, cut the biggest costs it found, took the Lab's idle wakeups under budget,
measured Hearth hidden in the tray (all its processes), and fixed the two a11y check failures that were real.

## How it is measured
- **`node dev/coldstart-report.js --data /tmp/hearth-bigprofile70 --keys --profile <dir>`** (extended): cold starts from
  a copy of a data folder (`--data`), a key typed into the chat box every 200 ms for 8 s from the first screen on
  (`--keys`: Event Timing, the slowest key's handlers and to-paint), "settled" (the window's last long task, after 3
  quiet seconds) for every launch, and with `--profile` CPU profiles of **both** processes on the last launch: the main
  process from `dev/boot-probe.js` (`HEARTH_BOOT_CPUPROF`, an in-process inspector profile from its first line) and the
  window's main thread from the trace's V8 sampler, summed by phase with `dev/cpuprof-sum.js` (new). The probe now
  writes its IPC counts at most every 300 ms (a write per call was ≈ 20 ms of the measured start) and, with
  `HEARTH_BOOT_PROBE_BYTES=1`, counts kv reads per store (`kv:get ui-usage`…).
- **`dev/checks/idlecpu.js`** has a 7th setup, **hidden**: the Lab used, then the window hidden by the main process as
  the tray's close does; every process counts. Budgets: the window ≤ 0.3 wakeups/s, the main process ≤ 2 timers/min,
  all processes together ≤ 0.8 % of a CPU.
- The main process's sync file calls at start: `HEARTH_LOOPLAG=prof HEARTH_SLOWFS_US=150` (a Windows-slow disk) and
  `power.test({ lag })` 12 s after the start, as bigprofile70 does.
- Machine: this shared 4-CPU box with software GL and other streams running; A/B runs interleaved base / new. Counts
  and bytes are exact, times move ±30 %.

NUMBERS

## What was found
FOUND

## Upgrades
UPGRADES

## Not changed (reported)
NOTCHANGED

## Files
FILES

## For the patch notes
NOTES
