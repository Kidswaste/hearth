# Round 165: Long chats stay light
*November 2026*

## Smoother scrolling in long chats

- **In a look with a plain background, a chat now scrolls on the graphics side instead of Hearth's busy main thread.**
  Wheeling through a 2,000-message chat kept that thread busy half to two thirds less (1.1 s instead of 2.2 s for 50
  wheel turns here), with no hitch over 50 ms of its own, and a reply streaming in no longer repaints the whole chat
  for every piece. It looks exactly the same. (The Forgeheart looks, with their glowing background, scroll as before.)
- Each message on screen no longer keeps a second copy of its whole text in the page. A 2,000-message chat still opens
  in under 0.2 s with only its last 40 messages drawn, and finding or jumping to an old message works as before.
