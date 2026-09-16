// <pinecall-widget> — one Pinecall agent as one button on any page.
//
// One floating button opens up to three ways to reach the agent: the phone number with the
// call's live log, a voice call from the browser, and a chat. The page needs this file and one or
// two endpoints on its own server, which mint the visit token and relay the call log with the
// org's API key (the README says their shape). The key never leaves that server, and the same two
// endpoints serve every agent of the org: the tag says which.
//
//   <script type="module" src="/pinecall/pinecall-widget.js"></script>
//   <pinecall-widget agent="bidfire-sales" name="Sam" company="BidFire"
//                    token-url="/pinecall/token.php" log-url="/pinecall/log.php"></pinecall-widget>
//
// Attributes:
//   agent       required · the agent's slug, as `pinecall run` prints it
//   token-url   required · mints visit tokens (POST {agent, scope}) — yours. Or set the element's
//               `tokenProvider` property to a function (scope, agent) => Promise<token JSON>
//   log-url     optional · lists the phone calls and relays a call's log (GET ?agent=&list=1,
//               GET ?agent=&call=) — yours. With it, every conversation is drawn from the call's
//               own log in the order it happened, "Call us" shows the telephone call as it
//               happens, and a toggle shows the tools the agent runs. Without it, voice and chat
//               draw their words from LiveKit's text streams alone.
//   phone       optional · the number the agent answers; without it "Call us" is hidden
//   name        optional · what the agent is called on screen, "Assistant" when left out
//   company     optional · whose agent it is; shown under the name
//   tagline     optional · the line under the name, "books your technician"
//   label       optional · the floating button's text, "Talk to <name>"
//   position    optional · bottom-right (default), bottom-left, top-right, top-left, or inline:
//               inline puts the button right where the tag is, in the page's own flow
//
// The look follows the page: the font is inherited, and these custom properties, set on the tag,
// change the rest — --pc-accent, --pc-accent-soft, --pc-ink, --pc-muted, --pc-line, --pc-radius,
// --pc-offset, --pc-font, --pc-font-size, --pc-z. The button and the panel are also exposed as
// parts: pinecall-widget::part(button) { … } styles the button outright.
//
// Events, on the tag: pinecall:open, pinecall:started {call, scope}, pinecall:ended {call}.
//
// Everything on the wire is LiveKit's own client SDK, loaded from a CDN: no build step.

import { ParticipantKind, Room, RoomEvent, Track } from "https://cdn.jsdelivr.net/npm/livekit-client@2/+esm";

const TRANSCRIPTION = "lk.transcription";
const CHAT = "lk.chat";
const SEGMENT_ID = "lk.segment_id";
const TRANSCRIPTION_FINAL = "lk.transcription_final";
const TOOLS_SETTING = "pinecall-widget:show-tools";

// The look is a handful of custom properties the page can set on the tag, and two parts
// (`button`, `panel`) it can style outright. The font is the page's own unless --pc-font says otherwise.
const STYLE = `
  :host {
    all: initial;
    display: contents;
    font-family: var(--pc-font, inherit);
    font-size: var(--pc-font-size, 15px);
    line-height: 1.45;
    color: var(--pc-ink, #1f2937);
    --_accent: var(--pc-accent, #6d28d9);
    --_soft: var(--pc-accent-soft, #f5f3ff);
    --_line: var(--pc-line, #e5e7eb);
    --_muted: var(--pc-muted, #6b7280);
    --_radius: var(--pc-radius, 14px);
    --_offset: var(--pc-offset, 20px);
    --_z: var(--pc-z, 2147483000);
  }
  :host([position="inline"]) { display: inline-block; }
  * { box-sizing: border-box; }
  .fab { position: fixed; right: var(--_offset); bottom: var(--_offset); z-index: var(--_z); display: inline-flex; align-items: center; gap: 8px;
         padding: 11px 16px; border: 0; border-radius: 999px; cursor: pointer; color: #fff; font: inherit; font-weight: 500;
         background: var(--_accent); box-shadow: 0 6px 18px rgba(17, 24, 39, .18); transition: transform .12s, box-shadow .12s; }
  .fab:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(17, 24, 39, .22); }
  .fab svg { width: 18px; height: 18px; }
  .panel { position: fixed; right: var(--_offset); bottom: calc(var(--_offset) + 60px); z-index: var(--_z); width: min(380px, calc(100vw - 2 * var(--_offset)));
           height: auto; max-height: min(640px, calc(100vh - 110px)); display: flex; flex-direction: column; background: #fff; color: inherit;
           border-radius: var(--_radius); overflow: hidden; box-shadow: 0 16px 40px rgba(17, 24, 39, .18); border: 1px solid var(--_line); }
  .panel.wide { width: min(480px, calc(100vw - 2 * var(--_offset))); height: min(760px, calc(100vh - 110px)); }
  .panel[hidden] { display: none; }
  :host([position="bottom-left"]) .fab, :host([position="bottom-left"]) .panel { right: auto; left: var(--_offset); }
  :host([position="top-right"]) .fab { bottom: auto; top: var(--_offset); }
  :host([position="top-right"]) .panel { bottom: auto; top: calc(var(--_offset) + 60px); }
  :host([position="top-left"]) .fab { right: auto; bottom: auto; left: var(--_offset); top: var(--_offset); }
  :host([position="top-left"]) .panel { right: auto; bottom: auto; left: var(--_offset); top: calc(var(--_offset) + 60px); }
  :host([position="inline"]) .fab { position: static; }
  @media (max-width: 520px) {
    .panel.wide { right: 0; bottom: 0; left: 0; top: auto; width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; flex: 0 0 auto;
           border-bottom: 1px solid var(--_line); }
  header h2 { margin: 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  header h2::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--_accent); }
  header p { margin: 2px 0 0; font-size: 13px; color: var(--_muted); }
  header button { border: 0; background: transparent; color: var(--_muted); font-size: 22px; cursor: pointer; line-height: 1; padding: 4px; }
  header button:hover { color: inherit; }
  .body { padding: 16px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; flex: 1 1 auto; min-height: 0; }
  .option { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; text-align: left; cursor: pointer;
            border: 1px solid var(--_line); border-radius: calc(var(--_radius) - 2px); background: #fff; color: inherit; font: inherit; text-decoration: none; }
  .option:hover { border-color: var(--_accent); background: var(--_soft); }
  .option .icon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--_soft); color: var(--_accent); flex: 0 0 36px; }
  .option .icon svg { width: 18px; height: 18px; }
  .option b { display: block; font-weight: 500; }
  .option span { display: block; font-size: 13px; color: var(--_muted); }
  .number { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: calc(var(--_radius) - 2px); background: var(--_soft); }
  .number b { font-size: 20px; font-weight: 500; letter-spacing: .01em; }
  .number a { font: inherit; font-weight: 500; padding: 9px 14px; border-radius: 10px; background: var(--_accent); color: #fff; text-decoration: none; }
  .lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; overflow-y: auto; min-height: 120px; }
  .lines li { padding: 8px 12px; border-radius: 12px; max-width: 88%; font-size: 14px; }
  .lines li.agent { background: var(--_soft); align-self: flex-start; border-bottom-left-radius: 4px; }
  .lines li.user { background: #f3f4f6; align-self: flex-end; border-bottom-right-radius: 4px; }
  .lines li.interim { opacity: .55; }
  .lines li.mark { background: none; color: var(--_muted); font: 12px/1.4 ui-monospace, Menlo, monospace; max-width: 100%; padding: 2px 8px; }
  .lines li.mark[hidden] { display: none; }
  .status { font-size: 13px; color: var(--_muted); }
  .status.live { color: #16a34a; }
  .status.failed { color: #dc2626; }
  .row { display: flex; gap: 8px; flex: 0 0 auto; }
  input[type=text] { flex: 1; font: inherit; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; outline: none; color: inherit; background: #fff; }
  input[type=text]:focus { border-color: var(--_accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--_accent) 20%, transparent); }
  .btn { font: inherit; font-weight: 500; padding: 9px 14px; border: 0; border-radius: 10px; cursor: pointer; background: var(--_accent); color: #fff; }
  .btn.quiet { background: #f3f4f6; color: inherit; }
  .btn.danger { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
  .btn[disabled] { opacity: .5; cursor: default; }
  footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--_line); flex: 0 0 auto; }
  footer .right { display: flex; align-items: center; gap: 12px; }
  .back { border: 0; background: transparent; color: var(--_accent); font: inherit; cursor: pointer; padding: 0; }
  .toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--_muted); cursor: pointer; user-select: none; }
  .toggle input { accent-color: var(--_accent); }
`;

const ICONS = {
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="3"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H8l-4 4z"/></svg>`,
};

/**
 * One call's log drawn into a list, entry by entry, in the order the gateway wrote it: the
 * caller's words as the recogniser hears them, the agent's as the voice says them, each tool
 * between them. Tools are marks, shown or hidden by the toggle without being redrawn.
 */
class Transcript {
  constructor(list, showTools) {
    this.list = list;
    this.showTools = showTools;
    this.stream = null;
    this.lines = new Map();
    this.hearing = null;
    this.onAgent = null;
    this.onEnd = null;
  }

  follow(url, attempt = 0) {
    this.stop();
    if (attempt === 0) {
      this.list.replaceChildren();
      this.lines.clear();
      this.hearing = null;
    }
    const stream = new EventSource(url);
    this.stream = stream;
    const data = (event) => JSON.parse(event.data).data ?? {};
    stream.onerror = () => {
      if (stream.readyState !== EventSource.CLOSED) return;
      stream.close();
      if (this.stream === stream && attempt < 10) setTimeout(() => this.follow(url, attempt + 1), 1000);
    };
    // The recogniser's last word on the turn (`final`) is the moment the line settles: the turn
    // itself is written after the end-of-utterance wait, and the agent is already thinking by then.
    stream.addEventListener("user.transcript", (event) => {
      const heard = data(event);
      if (!this.hearing) this.hearing = this.line("user interim", "");
      this.hearing.textContent = heard.text ?? "";
      if (heard.final) this.hearing.className = "user";
      this.scroll();
    });
    stream.addEventListener("turn.user", (event) => {
      const item = this.hearing ?? this.line("user", "");
      item.className = "user";
      item.textContent = data(event).text ?? "";
      this.hearing = null;
    });
    stream.addEventListener("agent.transcript", (event) => {
      const word = data(event);
      this.spoken(`speech_${word.speech_id}`, word.text ?? "", word.start);
      this.onAgent?.();
    });
    stream.addEventListener("turn.agent", (event) => {
      const turn = data(event);
      this.said(`speech_${turn.speech_id}`, turn.text ?? "", true);
      this.onAgent?.();
    });
    stream.addEventListener("tool.call", (event) => {
      const tool = data(event);
      this.mark(`→ ${tool.name}(${JSON.stringify(tool.arguments ?? {})})`);
    });
    stream.addEventListener("tool.result", (event) => {
      const result = data(event);
      this.mark(`← ${result.name}: ${result.error ?? JSON.stringify(result.output ?? "").slice(0, 120)}`);
    });
    stream.addEventListener("call.ended", (event) => {
      this.mark(`— ended: ${data(event).reason ?? ""}`, true);
      this.stop();
      this.onEnd?.();
    });
  }

  /** What was typed, on screen at once and greyed; the log's turn.user settles that same line. */
  typed(text) {
    this.hearing = this.line("user interim", text);
  }

  /** The typed line, taken back: the message never left. */
  untyped() {
    this.hearing?.remove();
    this.hearing = null;
  }

  stop() {
    this.stream?.close();
    this.stream = null;
    for (const item of this.lines.values()) item.pace?.timers.forEach(clearTimeout);
  }

  /**
   * One word of the agent's, as the voice measured it. The log gets the words as the voice
   * generates them, seconds before they play, each with its start on the speech's own clock;
   * the word is shown at that second, counted from the first word's arrival, which is when the
   * speech starts to play. A word with no timing is shown as it comes.
   */
  spoken(key, text, start) {
    let item = this.lines.get(key);
    if (!item) {
      item = this.line("agent interim", "");
      this.lines.set(key, item);
      item.pace = { anchor: performance.now(), last: 0, timers: [] };
    }
    const pace = item.pace;
    const show = () => {
      item.textContent += text;
      this.scroll();
    };
    const due = typeof start === "number" ? Math.max(pace.anchor + start * 1000, pace.last) : performance.now();
    pace.last = due;
    const wait = due - performance.now();
    if (wait <= 0) show();
    else pace.timers.push(setTimeout(show, wait));
  }

  /** The agent's whole turn, as the log closes it: whatever is still due is dropped for the text. */
  said(key, text, final) {
    let item = this.lines.get(key);
    if (!item) {
      item = this.line("agent", "");
      this.lines.set(key, item);
    }
    item.pace?.timers.forEach(clearTimeout);
    item.pace = null;
    item.className = `agent${final ? "" : " interim"}`;
    item.textContent = text;
    this.scroll();
  }

  mark(text, always = false) {
    const item = this.line("mark", text);
    if (!always) {
      item.dataset.tool = "1";
      item.hidden = !this.showTools();
    }
  }

  line(className, text) {
    const item = document.createElement("li");
    item.className = className;
    item.textContent = text;
    this.list.append(item);
    this.scroll();
    return item;
  }

  tools(shown) {
    for (const item of this.list.querySelectorAll("li[data-tool]")) item.hidden = !shown;
  }

  scroll() {
    this.list.scrollTop = this.list.scrollHeight;
  }
}

class PinecallWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.room = null;
    this.streamLines = new Map();
    this.transcript = null;
    this.phonePoll = null;
  }

  /** The log endpoint with the agent on it: the same endpoint serves every agent of the org. */
  log(query) {
    return `${this.logUrl}${this.logUrl.includes("?") ? "&" : "?"}agent=${encodeURIComponent(this.agent)}&${query}`;
  }

  connectedCallback() {
    this.agent = this.getAttribute("agent") ?? "";
    this.name = this.getAttribute("name") ?? "Assistant";
    this.company = this.getAttribute("company") ?? "";
    this.tagline = this.getAttribute("tagline") ?? "";
    this.phone = this.getAttribute("phone") ?? "";
    this.logUrl = this.getAttribute("log-url") ?? "";
    const label = this.getAttribute("label") ?? `Talk to ${this.name}`;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <button class="fab" part="button">${ICONS.spark}<span>${label}</span></button>
      <section class="panel" part="panel" hidden>
        <header>
          <div><h2>${this.name}</h2><p>${[this.company, this.tagline].filter(Boolean).join(" · ")}</p></div>
          <button class="close" aria-label="Close">×</button>
        </header>
        <div class="body"></div>
        <footer></footer>
      </section>`;
    this.$ = (selector) => this.shadowRoot.querySelector(selector);
    this.$(".fab").addEventListener("click", () => this.toggle());
    this.$(".close").addEventListener("click", () => this.hide());
    this.menu();
  }

  toggle() {
    const panel = this.$(".panel");
    if (panel.hidden) {
      panel.hidden = false;
      this.dispatchEvent(new CustomEvent("pinecall:open"));
    } else {
      this.hide();
    }
  }

  async hide() {
    await this.leave();
    this.$(".panel").hidden = true;
    this.menu();
  }

  showTools() {
    try {
      return localStorage.getItem(TOOLS_SETTING) === "1";
    } catch {
      return false;
    }
  }

  // ── the three ways ────────────────────────────────────────────────────────────

  menu() {
    this.$(".panel").classList.remove("wide");
    const body = this.$(".body");
    body.innerHTML = `
      ${this.phone ? `<button class="option call"><span class="icon">${ICONS.phone}</span>
        <span><b>Call us</b><span>${this.phone}</span></span></button>` : ""}
      <button class="option talk"><span class="icon">${ICONS.mic}</span>
        <span><b>Talk in your browser</b><span>Speak with ${this.name} now, no phone needed</span></span></button>
      <button class="option chat"><span class="icon">${ICONS.chat}</span>
        <span><b>Chat</b><span>Type, and ${this.name} answers</span></span></button>`;
    this.$("footer").innerHTML = `<span class="status">${[this.company, `${this.name} answers right away`].filter(Boolean).join(" · ")}</span>`;
    body.querySelector(".call")?.addEventListener("click", () => this.callUs());
    body.querySelector(".talk").addEventListener("click", () => this.conversation("talk"));
    body.querySelector(".chat").addEventListener("click", () => this.conversation("chat"));
  }

  /** The footer of any view but the menu: back, the tools toggle when a log is there, an end. */
  footer(end) {
    const footer = this.$("footer");
    footer.innerHTML = `
      <button class="back">‹ Back</button>
      <span class="right">
        ${this.logUrl ? `<label class="toggle"><input type="checkbox" ${this.showTools() ? "checked" : ""}> Show tools</label>` : ""}
        ${end ? `<button class="btn danger end">${end}</button>` : ""}
      </span>`;
    footer.querySelector(".back").addEventListener("click", async () => {
      await this.leave();
      this.menu();
    });
    footer.querySelector(".toggle input")?.addEventListener("change", (event) => {
      try {
        localStorage.setItem(TOOLS_SETTING, event.target.checked ? "1" : "0");
      } catch {
        // a browser that keeps nothing still shows what it can
      }
      this.transcript?.tools(event.target.checked);
    });
    footer.querySelector(".end")?.addEventListener("click", () => this.leave(true));
  }

  /** "Call us": the number to dial, and the telephone call as it happens, off its log. */
  callUs() {
    this.$(".panel").classList.add("wide");
    const tel = this.phone.replace(/[^\d+]/g, "");
    this.$(".body").innerHTML = `
      <div class="number"><b>${this.phone}</b><a href="tel:${tel}">Call</a></div>
      <span class="status">${this.logUrl ? "Waiting for your call…" : `Call the number and ${this.name} picks up.`}</span>
      <ul class="lines"></ul>`;
    this.footer(null);
    if (!this.logUrl) return;
    this.transcript = new Transcript(this.$(".lines"), () => this.showTools());
    const openedAt = Date.now() / 1000 - 5;
    let showing = null;
    const poll = async () => {
      try {
        const answer = await fetch(this.log("list=1"));
        if (!answer.ok) throw new Error(`log: HTTP ${answer.status}`);
        const { calls } = await answer.json();
        const live = calls.find((call) => call.live);
        this.status(live ? `Live: ${this.name} is on the line.` : "Waiting for your call…", live ? "live" : "");
        const current = live ?? calls.find((call) => (call.started_at ?? 0) >= openedAt);
        if (current && showing !== current.call) {
          showing = current.call;
          this.transcript.follow(this.log(`call=${encodeURIComponent(current.call)}`));
          this.transcript.mark(`☎ a call from ${current.from}`, true);
        }
      } catch (failed) {
        this.status(failed.message, "failed");
      }
    };
    // Once a second: the list is cheap, and the caller is looking at the page while the phone rings.
    poll();
    this.phonePoll = setInterval(poll, 1000);
  }

  async conversation(scope) {
    this.$(".panel").classList.add("wide");
    const body = this.$(".body");
    body.innerHTML = `
      <span class="status">Connecting…</span>
      <ul class="lines"></ul>
      ${scope === "chat" ? `<div class="row"><input type="text" placeholder="Type a message and press Enter" autocomplete="off"><button class="btn send">Send</button></div>` : ""}`;
    this.footer(scope === "talk" ? "Hang up" : "End chat");
    if (scope === "chat") {
      const input = body.querySelector("input");
      const send = async () => {
        const text = input.value.trim();
        if (!text) return;
        // The words go on screen as they are typed, greyed until the log confirms the turn.
        input.value = "";
        const pending = this.logUrl ? null : `typed_${Date.now()}`;
        if (pending) this.draw(pending, "user interim", text, false);
        try {
          if (!this.room) await this.open("chat");
          this.transcript?.typed(text);
          await this.send(text);
          if (pending) this.draw(pending, "user", text, true);
        } catch (failed) {
          this.transcript?.untyped();
          if (pending) this.streamLines.get(pending)?.remove();
          input.value = text;
          this.status(failed.message, "failed");
        }
        input.focus();
      };
      body.querySelector(".send").addEventListener("click", send);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") send();
      });
    }
    try {
      await this.open(scope);
    } catch (failed) {
      this.status(failed.message, "failed");
    }
  }

  // ── the room ──────────────────────────────────────────────────────────────────

  async token(scope) {
    // A page that mints its own tokens — an app with the org's key on its server side already
    // wired, or a console holding a person's key — sets `tokenProvider`, a function of the scope
    // that resolves to the token door's JSON, and no token-url is needed.
    if (typeof this.tokenProvider === "function") return this.tokenProvider(scope, this.agent);
    const url = this.getAttribute("token-url");
    if (!url) throw new Error("pinecall-widget: token-url is missing");
    if (!this.agent) throw new Error("pinecall-widget: agent is missing");
    const answer = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: this.agent, scope }),
    });
    const minted = await answer.json().catch(() => ({}));
    if (!answer.ok) throw new Error(minted.detail ?? `token endpoint: HTTP ${answer.status}`);
    return minted;
  }

  async open(scope) {
    await this.leave();
    this.streamLines.clear();
    const minted = await this.token(scope);
    const room = new Room();
    this.room = room;
    this.greeted = new Promise((resolve) => {
      this.onGreeted = resolve;
    });
    if (this.logUrl) {
      this.transcript = new Transcript(this.$(".lines"), () => this.showTools());
      this.transcript.onAgent = () => this.onGreeted?.();
      this.transcript.onEnd = () => this.status("Ended.");
    } else {
      room.registerTextStreamHandler(TRANSCRIPTION, (reader, from) => this.read(reader, from.identity));
    }
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (scope !== "talk" || track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.style.display = "none";
      this.shadowRoot.append(element);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((element) => element.remove()));
    room.on(RoomEvent.Disconnected, () => {
      this.room = null;
      this.status("Ended.");
      this.dispatchEvent(new CustomEvent("pinecall:ended", { detail: { call: minted.call } }));
    });
    await room.connect(minted.server_url, minted.participant_token);
    // The log is asked for once the room is joined: the join is what makes the agent open the call.
    if (this.logUrl) this.transcript.follow(this.log(`call=${encodeURIComponent(minted.call)}`));
    if (scope === "talk") await room.localParticipant.setMicrophoneEnabled(true);
    this.status(scope === "talk" ? `Live. ${this.name} is listening.` : "Live.", "live");
    this.dispatchEvent(new CustomEvent("pinecall:started", { detail: { call: minted.call, scope } }));
    return minted.call;
  }

  async send(text) {
    if (!this.room) throw new Error("not connected");
    // What is typed before the agent has an ear on the room is dropped: wait for the greeting.
    await Promise.race([this.greeted, new Promise((resolve) => setTimeout(resolve, 8000))]);
    await this.room.localParticipant.sendText(text, { topic: CHAT });
  }

  /**
   * Leave whatever is open: the room, the log, the phone watch. Hanging up (`ended`) leaves the
   * room but keeps reading the log, so the call's last words and its end still reach the screen;
   * the button says so at once, and a disconnect that dawdles is not waited on.
   */
  async leave(ended = false) {
    const room = this.room;
    this.room = null;
    clearInterval(this.phonePoll);
    this.phonePoll = null;
    if (ended) {
      this.status("Hanging up…");
      const end = this.$("footer .end");
      if (end) end.disabled = true;
      const input = this.$(".body input");
      if (input) input.disabled = true;
    } else {
      this.transcript?.stop();
      this.transcript = null;
    }
    await Promise.race([room?.disconnect(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (ended) this.status("Ended.");
  }

  // ── the words off LiveKit's text streams, when there is no log to read ────────

  async read(reader, identity) {
    const id = reader.info.attributes?.[SEGMENT_ID] ?? reader.info.id;
    const who = this.room?.remoteParticipants.get(identity)?.kind === ParticipantKind.AGENT ? "agent" : "user";
    if (who === "agent") this.onGreeted?.();
    let text = "";
    for await (const chunk of reader) {
      text += chunk;
      this.draw(id, who, text, false);
    }
    this.draw(id, who, text, reader.info.attributes?.[TRANSCRIPTION_FINAL] === "true");
  }

  draw(id, who, text, final) {
    const list = this.$(".lines");
    if (!list) return;
    let line = this.streamLines.get(id);
    if (!line) {
      line = document.createElement("li");
      this.streamLines.set(id, line);
      list.append(line);
    }
    line.className = `${who}${final ? "" : " interim"}`;
    line.textContent = text;
    list.scrollTop = list.scrollHeight;
  }

  status(text, tone = "") {
    const status = this.$(".body .status");
    if (!status) return;
    status.textContent = text;
    status.className = `status ${tone}`;
  }
}

if (!customElements.get("pinecall-widget")) customElements.define("pinecall-widget", PinecallWidget);
