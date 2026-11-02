# Round 106: behind the scenes — every test runs, tests clean up
*November 2026*

## 🧰 Every release runs all 308 tests
- **Behind the scenes**: about fifty more of Hearth's tests now run before every release, including the ones for
  quests, projects, the Sound desk and the Lab's direction tools. Three of them need updating by the people who wrote
  them and are listed until then: two are out of date with the app, the third may point at a small quest-helper
  issue (a custom guide's FL Studio tempo step not noticing a save), passed on to be looked at.

## 🧹 Tests clean up after themselves
- **Behind the scenes**: the automatic checks now clean up after themselves. Each one works in its own temporary
  folder that is removed when it finishes, and a release check fails if any check leaves a folder behind. Test runs no
  longer fill up the test machine's disk (about 3 GB per full run before). Nothing changes in the app.
