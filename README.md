# Pinecall widget

One Pinecall agent as one button on any page. The button opens up to three ways to reach the
agent: the phone number with the call's live log, a voice call from the browser, and a chat. It
is a web component: one JavaScript file, no build step, no framework — it works in plain HTML,
React, Vue, Svelte, Laravel Blade or anything else that renders a tag. The same file serves every
agent of your org; the tag says which.

Your gateway serves it: `https://<gateway>/widget/pinecall-widget.js` (`box.pinecall.io` on
Pinecall's box). jsDelivr serves this repository too, at
`https://cdn.jsdelivr.net/gh/pinecall/widget@main/pinecall-widget.js`.

```html
<script type="module" src="https://box.pinecall.io/widget/pinecall-widget.js"></script>
<pinecall-widget agent="bidfire-sales" name="Sam" company="BidFire"
                 token-url="/pinecall/token" log-url="/pinecall/log"></pinecall-widget>
```

`index.html` in this repository is that page, pointed at the file beside it.

## The tag

| attribute | | |
|---|---|---|
| `agent` | required | the agent's slug, as `pinecall run` prints it |
| `token-url` | required, unless `tokenProvider` is set | your token endpoint (below) |
| `log-url` | optional | your log endpoint (below): conversations drawn from the call's own log, the telephone call live, a "Show tools" toggle |
| `phone` | optional | the number the agent answers; without it "Call us" is hidden |
| `name` | optional | what the agent is called on screen, `Assistant` when left out |
| `company` | optional | whose agent it is, shown under the name |
| `tagline` | optional | the line under the name, after the company |
| `label` | optional | the button's text, `Talk to <name>` when left out |
| `position` | optional | `bottom-right` (default), `bottom-left`, `top-right`, `top-left`, or `inline`: the button right where the tag is, in the page's own flow |
| `greeting` | optional | the first line the widget shows, before any call starts: drawn as the agent's bubble above the ways to reach it, and above the conversation until the call is up. Plain text — markup in it is shown, never rendered |
| `autostart` | optional | open straight into a voice call: the click that opens the panel asks for the microphone and starts the call, with no second click. Refused, the menu opens with the reason and chat is one click away. A browser that has not yet allowed sound shows a "Tap to hear the agent" button. `autostart="false"` is off |

A gateway keeps these per agent for a console to set and copy into a snippet —
`GET`/`PUT /v1/agents/{slug}/widget`, `{title, tagline, greeting, accent, autostart}`, where `title`
is `name` and `accent` is `--pc-accent` — and the widget itself reads only its attributes.

The attributes are read once, when the tag is connected to the page — except `token-url`, which is
read each time a token is asked for. Two agents on one page are two tags, each at its own position.

Without `log-url`, voice and chat draw their words from LiveKit's text streams alone, "Call us"
only shows the number, and there is no tools toggle.

## Your two endpoints

The widget never holds the org's API key. Your server does, and exposes two doors; the widget
calls them with the agent named on the tag, so the same two endpoints serve every agent of the
org. Refuse an `agent` your site does not serve.

The key is a production key (the world it opens is the world whose agent answers) with the `talk`
scope for the token and the `calls` scope for the log. It goes in an `Authorization: Bearer <key>`
header and never reaches the browser.

### `token-url`

The widget sends:

```http
POST <token-url>
Content-Type: application/json

{ "agent": "<slug>", "scope": "talk" | "chat" }
```

`talk` for a voice call, `chat` for a written one. Your server posts to Pinecall:

```http
POST https://<gateway>/v1/tokens
Authorization: Bearer <key>
Content-Type: application/json

{ "agent": "<slug>", "scope": "talk" | "chat", "ttl_s": 60, "metadata": { … } }
```

and answers with Pinecall's response as it came, status and body: `201` with
`{ "server_url", "participant_token", "call" }`. `ttl_s` is optional (60 by default, 600 at most);
`metadata` is optional and is sealed into the call: the agent reads it, and a browser may read it
but alter none of it. On an error Pinecall answers `{ "detail": "<sentence>" }` — `404` for an agent the key's org does
not answer on the web, `429` when the org's quota is spent, `503` when the fleet is full — and the
widget shows `detail` in the panel, so pass it through. The body must not carry `room_name`,
`participant_name` or `participant_metadata`: Pinecall refuses them with a `400`.

Or no endpoint at all: set the element's `tokenProvider` property to a function
`(scope, agent) => Promise<token JSON>` resolving to that same `{ server_url, participant_token,
call }`, and the widget asks it instead of `token-url` — for an app that already holds a way to
mint, or a page whose requests are already a person's (the Pinecall console's preview does: it
mints at `POST /v1/tokens` as whoever is looking, through the gateway's page or `pinecall serve`).

```js
document.querySelector("pinecall-widget").tokenProvider = (scope, agent) =>
  fetch("/my/mint", { method: "POST", body: JSON.stringify({ scope, agent }) }).then((r) => r.json());
```

### `log-url` — optional

Two `GET` queries, both with `agent` added to whatever query string `log-url` already has:

**`<log-url>?agent=<slug>&list=1`** — the agent's latest telephone calls. The widget polls it once a
second while "Call us" is open, and expects `200` with:

```json
{ "calls": [ { "call": "call_…", "live": true, "from": "···169", "started_at": 1789000000.5 } ] }
```

Your server reads `GET https://<gateway>/v1/agents/<slug>/sessions?limit=30` (newest first,
`{ "calls": [ … ] }`), keeps only the rows with `channel == "phone"`, and answers those four fields
of each. `started_at` is Unix seconds; the widget shows the call that is `live`, or a call that
started after "Call us" was opened. `from` is printed on the page as it comes, and the page is
public: cut the caller's number to its last three digits.

**`<log-url>?agent=<slug>&call=<id>`** — one call's log, live, as server-sent events. Your server
relays

```http
GET https://<gateway>/v1/calls/<id>/events?types=call.started,user.transcript,agent.transcript,turn.user,turn.agent,tool.call,tool.result,call.ended&after=0
Authorization: Bearer <key>
Accept: text/event-stream
```

and streams the answer back byte for byte as `text/event-stream`, flushing every chunk, with
`Cache-Control: no-cache` and buffering off (`X-Accel-Buffering: no` behind nginx). Without that
`Accept` header Pinecall answers a JSON page instead of the stream. Each frame is
`id: <seq>` · `event: <type>` · `data: <JSON>`, and the widget reads the entry's payload from the
JSON's `data` field. Check that `<id>` is a call id before putting it in the URL.

## The look

The font is inherited from the page. Everything else is a custom property on the tag:

```css
pinecall-widget {
  --pc-accent: #0f766e;       /* the button, the links, the agent's bubbles — default #6d28d9 */
  --pc-accent-soft: #f0fdfa;  /* the soft background behind them — default #f5f3ff */
  --pc-ink: #111;             /* the text — default #1f2937 */
  --pc-muted: #6b7280;        /* the second line of text */
  --pc-line: #e5e7eb;         /* borders */
  --pc-radius: 14px;          /* the panel's corners */
  --pc-offset: 20px;          /* the distance from the page's edge */
  --pc-font: Inter, sans-serif; /* default: the page's own */
  --pc-font-size: 15px;
  --pc-z: 2147483000;
}
pinecall-widget::part(button) { border-radius: 8px; }   /* the button, outright */
pinecall-widget::part(panel) { box-shadow: none; }      /* the panel, outright */
```

## Events

The tag dispatches `pinecall:open` when the panel opens, `pinecall:started` (`detail: {call,
scope}`) when a voice call or chat has joined, and `pinecall:ended` (`detail: {call}`) when it
leaves, so a page can track conversions. `toggle()` opens the panel, or closes it when open:
`document.querySelector("pinecall-widget").toggle()`.

## In React, Vue, Svelte

A custom element is an element: render the tag and it works.

```jsx
// React — import the module once, then the tag. Attributes are strings.
import "https://box.pinecall.io/widget/pinecall-widget.js";

export function Support() {
  return <pinecall-widget agent="bidfire-sales" name="Sam" token-url="/pinecall/token" log-url="/pinecall/log" />;
}
```

```vue
<script setup>
import "https://box.pinecall.io/widget/pinecall-widget.js";
</script>
<template>
  <pinecall-widget agent="bidfire-sales" name="Sam" token-url="/pinecall/token" log-url="/pinecall/log" />
</template>
```

In TypeScript, declare the tag once: `declare global { namespace JSX { interface IntrinsicElements
{ "pinecall-widget": any } } }`.

## What is on the wire

The browser talks to LiveKit with LiveKit's own client SDK, loaded from jsDelivr
(`livekit-client@2`), at the `server_url` the token names. A page with a Content Security Policy
allows both. The token your endpoint mints is one visit's: it opens one room for one agent and
dies when its `ttl_s` runs out if it is not used.

## Next

- Wrappers with typed props and slots for React and Vue, so the chat's bubbles, header and
  composer can be replaced with your own components rather than only restyled.
- A headless core (`open`, `send`, `leave`, the transcript as events) for a page that draws its
  own UI entirely.
