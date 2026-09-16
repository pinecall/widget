# Pinecall widget

One Pinecall agent as one button on any page. The button opens up to three ways to reach the
agent: the phone number with the call's live log, a voice call from the browser, and a chat. It
is a web component: one JavaScript file and one or two endpoints on your own server. The API key
lives on that server and never reaches the browser. The same two endpoints serve every agent of
your org; the tag says which one.

```
pinecall-widget.js              the button; one <script type="module"> tag
index.html                      a page with two agents on it, to open and try
server/
  php/token.php                 mints visit tokens, plain PHP
  php/log.php                   the call log for the page, plain PHP (optional)
  laravel/PinecallTokenController.php   the same two, as Laravel controllers
  laravel/PinecallLogController.php
```

## 1. The endpoint (2 minutes)

The widget asks **your** server for a visit token; your server asks Pinecall with the API key.

**Laravel.** Copy the two controllers from `server/laravel/` into `app/Http/Controllers/`, add
the routes and the variables:

```php
// routes/web.php
Route::post('/pinecall/token', [\App\Http\Controllers\PinecallTokenController::class, 'mint'])
    ->withoutMiddleware([\App\Http\Middleware\VerifyCsrfToken::class]);
Route::get('/pinecall/log', [\App\Http\Controllers\PinecallLogController::class, 'read']);
```

```dotenv
PINECALL_URL=https://box.pinecall.io
PINECALL_API_KEY=pk_live_…                        # a key with the talk, calls scopes
PINECALL_AGENTS=bidfire-dispatch,bidfire-sales    # which agents this site serves; empty = every one
```

**Plain PHP.** Copy `server/php/` next to your page and set the same three variables in the
environment (or edit the top of each file). `log.php` holds one PHP worker per open panel:
with `php -S`, start it with `PHP_CLI_SERVER_WORKERS=32`.

## 2. The tag (1 minute)

```html
<script type="module" src="/pinecall/pinecall-widget.js"></script>
<pinecall-widget agent="bidfire-sales" name="Sam" company="BidFire"
                 token-url="/pinecall/token" log-url="/pinecall/log"></pinecall-widget>
```

| attribute | | |
|---|---|---|
| `agent` | required | the agent's slug, as `pinecall run` prints it |
| `token-url` | required | your token endpoint |
| `log-url` | optional | your log endpoint: conversations drawn from the call's own log, the telephone call live, a "show tools" toggle |
| `phone` | optional | the number the agent answers; without it "Call us" is hidden |
| `name` | optional | what the agent is called on screen |
| `company` | optional | whose agent it is |
| `tagline` | optional | the line under the name |
| `label` | optional | the button's text, "Talk to <name>" |
| `position` | optional | `bottom-right` (default), `bottom-left`, `top-right`, `top-left`, `inline` |

Two agents on one page are two tags, each at its own position.

## 3. The look

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

## 4. Events

The tag dispatches `pinecall:open`, `pinecall:started` (`detail: {call, scope}`) and
`pinecall:ended` (`detail: {call}`), so a page can track conversions or open the widget itself
(`document.querySelector("pinecall-widget").toggle()`).

## What is on the wire

The browser talks to LiveKit with LiveKit's own client SDK, loaded from a CDN. The token your
endpoint mints is one visit's: it opens one room for one agent and dies in sixty seconds if it is
not used. The log endpoint relays `GET /v1/agents/<agent>/sessions` (cut to the caller's last
three digits: the page is public) and `GET /v1/calls/<call>/events` as server-sent events.
