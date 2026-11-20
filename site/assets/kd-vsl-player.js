/*
 * <kd-vsl-player>  the KnowDrive VSL video player. One file, no dependencies.
 *
 *   <kd-vsl-player heading="RAG vs knowdrive: nine differences" poster="media/poster.jpg"
 *                  aspect="1824/1080" duration="241.6" play-at="73.5% 78%"
 *                  thumbs="media/thumbs.jpg" thumbs-cols="11" thumbs-interval="2" thumbs-width="192" thumbs-height="114"
 *                  cta-label="Start free" cta-href="https://knowdrive.ai/signup" cta-note="Put in a file. Ask it something."
 *                  storage-key="kd-vsl-builders">
 *     <source src="media/video-hevc.mp4"  type='video/mp4; codecs="hvc1.2.4.L120.B0, mp4a.40.2"' data-quality="1080p">
 *     <source src="media/video-1080p.mp4" type='video/mp4; codecs="avc1.640029, mp4a.40.2"'      data-quality="1080p">
 *     <source src="media/video-720p.mp4"  type='video/mp4; codecs="avc1.64001f, mp4a.40.2"'      data-quality="720p">
 *     <track kind="captions" srclang="en" label="English" src="media/captions.en.vtt">
 *     <script type="application/json" data-chapters>[{"t":0,"n":"","title":"Intro"},{"t":24.6,"n":"1","title":"Zero pipeline"}]</script>
 *   </kd-vsl-player>
 *
 * play-at puts the big play button somewhere other than the centre ("x% y%" of the frame), for a poster with words in the middle.
 * Sources are tried in the order written, per quality; the first one the browser can play wins.
 * end-title, cta-label, cta-href and cta-note fill the card shown after the last frame; alt-label and alt-href add a
 * quieter second link under its button (click reported as kdvsl:cta {where:"end-card-alt"}).
 * The page supplies the font: "Plus Jakarta Sans" unless --kd-font says otherwise (--kd-display for the end-card title).
 * Colours can be changed with the --kd-* properties on the element (--kd-cta-bg, --kd-cta-ink, --kd-cta-glow for the button).
 *
 * Methods:  play()  pause()  seek(seconds)  seekChapter(index)        Properties: currentTime, duration, chapters
 * Events (bubbling, on the element):
 *   kdvsl:play {first}   kdvsl:pause {at,watched}   kdvsl:chapter {index,n,title,by:"play"|"seek"}
 *   kdvsl:milestone {kind:"seconds", value:30}      30 seconds actually watched, seeking does not count
 *   kdvsl:milestone {kind:"percent", value:25|50|75|95}   the playhead crossed that point while playing
 *   kdvsl:ended {watched}   kdvsl:cta {where}
 * With the attribute `datalayer`, the same events are also pushed to window.dataLayer as kdvsl_<name>.
 *
 * Keys (when the player has focus): space/K play, arrows seek 5 s and volume, J/L 10 s, M mute, C captions,
 * F full screen, 1-9 jump to that difference, 0 back to the start, < > speed.
 */
(() => {
  if (customElements.get("kd-vsl-player")) return;

  const MARK = '<rect x="4.71" y="22.4" width="71.76" height="283.06" rx="35.88" ry="35.88"/><path d="M135.38,192.3l29.42-29.73,144.96,137.9c2.53,2.41.81,6.67-2.68,6.65l-81-.45c-7.19-.04-14.06-2.92-19.13-8.02l-71.83-72.26c-9.41-9.46-9.29-24.78.26-34.1Z"/><path d="M133.55,224.72l-39.3-37.25c-12.84-12.09-13.13-32.41-.63-44.86l109.34-108.91c8.35-8.32,19.68-12.94,31.46-12.84l105.98.91c6.94.06,13.82,1.17,20.43,3.28,30.06,9.63,107.24,43.47,106.92,134.62-.41,117.27-82.27,140.21-88.22,143.32-2.25,1.18-20.09,4.81-23.7,4.81-9.1,0-17.81-3.69-24.16-10.2l-33.84-35.16c-2.04-2.08-.56-5.58,2.36-5.56l30.64.23c9.43-2.37,74.21-16.99,73.36-89.79-.79-67.42-69.84-80.09-81.99-80.31l-46.95-.82-18.27.6c-10.6.35-20.68,4.65-28.25,12.07l-42.33,41.44-50.14,51.62c-5.07,5.22-7.52,14.36-7.32,19.58.28,7.3,4.62,13.23,4.62,13.23Z"/>';
  const ICON = {
    play: '<path d="M8 5.2v13.6L19.5 12z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor" stroke="none"/>',
    replay: '<path d="M4 4.5v5.5h5.5"/><path d="M4.8 10a8 8 0 1 1-.6 5"/>',
    vol: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.2 6.4a7.8 7.8 0 0 1 0 11.2"/>',
    volLow: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/>',
    mute: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    cc: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M10.6 10.2a2.4 2.4 0 1 0 0 3.6M17.2 10.2a2.4 2.4 0 1 0 0 3.6"/>',
    tune: '<path d="M4 7h8M18 7h2M4 17h2M12 17h8"/><circle cx="15" cy="7" r="2.6"/><circle cx="9" cy="17" r="2.6"/>',
    pip: '<rect x="3" y="5" width="18" height="14" rx="3"/><rect x="11.5" y="11" width="7" height="5.5" rx="1.3" fill="currentColor" stroke="none"/>',
    fs: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
    fsExit: '<path d="M8 4v4H4M16 4v4h4M8 20v-4H4M16 20v-4h4"/>',
    back: '<path d="M12 6l-6 6 6 6"/><path d="M19 6l-6 6 6 6"/>',
    fwd: '<path d="M12 6l6 6-6 6"/><path d="M5 6l6 6-6 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const svg = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
  const mark = (cls = "") => `<svg class="mk ${cls}" viewBox="0 16 472.45 296" aria-hidden="true">${MARK}</svg>`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (t) => {
    t = Math.max(0, Math.floor(t || 0));
    return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: carry on without it */ } },
  };
  try { CSS.registerProperty({ name: "--kd-a", syntax: "<angle>", inherits: false, initialValue: "0deg" }); } catch (e) { /* already registered, or not supported: the ring just stays still */ }

  const CSS_TEXT = `
    :host { display: block; --kd-accent: #b9affa; --kd-violet: #6c5ce7; --kd-ink: #f7f7fb; --kd-muted: #b6b3c9; --kd-bg: #0b0b12; --kd-panel: #161622; --kd-radius: 22px;
      font: 400 16px/normal var(--kd-font, "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif); letter-spacing: normal; text-align: start; color: var(--kd-ink); -webkit-font-smoothing: antialiased; }
    * { box-sizing: border-box; }
    button { font-family: inherit; }
    :focus-visible { outline: 2px solid var(--kd-accent); outline-offset: 2px; }
    .stage { position: relative; }
    .glow { position: absolute; left: -4%; top: -6%; width: 108%; height: 112%; filter: blur(56px) saturate(1.55); opacity: .62; pointer-events: none; transition: opacity .8s; }
    .ring { position: relative; padding: 1.5px; border-radius: calc(var(--kd-radius) + 1.5px);
      background: conic-gradient(from var(--kd-a, 0deg), rgba(185,175,250,.95), rgba(108,92,231,.22) 22%, rgba(185,175,250,.10) 50%, rgba(108,92,231,.32) 76%, rgba(185,175,250,.95));
      animation: kdspin 10s linear infinite; box-shadow: 0 44px 100px -34px rgba(0,0,0,.9); }
    .playing .ring { animation-play-state: paused; background: rgba(185,175,250,.2); }
    @keyframes kdspin { to { --kd-a: 360deg; } }
    .frame { position: relative; border-radius: var(--kd-radius); overflow: hidden; background: #05050a; aspect-ratio: var(--ar, 16/9); container-type: inline-size; outline: none; isolation: isolate; user-select: none; -webkit-user-select: none; }
    .frame:fullscreen { border-radius: 0; aspect-ratio: auto; width: 100vw; height: 100vh; }
    .frame:-webkit-full-screen { border-radius: 0; aspect-ratio: auto; width: 100vw; height: 100vh; }
    video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #05050a; display: block; }
    .hit { position: absolute; inset: 0; z-index: 4; cursor: pointer; }
    .idle .hit { cursor: none; }
    .i { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; display: block; }

    /* before the first play */
    .poster { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; background: #05050a center / cover no-repeat; cursor: pointer; transition: opacity .5s, visibility .5s; }
    .poster::after { content: ""; position: absolute; inset: 0; background: radial-gradient(110% 90% at 50% 50%, rgba(11,11,18,0) 32%, rgba(11,11,18,.5) 100%), linear-gradient(to top, rgba(11,11,18,.82), rgba(11,11,18,0) 36%); }
    .started .poster { opacity: 0; visibility: hidden; pointer-events: none; }
    .center { position: absolute; left: var(--px, 50%); top: var(--py, 50%); transform: translate(-50%, -50%); z-index: 1; display: flex; flex-direction: column; align-items: center; gap: clamp(10px, 1.6cqw, 18px); }
    .big { position: relative; width: clamp(54px, 9.2cqw, 116px); aspect-ratio: 1; border-radius: 50%; border: 0; padding: 0; background: var(--kd-accent); color: var(--kd-bg); display: grid; place-items: center; cursor: pointer;
      transition: transform .28s cubic-bezier(.2,.9,.3,1.4), box-shadow .28s; box-shadow: 0 20px 54px -10px rgba(108,92,231,.85), 0 0 0 clamp(6px, .9cqw, 11px) rgba(185,175,250,.18); }
    .big .i { width: 46%; height: 46%; }   /* no sideways nudge: the triangle is already drawn so its centre of mass sits on the icon's centre */
    .big::before, .big::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--kd-accent); opacity: 0; animation: kdping 2.8s cubic-bezier(.2,.6,.3,1) infinite; pointer-events: none; }
    .big::after { animation-delay: 1.4s; }
    @keyframes kdping { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(1.95); opacity: 0; } }
    .poster:hover .big, .big:focus-visible { transform: scale(1.08); box-shadow: 0 24px 60px -8px rgba(108,92,231,1), 0 0 0 clamp(8px, 1.1cqw, 14px) rgba(185,175,250,.24); }
    .resume { appearance: none; border: 1.5px solid rgba(247,247,251,.34); background: rgba(11,11,18,.62); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--kd-ink); border-radius: 999px; padding: 8px 16px;
      font-weight: 700; font-size: clamp(12px, 1.3cqw, 15px); cursor: pointer; display: none; }
    .resume:hover { border-color: var(--kd-accent); }
    .can-resume .resume { display: inline-block; }
    .meta { position: absolute; left: clamp(16px, 3cqw, 38px); right: clamp(16px, 3cqw, 38px); bottom: clamp(14px, 2.6cqw, 32px); z-index: 1; display: flex; flex-direction: column; gap: clamp(3px, .5cqw, 7px); pointer-events: none; }
    .meta b { font-weight: 800; font-size: clamp(16px, 2.4cqw, 30px); letter-spacing: -.02em; line-height: 1.15; }
    .meta span { font-weight: 600; font-size: clamp(11.5px, 1.25cqw, 15px); color: var(--kd-muted); display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; }
    .meta span i { font-style: normal; display: inline-flex; align-items: center; gap: 6px; }
    .meta span i::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--kd-accent); }

    /* controls */
    .shade { position: absolute; left: 0; right: 0; bottom: 0; height: 44%; z-index: 6; pointer-events: none; opacity: 0; transition: opacity .3s;
      background: linear-gradient(to top, rgba(5,5,10,.9), rgba(5,5,10,.5) 46%, rgba(5,5,10,0)); }
    .controls { position: absolute; left: 0; right: 0; bottom: 0; z-index: 8; padding: 0 clamp(10px, 1.7cqw, 22px) clamp(6px, 1.1cqw, 14px); opacity: 0; transform: translateY(10px); pointer-events: none; transition: opacity .25s, transform .25s; }
    .started .controls { opacity: 1; transform: none; pointer-events: auto; }
    .started .shade { opacity: 1; }
    .started.idle .controls { opacity: 0; transform: translateY(10px); pointer-events: none; }
    .started.idle .shade { opacity: 0; }
    .bar { position: relative; height: 24px; display: flex; align-items: center; cursor: pointer; touch-action: none; outline-offset: 0; border-radius: 6px; }
    .segs { position: relative; width: 100%; height: 5px; transition: height .12s; }
    .bar:hover .segs, .bar.scrub .segs { height: 8px; }
    .seg { position: absolute; top: 0; height: 100%; padding-right: 3px; }
    .seg:last-child { padding-right: 0; }
    .seg > span { display: block; position: relative; height: 100%; border-radius: 4px; background: rgba(247,247,251,.24); overflow: hidden; transition: transform .12s; }
    .seg.hot > span { transform: scaleY(1.45); }
    .seg u { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; transform: scaleX(0); }
    .seg .buf { background: rgba(247,247,251,.28); }
    .seg .fill { background: var(--kd-accent); }
    .knob { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 4px rgba(185,175,250,.4), 0 2px 10px rgba(0,0,0,.55); transform: scale(0); transition: transform .15s; pointer-events: none; }
    .bar:hover .knob, .bar.scrub .knob, .bar:focus-visible .knob { transform: scale(1); }
    .tip { position: absolute; bottom: 30px; left: 0; transform: translateX(-50%); pointer-events: none; opacity: 0; transition: opacity .12s; display: flex; flex-direction: column; align-items: center; gap: 7px; }
    .bar.tipon .tip, .bar.scrub .tip { opacity: 1; }
    .thumb { border-radius: 12px; border: 2px solid rgba(247,247,251,.92); background: #000 no-repeat; box-shadow: 0 16px 44px rgba(0,0,0,.65); }
    .tip-ch { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 13px; white-space: nowrap; text-shadow: 0 1px 4px rgba(0,0,0,.9); }
    .tip-t { font-weight: 700; font-size: 12px; font-variant-numeric: tabular-nums; background: rgba(11,11,18,.88); padding: 3px 9px; border-radius: 8px; }
    .num { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 7px; border: 1.5px solid var(--kd-accent); color: var(--kd-accent); font-weight: 800; font-size: 12px; line-height: 1; flex: none; }
    .num .i { width: 12px; height: 12px; }
    .row { display: flex; align-items: center; gap: clamp(0px, .4cqw, 6px); height: 46px; }
    .c { appearance: none; border: 0; background: transparent; color: var(--kd-ink); width: 42px; height: 42px; padding: 0; border-radius: 12px; display: grid; place-items: center; cursor: pointer; flex: none; transition: background .15s, transform .15s, color .15s; }
    .c:hover { background: rgba(247,247,251,.13); }
    .c:active { transform: scale(.9); }
    .c[aria-pressed="true"] { color: var(--kd-accent); }
    .c[hidden] { display: none; }
    .vol { display: flex; align-items: center; }
    .vol input { width: 0; opacity: 0; margin: 0; transition: width .2s, opacity .2s, margin .2s; }
    .vol:hover input, .vol:focus-within input { width: 74px; opacity: 1; margin: 0 10px 0 2px; }
    input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; cursor: pointer; outline-offset: 6px;
      background: linear-gradient(to right, var(--kd-ink) var(--v, 100%), rgba(247,247,251,.26) var(--v, 100%)); }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #fff; border: 0; }
    input[type=range]::-moz-range-thumb { width: 13px; height: 13px; border-radius: 50%; background: #fff; border: 0; }
    .time { font-weight: 700; font-size: 13.5px; font-variant-numeric: tabular-nums; margin: 0 10px 0 6px; white-space: nowrap; }
    .time em { font-style: normal; color: var(--kd-muted); }
    .now { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 6px 12px 6px 6px; border-radius: 12px; background: rgba(247,247,251,.09); font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; }
    .now .t { overflow: hidden; text-overflow: ellipsis; }
    .sp { flex: 1; min-width: 4px; }
    .menu { position: absolute; right: clamp(10px, 1.7cqw, 22px); bottom: 68px; z-index: 9; min-width: 232px; padding: 8px; border-radius: 16px; background: rgba(22,22,34,.93); -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
      border: 1px solid rgba(185,175,250,.24); box-shadow: 0 26px 64px rgba(0,0,0,.65); opacity: 0; transform: translateY(8px) scale(.98); transform-origin: bottom right; pointer-events: none; transition: opacity .16s, transform .16s; }
    .menu.open { opacity: 1; transform: none; pointer-events: auto; }
    .menu h4 { margin: 6px 8px 5px; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--kd-muted); }
    .opts { display: flex; gap: 5px; padding: 0 4px 8px; flex-wrap: wrap; }
    .opt { appearance: none; border: 1.5px solid transparent; background: rgba(247,247,251,.08); color: var(--kd-ink); font-weight: 700; font-size: 13px; padding: 7px 11px; border-radius: 10px; cursor: pointer; }
    .opt:hover { background: rgba(247,247,251,.15); }
    .opt[aria-checked="true"] { border-color: var(--kd-accent); color: var(--kd-accent); background: rgba(185,175,250,.13); }

    /* over the picture */
    .caps { position: absolute; left: 50%; bottom: clamp(70px, 10cqw, 104px); transform: translateX(-50%); z-index: 7; width: max-content; max-width: min(84%, 44em); text-align: center; pointer-events: none; transition: bottom .25s;
      font-weight: 700; font-size: clamp(14px, 2.05cqw, 27px); line-height: 1.32; }
    .caps span { display: inline-block; padding: .26em .7em .3em; border-radius: .5em; background: rgba(11,11,18,.84); text-wrap: balance; box-shadow: 0 8px 26px rgba(0,0,0,.4); }
    .caps:empty, .caps.off { display: none; }
    .idle .caps { bottom: clamp(18px, 3cqw, 38px); }
    .bezel { position: absolute; left: 50%; top: 50%; width: 88px; height: 88px; margin: -44px; border-radius: 50%; background: rgba(11,11,18,.62); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); display: grid; place-items: center; z-index: 7; opacity: 0; pointer-events: none; }
    .bezel .i { width: 40px; height: 40px; }
    .bezel.go { animation: kdbez .6s ease-out; }
    @keyframes kdbez { 0% { opacity: .95; transform: scale(.7); } 100% { opacity: 0; transform: scale(1.3); } }
    .spin { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px; border-radius: 50%; border: 4px solid rgba(247,247,251,.18); border-top-color: var(--kd-accent); animation: kdrot .8s linear infinite; z-index: 7; opacity: 0; transition: opacity .2s .2s; pointer-events: none; }
    .waiting.started .spin { opacity: 1; }
    @keyframes kdrot { to { transform: rotate(360deg); } }
    .oops { position: absolute; inset: 0; z-index: 11; display: none; place-items: center; text-align: center; padding: 8%; background: rgba(8,8,14,.9); font-weight: 700; font-size: clamp(14px, 1.7cqw, 19px); color: var(--kd-muted); }
    .failed .oops { display: grid; }
    .oops a { color: var(--kd-accent); }

    /* after the last frame */
    .end { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; text-align: center; padding: 5%; background: rgba(8,8,14,.74); -webkit-backdrop-filter: blur(18px) saturate(1.2); backdrop-filter: blur(18px) saturate(1.2);
      opacity: 0; visibility: hidden; transition: opacity .45s, visibility .45s; }
    .ended .end { opacity: 1; visibility: visible; }
    .end-in { display: flex; flex-direction: column; align-items: center; gap: clamp(10px, 1.7cqw, 22px); transform: translateY(14px); transition: transform .5s cubic-bezier(.2,.8,.2,1); }
    .ended .end-in { transform: none; }
    .mk { fill: var(--kd-ink); display: block; }
    .end .mk { width: clamp(42px, 6cqw, 78px); height: auto; }
    .end h3 { margin: 0; font-family: var(--kd-display, inherit); font-weight: 800; letter-spacing: -.025em; line-height: 1.1; font-size: clamp(20px, 3.5cqw, 46px); }
    .end p { margin: 0; color: var(--kd-muted); font-weight: 600; font-size: clamp(13px, 1.55cqw, 19px); }
    .end-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; align-items: center; margin-top: clamp(2px, .6cqw, 8px); }
    .cta { display: inline-flex; align-items: center; gap: 10px; padding: clamp(11px, 1.35cqw, 17px) clamp(20px, 2.5cqw, 34px); border-radius: 999px; background: var(--kd-cta-bg, var(--kd-accent)); color: var(--kd-cta-ink, var(--kd-bg)); font-weight: 800; font-size: clamp(15px, 1.65cqw, 20px);
      text-decoration: none; box-shadow: 0 16px 44px -8px var(--kd-cta-glow, rgba(108,92,231,.9)); transition: transform .2s, box-shadow .2s; }
    .cta:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 20px 50px -6px var(--kd-cta-glow, rgba(108,92,231,1)); }
    .alt { color: var(--kd-muted); font-weight: 600; font-size: clamp(12px, 1.35cqw, 16px); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(182,179,201,.5); }
    .alt:hover { color: var(--kd-ink); }
    .cta .i { width: 20px; height: 20px; stroke-width: 2.4; }
    .again { appearance: none; background: transparent; border: 1.5px solid rgba(247,247,251,.32); color: var(--kd-ink); padding: clamp(9px, 1.1cqw, 14px) clamp(16px, 1.8cqw, 24px); border-radius: 999px; font-weight: 700; font-size: clamp(13px, 1.4cqw, 16px); cursor: pointer; display: inline-flex; gap: 8px; align-items: center; }
    .again:hover { border-color: var(--kd-accent); color: var(--kd-accent); }
    .again .i { width: 18px; height: 18px; }

    /* chapters under the frame: the video's nine pips, with names */
    .chapters { position: relative; display: flex; justify-content: flex-start; justify-content: safe center; gap: 8px; margin-top: clamp(12px, 1.6vw, 18px); padding: 3px; overflow-x: auto; scrollbar-width: none; }
    .chapters::-webkit-scrollbar { display: none; }
    .ch { appearance: none; position: relative; flex: none; display: flex; align-items: center; height: 46px; padding: 0 7px; border-radius: 14px; border: 1.5px solid rgba(182,179,201,.3); background: var(--kd-panel); color: var(--kd-muted);
      font-weight: 700; font-size: 14px; cursor: pointer; overflow: hidden; transition: border-color .25s, color .25s, background .25s; }
    .ch:hover { border-color: rgba(185,175,250,.75); color: var(--kd-ink); }
    .ch .n { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 9px; font-weight: 800; font-size: 15px; color: var(--kd-accent); flex: none; transition: background .25s, color .25s; }
    .ch .n .i { width: 15px; height: 15px; }
    .ch .t { max-width: 0; opacity: 0; margin: 0; white-space: nowrap; overflow: hidden; transition: max-width .4s cubic-bezier(.2,.8,.2,1), opacity .3s, margin .4s cubic-bezier(.2,.8,.2,1); }
    .ch.on { border-color: var(--kd-accent); color: var(--kd-ink); }
    .ch.on .t { max-width: 260px; opacity: 1; margin: 0 9px 0 7px; }
    .ch.done .n { background: var(--kd-accent); color: var(--kd-bg); }
    .ch::after { content: ""; position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; transform-origin: left center; transform: scaleX(var(--p, 0)); background: var(--kd-accent); }

    @container (max-width: 640px) {
      .center { flex-direction: row-reverse; }
      .resume { padding: 6px 12px; }
      .now, .vol input, .pipb { display: none; }
      .c { width: 38px; height: 38px; }
      .time { font-size: 12.5px; margin: 0 6px 0 2px; }
      .thumb { transform: scale(.72); transform-origin: bottom center; }
      .meta span i:nth-child(n+3) { display: none; }
    }
    @container (max-width: 480px) {
      /* a phone-sized frame: the end card keeps its title, its buttons and the second link */
      .end { padding: 3% 4%; }
      .end .mk, .end p { display: none; }
      .end-in { gap: 9px; }
      .end h3 { font-size: 19px; }
      .end-btns { gap: 8px; margin-top: 0; }
      .cta { padding: 10px 16px; font-size: 14.5px; gap: 8px; }
      .cta .i { width: 17px; height: 17px; }
      .again { padding: 8px 12px; font-size: 13px; gap: 6px; }
      .again .i { width: 15px; height: 15px; }
      .alt { font-size: 12.5px; }
    }
    @container (max-width: 420px) { .meta b { display: none; } }
    @media (prefers-reduced-motion: reduce) {
      .ring, .big::before, .big::after { animation: none; }
      .ch .t, .end-in, .controls { transition: none; }
    }
  `;

  class KdVslPlayer extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this._setup(), { once: true });
      else this._setup();
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._idleT);
      if (this._onFs) {
        document.removeEventListener("fullscreenchange", this._onFs);
        document.removeEventListener("webkitfullscreenchange", this._onFs);
      }
    }

    /* ── public ─────────────────────────────────────────────────────────────── */
    get currentTime() { return this.video ? this.video.currentTime : 0; }
    get duration() { return this.dur || 0; }
    play() { if (!this.video) return; this._start(); const p = this.video.play(); if (p && p.catch) p.catch(() => {}); }
    pause() { if (this.video) this.video.pause(); }
    seek(t) { if (!this.video) return; this.video.currentTime = clamp(t, 0, Math.max(0, this.dur - 0.05)); this._update(); }
    seekChapter(i, andPlay = true) {
      const c = this.chapters[i];
      if (!c) return;
      this.root.classList.remove("ended");
      this.seek(c.t + 0.01);
      if (andPlay) this.play();
    }

    /* ── set-up ─────────────────────────────────────────────────────────────── */
    _setup() {
      if (this._ready) return;
      this._ready = true;
      const a = (k, d = "") => (this.hasAttribute(k) ? this.getAttribute(k) : d);
      this.cfg = {
        poster: a("poster"), thumbs: a("thumbs"), tCols: +a("thumbs-cols", "10"), tInt: +a("thumbs-interval", "2"), tW: +a("thumbs-width", "192"), tH: +a("thumbs-height", "108"),
        heading: a("heading"), playAt: a("play-at"), ctaLabel: a("cta-label"), ctaHref: a("cta-href"), ctaNote: a("cta-note"), altLabel: a("alt-label"), altHref: a("alt-href"), endTitle: a("end-title"), key: a("storage-key", "kd-vsl"), aspect: a("aspect", "16/9"),
      };
      this.dur = parseFloat(a("duration", "0")) || 0;
      this.sources = [...this.querySelectorAll("source")].map((s) => ({ src: s.getAttribute("src"), type: s.getAttribute("type") || "video/mp4", q: s.dataset.quality || "Auto", h: parseInt(s.dataset.quality, 10) || 0 }));
      const tr = this.querySelector("track");
      this.trackCfg = tr ? { src: tr.getAttribute("src"), lang: tr.getAttribute("srclang") || "en", label: tr.getAttribute("label") || "Captions" } : null;
      try { this.chapters = JSON.parse(this.querySelector("script[data-chapters]").textContent) || []; } catch (e) { this.chapters = []; }
      if (!this.chapters.length) this.chapters = [{ t: 0, n: "", title: this.cfg.heading || "Video" }];
      this.bad = new Set();
      this.fired = new Set();
      this.chIndex = -1;
      this.watched = 0;
      this.reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      this._render();
      this._wire();
      this._chooseQuality();
      this._restore();
      this._layoutSegs();
      this._setChapter(0, true);
      this._update();
    }

    _render() {
      const c = this.cfg;
      const root = this.attachShadow({ mode: "open" });
      const chapters = this.chapters.map((ch, i) => `<button class="ch" type="button" data-i="${i}" title="${esc(ch.title)}" aria-label="${esc((ch.n && ch.n !== "=" ? ch.n + ". " : "") + ch.title)}"><span class="n">${ch.n ? esc(ch.n) : svg("play")}</span><span class="t">${esc(ch.title)}</span></button>`).join("");
      const numbered = this.chapters.filter((ch) => /^\d+$/.test(ch.n || "")).length;
      const end = c.ctaHref
        ? `${mark()}<h3>${esc(c.endTitle || c.ctaLabel || "")}</h3>${c.ctaNote ? `<p>${esc(c.ctaNote)}</p>` : ""}<div class="end-btns"><a class="cta" href="${esc(c.ctaHref)}">${esc(c.ctaLabel || "Continue")}${svg("arrow")}</a><button class="again" type="button">${svg("replay")}Watch again</button></div>${c.altHref && c.altLabel ? `<a class="alt" href="${esc(c.altHref)}">${esc(c.altLabel)}</a>` : ""}`
        : `${mark()}<div class="end-btns"><button class="again" type="button">${svg("replay")}Watch again</button></div>`;
      root.innerHTML = `<style>${CSS_TEXT}</style>
        <div class="wrap">
          <div class="stage">
            <canvas class="glow" width="64" height="38" aria-hidden="true"></canvas>
            <div class="ring">
              <div class="frame" tabindex="0" role="region" aria-label="${esc(c.heading || "Video")} (video player)">
                <video playsinline preload="metadata"${c.poster ? ` poster="${esc(c.poster)}"` : ""}></video>
                <div class="hit"></div>
                <div class="poster"${c.poster ? ` style="background-image:url('${esc(c.poster)}')"` : ""}>
                  <div class="center">
                    <button class="big" type="button" aria-label="Play video">${svg("play")}</button>
                    <button class="resume" type="button"></button>
                  </div>
                  <div class="meta">${c.heading ? `<b>${esc(c.heading)}</b>` : ""}<span><i class="m-dur"></i>${numbered ? `<i>${numbered} chapters</i>` : ""}${this.trackCfg ? "<i>Captions</i>" : ""}</span></div>
                </div>
                <div class="caps off" aria-hidden="true"></div>
                <div class="bezel"></div>
                <div class="spin"></div>
                <div class="shade"></div>
                <div class="controls">
                  <div class="bar" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0">
                    <div class="segs"></div>
                    <div class="knob"></div>
                    <div class="tip"><div class="thumb"></div><div class="tip-ch"></div><div class="tip-t"></div></div>
                  </div>
                  <div class="row">
                    <button class="c playb" type="button" aria-label="Play">${svg("play")}</button>
                    <div class="vol"><button class="c muteb" type="button" aria-label="Mute" aria-pressed="false">${svg("vol")}</button><input class="volr" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></div>
                    <div class="time"><span class="cur">0:00</span> <em>/ <span class="tot">0:00</span></em></div>
                    <div class="now"><span class="num"></span><span class="t"></span></div>
                    <span class="sp"></span>
                    <button class="c ccb" type="button" aria-label="Captions" aria-pressed="false"${this.trackCfg ? "" : " hidden"}>${svg("cc")}</button>
                    <button class="c setb" type="button" aria-label="Speed and quality" aria-haspopup="true" aria-expanded="false">${svg("tune")}</button>
                    <button class="c pipb" type="button" aria-label="Picture in picture">${svg("pip")}</button>
                    <button class="c fsb" type="button" aria-label="Full screen">${svg("fs")}</button>
                  </div>
                </div>
                <div class="menu" role="menu" aria-label="Speed and quality"></div>
                <div class="end"><div class="end-in">${end}</div></div>
                <div class="oops"><div>This video could not be played here.${this.sources.length ? ` <a href="${esc(this.sources[this.sources.length - 1].src)}">Open the file</a>` : ""}</div></div>
              </div>
            </div>
          </div>
          <nav class="chapters" aria-label="Chapters">${chapters}</nav>
        </div>`;
      const $ = (s) => root.querySelector(s);
      this.root = $(".wrap");
      Object.assign(this, {
        frame: $(".frame"), video: $("video"), glow: $(".glow"), posterEl: $(".poster"), caps: $(".caps"), bezel: $(".bezel"), bar: $(".bar"), segsEl: $(".segs"), knob: $(".knob"),
        tip: $(".tip"), thumb: $(".thumb"), tipCh: $(".tip-ch"), tipT: $(".tip-t"), playB: $(".playb"), muteB: $(".muteb"), volR: $(".volr"), curEl: $(".cur"), totEl: $(".tot"),
        nowEl: $(".now"), ccB: $(".ccb"), setB: $(".setb"), pipB: $(".pipb"), fsB: $(".fsb"), menu: $(".menu"), nav: $(".chapters"), resumeB: $(".resume"), durEl: $(".m-dur"),
      });
      this.chEls = [...root.querySelectorAll(".ch")];
      this.frame.style.setProperty("--ar", c.aspect);
      const at = (c.playAt || "").trim().split(/\s+/);
      if (at.length === 2) {
        this.posterEl.style.setProperty("--px", at[0]);
        this.posterEl.style.setProperty("--py", at[1]);
      }
      if (c.thumbs) {
        this.thumb.style.width = c.tW + "px";
        this.thumb.style.height = c.tH + "px";
        this.thumb.style.backgroundImage = `url('${c.thumbs}')`;
        this.thumb.style.backgroundSize = `${c.tCols * c.tW}px auto`;
      } else this.thumb.style.display = "none";
      if (!document.pictureInPictureEnabled || !this.video.requestPictureInPicture) this.pipB.hidden = true;
      this.gctx = this.glow.getContext("2d");
      if (c.poster) {
        const img = new Image();
        img.onload = () => { if (!this.root.classList.contains("started")) this._paintGlow(img); };
        img.src = c.poster;
      }
      if (this.trackCfg) {
        const t = document.createElement("track");
        t.kind = "captions"; t.srclang = this.trackCfg.lang; t.label = this.trackCfg.label; t.src = this.trackCfg.src;
        this.video.appendChild(t);
        this.textTrack = t.track;
        this.textTrack.mode = "hidden";
        this.textTrack.addEventListener("cuechange", () => this._cue());
      }
    }

    _wire() {
      const v = this.video, root = this.root;
      const on = (el, ev, fn, opt) => el.addEventListener(ev, fn, opt);
      // starting
      on(this.posterEl, "click", (e) => { if (e.target === this.resumeB) return; this.play(); });
      on(this.resumeB, "click", () => { this.seek(this._resumeAt || 0); this.play(); });
      on(this.posterEl, "pointerenter", () => { v.preload = "auto"; }, { once: true });
      // picture
      on(root.querySelector(".hit"), "click", () => {
        if (this._touch && root.classList.contains("idle")) { this._wake(); return; }
        this._toggle(true);
      });
      on(root.querySelector(".hit"), "dblclick", () => this._fullscreen());
      on(this.frame, "pointerdown", (e) => { this._touch = e.pointerType === "touch"; });
      on(this.frame, "pointermove", () => this._wake());
      on(this.frame, "pointerleave", () => { if (!v.paused) this._sleepSoon(700); });
      on(this.frame, "focusin", () => this._wake());
      on(this.frame, "keydown", (e) => this._key(e));
      // buttons
      on(this.playB, "click", () => this._toggle(false));
      on(this.muteB, "click", () => { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.6; });
      on(this.volR, "input", () => { v.volume = +this.volR.value; v.muted = v.volume === 0; });
      on(this.ccB, "click", () => this._captions(!this.capsOn));
      on(this.setB, "click", (e) => { e.stopPropagation(); this._menu(!this.menu.classList.contains("open")); });
      on(this.menu, "click", (e) => {
        const b = e.target.closest(".opt");
        if (!b) return;
        if (b.dataset.rate) v.playbackRate = +b.dataset.rate;
        if (b.dataset.q) this._setQuality(b.dataset.q, true);
        this._buildMenu();
      });
      on(this.pipB, "click", () => {
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else { this._start(); v.requestPictureInPicture().catch(() => {}); }
      });
      on(this.fsB, "click", () => this._fullscreen());
      on(root.querySelector(".again"), "click", () => { root.classList.remove("ended"); this.seek(0); this.play(); });
      const cta = root.querySelector(".cta");
      if (cta) on(cta, "click", () => this._emit("cta", { where: "end-card" }));
      const alt = root.querySelector(".alt");
      if (alt) on(alt, "click", () => this._emit("cta", { where: "end-card-alt" }));
      on(this.nav, "click", (e) => { const b = e.target.closest(".ch"); if (b) this.seekChapter(+b.dataset.i); });
      on(document, "click", (e) => { if (this.menu.classList.contains("open") && !e.composedPath().includes(this.menu)) this._menu(false); });
      // scrubbing
      on(this.bar, "pointerdown", (e) => {
        if (e.button) return;
        this.bar.setPointerCapture(e.pointerId);
        this._scrub = true;
        this.bar.classList.add("scrub");
        this._tip(e);
        this.seek(this._xToTime(e));
      });
      on(this.bar, "pointermove", (e) => { this._tip(e); if (this._scrub) this.seek(this._xToTime(e)); });
      const stop = () => { this._scrub = false; this.bar.classList.remove("scrub"); this._wake(); };
      on(this.bar, "pointerup", stop);
      on(this.bar, "pointercancel", stop);
      on(this.bar, "pointerleave", () => { this.bar.classList.remove("tipon"); this._hot(-1); });
      // the video itself
      on(v, "loadedmetadata", () => {
        if (isFinite(v.duration) && v.duration > 0) this.dur = v.duration;
        if (v.videoWidth) this.frame.style.setProperty("--ar", `${v.videoWidth}/${v.videoHeight}`);
        if (this.textTrack) this.textTrack.mode = "hidden";
        if (this._pending) { const p = this._pending; this._pending = null; v.currentTime = p.t; if (p.play) this.play(); }
        this._layoutSegs();
        this._update();
      });
      on(v, "play", () => {
        root.classList.add("playing");
        root.classList.remove("ended");
        this._icon(this.playB, "pause", "Pause");
        this._emit("play", { first: !this._played });
        this._played = true;
        this._loop();
        this._sleepSoon();
        this._glowLoop();
      });
      on(v, "pause", () => {
        root.classList.remove("playing");
        this._icon(this.playB, "play", "Play");
        if (!v.ended) this._emit("pause", { at: Math.round(v.currentTime), watched: Math.round(this.watched) });
        this._wake();
        this._save();
      });
      on(v, "ended", () => { root.classList.add("ended"); root.classList.remove("idle"); this._emit("ended", { watched: Math.round(this.watched) }); store.set(this.cfg.key + ":t", "0"); });
      on(v, "timeupdate", () => { if (v.paused) this._update(); });
      on(v, "seeking", () => { root.classList.remove("ended"); this._update(); });
      on(v, "seeked", () => { this._update(); if (v.paused) this._paintGlow(v); });
      on(v, "progress", () => this._update());
      on(v, "waiting", () => root.classList.add("waiting"));
      on(v, "playing", () => root.classList.remove("waiting"));
      on(v, "canplay", () => root.classList.remove("waiting"));
      on(v, "volumechange", () => this._volume());
      on(v, "ratechange", () => this._buildMenu());
      on(v, "error", () => this._failed());
      on(v, "enterpictureinpicture", () => this.pipB.setAttribute("aria-pressed", "true"));
      on(v, "leavepictureinpicture", () => this.pipB.setAttribute("aria-pressed", "false"));
      this._onFs = () => {
        const full = this.shadowRoot.fullscreenElement === this.frame || document.webkitFullscreenElement === this || document.webkitFullscreenElement === this.frame;
        this._icon(this.fsB, full ? "fsExit" : "fs", full ? "Exit full screen" : "Full screen");
      };
      document.addEventListener("fullscreenchange", this._onFs);
      document.addEventListener("webkitfullscreenchange", this._onFs);
      if (window.ResizeObserver) new ResizeObserver(() => this._update()).observe(this.frame);
    }

    /* ── sources and quality ────────────────────────────────────────────────── */
    _canPlay(s) {
      if (this.bad.has(s.src)) return false;
      const r = this.video.canPlayType(s.type);
      return /codecs/.test(s.type) ? r === "probably" : r !== "";
    }
    _qualities() {
      const seen = [];
      this.sources.forEach((s) => { if (this._canPlay(s) && !seen.some((q) => q.q === s.q)) seen.push({ q: s.q, h: s.h }); });
      return seen.sort((x, y) => y.h - x.h);
    }
    _chooseQuality() {
      const qs = this._qualities();
      if (!qs.length) { this._failed(true); return; }
      const saved = store.get(this.cfg.key + ":q");
      const conn = navigator.connection || {};
      const frugal = conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || "") || Math.min(screen.width, screen.height) < 600;
      const pick = qs.some((q) => q.q === saved) ? saved : (frugal ? qs[qs.length - 1] : qs[0]).q;
      this._setQuality(pick, false);
    }
    _setQuality(q, remember) {
      const s = this.sources.find((x) => x.q === q && this._canPlay(x));
      if (!s) return;
      const v = this.video;
      const t = v.currentTime || 0, playing = !v.paused && !v.ended;
      this.quality = q;
      this.current = s;
      if (remember) store.set(this.cfg.key + ":q", q);
      if (v.getAttribute("src") === s.src) return;
      if (t > 0.1 || playing) this._pending = { t, play: playing };
      v.src = s.src;
      this._buildMenu();
    }
    _failed(none) {
      // a source the browser said it could play, but could not: drop it and try the next one
      if (!none && this.current) {
        this.bad.add(this.current.src);
        const t = this.video.currentTime || (this._pending && this._pending.t) || 0;
        const next = this.sources.find((x) => x.q === this.quality && this._canPlay(x)) || this.sources.find((x) => this._canPlay(x));
        if (next) {
          this.quality = next.q;
          this.current = next;
          this._pending = { t, play: !!this._played };
          this.video.src = next.src;
          this._buildMenu();
          return;
        }
      }
      this.root.classList.add("failed", "started");
    }

    /* ── state from the last visit ──────────────────────────────────────────── */
    _restore() {
      const v = this.video;
      const vol = parseFloat(store.get("kd-vsl:vol"));
      if (isFinite(vol)) v.volume = clamp(vol, 0, 1);
      this._volume();
      this._captions(store.get("kd-vsl:cc") === "1", true);
      const t = parseFloat(store.get(this.cfg.key + ":t"));
      if (isFinite(t) && t > 10 && (!this.dur || t < this.dur - 15)) {
        this._resumeAt = t;
        this.resumeB.textContent = "Resume at " + fmt(t);
        this.root.classList.add("can-resume");
      }
      this._buildMenu();
    }
    _save() {
      const t = this.video.currentTime;
      if (this._played && isFinite(t)) store.set(this.cfg.key + ":t", String(Math.round(t)));
    }

    /* ── playing ────────────────────────────────────────────────────────────── */
    _start() {
      if (this.root.classList.contains("started")) return;
      this.root.classList.add("started");
      this.frame.focus({ preventScroll: true });
      if ("mediaSession" in navigator && window.MediaMetadata) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({ title: this.cfg.heading || document.title, artist: "KnowDrive", artwork: this.cfg.poster ? [{ src: new URL(this.cfg.poster, document.baseURI).href }] : [] });
        } catch (e) { /* not essential */ }
      }
    }
    _toggle(showBezel) {
      const v = this.video;
      if (!this.root.classList.contains("started")) { this.play(); return; }
      if (v.ended) { this.seek(0); this.play(); return; }
      if (v.paused) this.play(); else v.pause();
      if (showBezel) this._bezel(v.paused ? "play" : "pause");
    }
    _loop() {
      cancelAnimationFrame(this._raf);
      const tick = () => {
        this._update();
        if (!this.video.paused && !this.video.ended) this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
    _layoutSegs() {
      const d = this.dur || 1;
      this.segsEl.innerHTML = this.chapters.map((c, i) => {
        const a = clamp(c.t, 0, d), b = i + 1 < this.chapters.length ? clamp(this.chapters[i + 1].t, 0, d) : d;
        return `<div class="seg" style="left:${(a / d) * 100}%;width:${((b - a) / d) * 100}%"><span><u class="buf"></u><u class="fill"></u></span></div>`;
      }).join("");
      this.segEls = [...this.segsEl.children].map((el) => ({ el, buf: el.querySelector(".buf"), fill: el.querySelector(".fill") }));
      this.totEl.textContent = fmt(d);
      this.durEl.textContent = this.dur ? fmt(this.dur) : "";
      this.bar.setAttribute("aria-valuemax", String(Math.round(d)));
    }
    _bounds(i) {
      const d = this.dur || 1;
      return [this.chapters[i].t, i + 1 < this.chapters.length ? this.chapters[i + 1].t : d];
    }
    _chapterAt(t) {
      let k = 0;
      for (let i = 0; i < this.chapters.length; i++) if (t + 0.05 >= this.chapters[i].t) k = i;
      return k;
    }
    _update() {
      const v = this.video, d = this.dur || 1;
      // while a new source loads (quality switch) the element reports 0: keep showing where we are going
      const t = clamp(this._pending ? this._pending.t : v.currentTime || 0, 0, d);
      const step = t - (this._lastT == null ? t : this._lastT);
      const flowing = !v.paused && !this._pending && step > 0 && step < 1.5;
      this._lastT = t;
      if (flowing) this.watched += step;
      let bufEnd = 0;
      for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t + 0.5 && v.buffered.end(i) > bufEnd) bufEnd = v.buffered.end(i);
      (this.segEls || []).forEach((s, i) => {
        const [a, b] = this._bounds(i), len = Math.max(0.001, b - a);
        s.fill.style.transform = `scaleX(${clamp((t - a) / len, 0, 1)})`;
        s.buf.style.transform = `scaleX(${clamp((bufEnd - a) / len, 0, 1)})`;
      });
      this.knob.style.left = (t / d) * 100 + "%";
      const shown = fmt(t);
      if (shown !== this._shown) {
        this._shown = shown;
        this.curEl.textContent = shown;
        this.bar.setAttribute("aria-valuenow", String(Math.round(t)));
        this.bar.setAttribute("aria-valuetext", `${shown} of ${fmt(d)}`);
        if (Math.round(t) % 5 === 0 && !v.paused) this._save();
      }
      const i = this._chapterAt(t);
      if (i !== this.chIndex) this._setChapter(i, false, flowing ? "play" : "seek");
      const [a, b] = this._bounds(i);
      this.chEls[i].style.setProperty("--p", clamp((t - a) / Math.max(0.001, b - a), 0, 1).toFixed(3));
      if (flowing) {
        if (this.watched >= 30) this._milestone("seconds", 30);
        [25, 50, 75, 95].forEach((p) => { const at = (d * p) / 100; if (t >= at && t - step < at) this._milestone("percent", p); });
      }
    }
    _milestone(kind, value) {
      const k = kind + value;
      if (this.fired.has(k)) return;
      this.fired.add(k);
      this._emit("milestone", { kind, value });
    }
    _setChapter(i, quiet, by) {
      this.chIndex = i;
      const c = this.chapters[i];
      this.nowEl.innerHTML = `<span class="num">${c.n ? esc(c.n) : svg("play")}</span><span class="t">${esc(c.title)}</span>`;
      this.chEls.forEach((el, k) => {
        el.classList.toggle("on", k === i);
        el.classList.toggle("done", k < i);
        if (k !== i) el.style.setProperty("--p", k < i ? "1" : "0");
        if (k === i) el.setAttribute("aria-current", "true"); else el.removeAttribute("aria-current");
      });
      // keep the current chapter in view when the row scrolls (phones), without moving the page
      clearTimeout(this._navT);
      this._navT = setTimeout(() => {
        const el = this.chEls[this.chIndex], nav = this.nav;
        if (nav.scrollWidth <= nav.clientWidth + 2) return;
        const room = nav.clientWidth - el.offsetWidth;
        nav.scrollTo({ left: Math.max(0, el.offsetLeft - Math.max(12, Math.min(room / 2, 64))), behavior: this.reduce ? "auto" : "smooth" });
      }, quiet ? 0 : 430);
      if (!quiet && this._played) this._emit("chapter", { index: i, n: c.n || "", title: c.title, by: by || "seek" });
    }

    /* ── scrubber ───────────────────────────────────────────────────────────── */
    _xToTime(e) {
      const r = this.segsEl.getBoundingClientRect();
      return clamp((e.clientX - r.left) / r.width, 0, 1) * (this.dur || 0);
    }
    _hot(i) { (this.segEls || []).forEach((s, k) => s.el.classList.toggle("hot", k === i)); }
    _tip(e) {
      const r = this.segsEl.getBoundingClientRect(), t = this._xToTime(e), c = this.cfg;
      const i = this._chapterAt(t), ch = this.chapters[i];
      this._hot(i);
      this.bar.classList.add("tipon");
      this.tipT.textContent = fmt(t);
      this.tipCh.innerHTML = `<span class="num">${ch.n ? esc(ch.n) : svg("play")}</span>${esc(ch.title)}`;
      if (c.thumbs) {
        const k = Math.max(0, Math.floor(t / c.tInt));
        this.thumb.style.backgroundPosition = `-${(k % c.tCols) * c.tW}px -${Math.floor(k / c.tCols) * c.tH}px`;
      }
      const half = Math.min(this.tip.offsetWidth / 2 || 100, r.width / 2);
      this.tip.style.left = clamp(e.clientX - r.left, half, r.width - half) + "px";
    }

    /* ── chrome ─────────────────────────────────────────────────────────────── */
    _icon(btn, name, label) { btn.innerHTML = svg(name); btn.setAttribute("aria-label", label); btn.title = label; }
    _bezel(name) {
      this.bezel.innerHTML = svg(name);
      this.bezel.classList.remove("go");
      void this.bezel.offsetWidth;
      this.bezel.classList.add("go");
    }
    _volume() {
      const v = this.video, quiet = v.muted || v.volume === 0;
      this._icon(this.muteB, quiet ? "mute" : v.volume < 0.5 ? "volLow" : "vol", quiet ? "Unmute" : "Mute");
      this.muteB.setAttribute("aria-pressed", String(quiet));
      this.volR.value = quiet ? 0 : v.volume;
      this.volR.style.setProperty("--v", (quiet ? 0 : v.volume) * 100 + "%");
      if (!v.muted) store.set("kd-vsl:vol", String(v.volume));
    }
    _captions(onNow, quiet) {
      this.capsOn = !!onNow && !!this.textTrack;
      this.ccB.setAttribute("aria-pressed", String(this.capsOn));
      this.ccB.title = this.capsOn ? "Captions on" : "Captions off";
      this.caps.classList.toggle("off", !this.capsOn);
      if (!quiet) store.set("kd-vsl:cc", this.capsOn ? "1" : "0");
      this._cue();
    }
    _cue() {
      const cues = this.textTrack && this.textTrack.activeCues;
      const text = this.capsOn && cues && cues.length ? cues[cues.length - 1].text : "";
      this.caps.innerHTML = text ? `<span>${esc(text).replace(/\n/g, "<br>")}</span>` : "";
    }
    _buildMenu() {
      if (!this.menu) return;
      const rate = this.video.playbackRate, rates = [0.75, 1, 1.25, 1.5, 2];
      const qs = this._qualities();
      this.menu.innerHTML = `<h4>Speed</h4><div class="opts" role="group" aria-label="Speed">${rates.map((r) => `<button class="opt" type="button" role="menuitemradio" aria-checked="${r === rate}" data-rate="${r}">${r === 1 ? "Normal" : r + "×"}</button>`).join("")}</div>` +
        (qs.length > 1 ? `<h4>Quality</h4><div class="opts" role="group" aria-label="Quality">${qs.map((q) => `<button class="opt" type="button" role="menuitemradio" aria-checked="${q.q === this.quality}" data-q="${esc(q.q)}">${esc(q.q)}</button>`).join("")}</div>` : "");
    }
    _menu(open) {
      this.menu.classList.toggle("open", open);
      this.setB.setAttribute("aria-expanded", String(open));
      if (open) { this._buildMenu(); clearTimeout(this._idleT); } else this._sleepSoon();
    }
    _fullscreen() {
      const el = this.frame, d = document;
      const full = this.shadowRoot.fullscreenElement || d.webkitFullscreenElement;
      if (full) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (this.video.webkitEnterFullscreen) { this._start(); this.video.webkitEnterFullscreen(); }
    }
    _wake() {
      this.root.classList.remove("idle");
      this._sleepSoon();
    }
    _sleepSoon(ms = 2600) {
      clearTimeout(this._idleT);
      this._idleT = setTimeout(() => {
        const v = this.video;
        if (v.paused || v.ended || this._scrub || this.menu.classList.contains("open")) return;
        if (this.shadowRoot.activeElement && this.shadowRoot.activeElement !== this.frame && this.shadowRoot.activeElement.matches(":focus-visible")) return;
        this.root.classList.add("idle");
      }, ms);
    }
    _key(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.composedPath()[0], v = this.video, k = e.key;
      const onControl = target && target !== this.frame && /^(BUTTON|INPUT|A)$/.test(target.tagName);
      if (onControl && (k === " " || k === "Enter" || (target.tagName === "INPUT" && k.startsWith("Arrow")))) return;
      const step = (s) => { this._start(); this.seek(v.currentTime + s); this._bezel(s < 0 ? "back" : "fwd"); };
      let used = true;
      if (k === " " || k === "k" || k === "K") this._toggle(true);
      else if (k === "ArrowLeft") step(-5);
      else if (k === "ArrowRight") step(5);
      else if (k === "j" || k === "J") step(-10);
      else if (k === "l" || k === "L") step(10);
      else if (k === "ArrowUp") { v.muted = false; v.volume = clamp(v.volume + 0.1, 0, 1); }
      else if (k === "ArrowDown") v.volume = clamp(v.volume - 0.1, 0, 1);
      else if (k === "m" || k === "M") v.muted = !v.muted;
      else if (k === "c" || k === "C") this._captions(!this.capsOn);
      else if (k === "f" || k === "F") this._fullscreen();
      else if (k === "Escape" && this.menu.classList.contains("open")) { this._menu(false); this.frame.focus({ preventScroll: true }); }
      else if (k === ">" || k === ".") v.playbackRate = clamp(v.playbackRate + 0.25, 0.5, 2);
      else if (k === "<" || k === ",") v.playbackRate = clamp(v.playbackRate - 0.25, 0.5, 2);
      else if (k === "Home") { this._start(); this.seek(0); }
      else if (/^[0-9]$/.test(k)) {
        const i = k === "0" ? 0 : this.chapters.findIndex((c) => c.n === k);
        if (i >= 0) this.seekChapter(i, true); else used = false;
      } else used = false;
      if (used) { e.preventDefault(); this._wake(); }
    }

    /* ── the light behind the frame ─────────────────────────────────────────── */
    _paintGlow(src) {
      try { this.gctx.drawImage(src, 0, 0, this.glow.width, this.glow.height); } catch (e) { /* a frame that is not ready yet */ }
    }
    _glowLoop() {
      const v = this.video;
      if (this.reduce) { this._paintGlow(v); return; }
      if (this._glowing) return;
      this._glowing = true;
      let last = 0;
      const tick = (now) => {
        if (now - last > 110) { last = now; this._paintGlow(v); }
        if (!v.paused && !v.ended) next(); else this._glowing = false;
      };
      const next = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick));
      next();
    }

    _emit(name, detail) {
      this.dispatchEvent(new CustomEvent("kdvsl:" + name, { detail, bubbles: true, composed: true }));
      if (this.hasAttribute("datalayer") && Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: "kdvsl_" + name }, detail));
    }
  }

  customElements.define("kd-vsl-player", KdVslPlayer);
})();
