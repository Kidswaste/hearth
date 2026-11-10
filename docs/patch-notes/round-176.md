# Round 176: chats kept ready let go when you're away
*November 2026*

## Less memory while Hearth is out of sight

- Hearth keeps your last few chats drawn so switching back is instant. Now, once Hearth has been hidden or minimised
  for 5 minutes, or a kept chat hasn't been shown for 15 minutes, it lets go of them. In a long working session that
  meant about half the page's elements (≈ 20,000 → 9,400) and 2–3 MB less for the window, on top of round 156's trim.
- The chat on screen and a chat that is still answering are never let go. Your drafts stay, and so does your place in
  the chat on screen. The first switch back to a chat that was let go draws it like any chat you open, which is just as
  quick.
