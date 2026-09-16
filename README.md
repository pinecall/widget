# Pinecall widget

One Pinecall agent as one button on any page. The button opens up to three ways to reach the
agent: the phone number with the call's live log, a voice call from the browser, and a chat. It
is a web component: one JavaScript file, no build step, no framework — it works in plain HTML,
React, Vue, Svelte, Laravel Blade or anything else that renders a tag. The same file serves every
agent of your org; the tag says which.

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/pinecall/widget@main/pinecall-widget.js"></script>
<pinecall-widget agent="bidfire-sales" name="Sam" company="BidFire"
                 token-url="/pinecall/token" log-url="/pinecall/log"></pinecall-widget>
```

## The tag

| attribute | | |
|---|---|---|
| `agent` | required | the agent's slug, as `pinecall run` prints it |
| `token-url` | required | your token endpoint (below) |
| `log-url` | optional | your log endpoint (below): conversations drawn from the call's own log, the telephone call live, a "show tools" toggle |
| `phone` | optional | the number the agent answers; without it "Call us" is hidden |
| `name` | optional | what the agent is called on screen |
| `company` | optional | whose agent it is |
| `tagline` | optional | the line under the name |
| `label` | optional | the button's text, "Talk to <name>" |
| `position` | optional | `bottom-right` (default), `bottom-left`, `top-right`, `top-left`, `inline` |

Two agents on one page are two tags, each at its own position.

## Your two endpoints

The widget never holds the org's API key. Your server does, and exposes two doors; the widget
calls them with the agent named on the tag.

**`token-url` — `POST`, JSON `{ "agent": "<slug>", "scope": "talk" | "chat" }`.** Your server
posts to Pinecall's `POST /v1/tokens` with `Authorization: Bearer <key>` and the body
`{ "agent", "scope", "ttl_s": 60, "metadata": {…} }`, and answers with Pinecall's JSON as it came
(`server_url`, `participant_token`, `call`), status and all. Refuse an `agent` your site does not
serve. The key needs the `talk` scope.

Or no endpoint at all: set the element's `tokenProvider` property to a function
`(scope, agent) => Promise<token JSON>` and the widget asks it instead — for an app that already
holds a way to mint, or a page that holds a person's key (the Pinecall console's preview does).

**`log-url` — `GET`, optional.** Two queries, both with `?agent=<slug>`:
- `&list=1` answers `{ "calls": [ { "call", "live", "from", "started_at" } ] }` — the agent's latest
  telephone calls, from `GET /v1/agents/<agent>/sessions?limit=30`, keeping only `channel ==
  "phone"` and cutting `from` to its last three digits (the page is public).
- `&call=<id>` relays `GET /v1/calls/<id>/events?types=call.started,user.transcript,agent.transcript,turn.user,turn.agent,tool.call,tool.result,call.ended&after=0`
  as `text/event-stream`, byte for byte, with buffering off. The key needs the `calls` scope.

Ready-made endpoints for plain PHP and for Laravel live with the BidFire agents:
https://github.com/cloudacio/bidfire-agents/tree/main/plugin/server.

## The look

The font is inherited from the page. Everything else is a custom property on the tag:

```css
pinecall-widget {
  --pc-accent: #0f766e;       /* the button, the links, the agent's bubbles */
  --pc-accent-soft: #f0fdfa;  /* the soft background behind them */
  --pc-ink: #111;             /* the text */
  --pc-muted: #6b7280;        /* the second line of text */
  --pc-line: #e5e7eb;         /* borders */
  --pc-radius: 14px;          /* the panel's corners */
  --pc-offset: 20px;          /* the distance from the page's edge */
  --pc-font: Inter, sans-serif;
  --pc-font-size: 15px;
  --pc-z: 2147483000;
}
pinecall-widget::part(button) { border-radius: 8px; }   /* the button, outright */
pinecall-widget::part(panel) { box-shadow: none; }
```

## Events

The tag dispatches `pinecall:open`, `pinecall:started` (`detail: {call, scope}`) and
`pinecall:ended` (`detail: {call}`), so a page can track conversions or open the widget itself
(`document.querySelector("pinecall-widget").toggle()`).

## In React, Vue, Svelte

A custom element is an element: render the tag and it works.

```jsx
// React — import the module once, then the tag. Attributes are strings.
import "https://cdn.jsdelivr.net/gh/pinecall/widget@main/pinecall-widget.js";

export function Support() {
  return <pinecall-widget agent="bidfire-sales" name="Sam" token-url="/pinecall/token" log-url="/pinecall/log" />;
}
```

```vue
<script setup>
import "https://cdn.jsdelivr.net/gh/pinecall/widget@main/pinecall-widget.js";
</script>
<template>
  <pinecall-widget agent="bidfire-sales" name="Sam" token-url="/pinecall/token" log-url="/pinecall/log" />
</template>
```

In TypeScript, declare the tag once: `declare global { namespace JSX { interface IntrinsicElements
{ "pinecall-widget": any } } }`.

## What is on the wire

The browser talks to LiveKit with LiveKit's own client SDK, loaded from a CDN. The token your
endpoint mints is one visit's: it opens one room for one agent and dies in sixty seconds if it is
not used.

## Next

- Wrappers with typed props and slots for React and Vue, so the chat's bubbles, header and
  composer can be replaced with your own components rather than only restyled.
- A headless core (`open`, `send`, `leave`, the transcript as events) for a page that draws its
  own UI entirely.
