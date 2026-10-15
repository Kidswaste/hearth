# Round 47: Astra connects, asks and adapts
*October 2026*

Open **Astra tools** in an Astra chat header.

## Connected apps
Search the apps connected to your ChatGPT account, inspect their tools, and select up to ten to mention in your next message. Availability distinguishes installed apps from tools that can actually run. The existing `/astra-apps on|off` setting remains; `/astra-connect` opens the picker.

## Connection health
See which connections and tools are loaded for this chat, whether sign-in is required, and which tools declare read-only access. Refresh on demand; browsing this information sends no model requests. `/astra-connections` opens it directly.

## Interactive questions
Astra's native questions now appear as answer cards with choices and a text field. Send your answer or skip; stopping the reply closes its questions. Answers go only to the matching request, and secret fields are not saved in Hearth's chat history.

## Follow-ups while Astra works
Use **Send follow-up now** in Astra tools, or `/astra-steer your guidance`, to steer the reply already running. Accepted follow-ups are saved in the conversation. Ordinary messages still queue as before; stale requests are never redirected into a different reply.

## Live model capabilities
`/astra-models` lists the models available to your Codex account, their accepted input types and supported reasoning levels. Choose a model and depth for this chat after its current reply finishes. Existing maximum reasoning and concise-answer preferences stay in place.

This release also includes the earlier persistent streaming connection, measured reply timings, and the Usage panel's actual account limits alongside separately labeled token traffic.
