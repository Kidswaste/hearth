# Round 162: A quieter engine room
*November 2026*

## Less work behind the window

When Hearth sits open and untouched, its background process now wakes 2 times a minute instead of 6, and once a
minute instead of twice while hidden. Nothing is written to your data folder while nothing changes. A long reply
streaming in costs its background process about a fifth less (59 instead of 73 ms of work a second here), and
almost nothing extra while Hearth is hidden. Two big parts (cloud sync's engine when sync is off, the video frame
reader) now load the first time you use them.
