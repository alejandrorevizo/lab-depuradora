// Página Cámaras: directo de las cámaras 4G de la planta, solo cuando alguien lo pide.
// El vídeo llega por HLS desde el PC de proyectos (MediaMTX); /api/me?camaras=1 da la dirección y un pase temporal.
// Si la conexión con la cámara se corta, el PC la reconecta y aquí el reproductor se recupera solo.
import { esc } from '../ui/format.js';

const MAX_MIN = 10; // minutos de directo seguidos antes de pausar para ahorrar datos de la SIM

const ESTADOS = {
  off: ['', 'Apagada'],
  wake: ['warn', 'Despertando'],
  live: ['good', 'En directo'],
  retry: ['warn', 'Reconectando'],
  pause: ['', 'En pausa'],
  error: ['bad', 'Sin conexión'],
};

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>';
const ICON_FULL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

let HlsMod = null;
const loadHls = async () => (HlsMod ||= (await import('hls.js')).default);

function monitor(cam) {
  const el = document.createElement('section');
  el.className = 'card cam col-6';
  el.innerHTML = `
    <div class="cam-screen" data-state="off">
      <video muted playsinline></video>
      <div class="cam-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="cam-osd">
        <span class="cam-live"><i></i>EN DIRECTO</span>
        <span class="cam-clock"></span>
      </div>
      <div class="cam-idle">
        <button class="cam-play" type="button" aria-label="Ver ${esc(cam.nombre)} en directo">${ICON_PLAY}</button>
        <p class="cam-msg">Pulsa para despertar la cámara</p>
      </div>
    </div>
    <div class="cam-foot">
      <div class="cam-id"><b>${esc(cam.nombre)}</b><span>${esc(cam.lugar || '')}</span></div>
      <span class="cam-pill"></span>
      <button class="btn icon ghost cam-stop" type="button" title="Parar" hidden>${ICON_STOP}</button>
      <button class="btn icon ghost cam-full" type="button" title="Pantalla completa">${ICON_FULL}</button>
    </div>`;
  const screen = el.querySelector('.cam-screen');
  const video = el.querySelector('video');
  const msg = el.querySelector('.cam-msg');
  const pillEl = el.querySelector('.cam-pill');
  const clock = el.querySelector('.cam-clock');
  const stopBtn = el.querySelector('.cam-stop');
  let hls = null, startedAt = 0, tick = null, retryTimer = null, retries = 0, playing = false;

  function set(state, text) {
    screen.dataset.state = state;
    const [cls, label] = ESTADOS[state];
    pillEl.className = `pill cam-pill ${cls}`;
    pillEl.innerHTML = `<span class="dot"></span>${label}`;
    if (text != null) msg.textContent = text;
    stopBtn.hidden = !(state === 'wake' || state === 'live' || state === 'retry');
  }
  set('off');

  function teardown() {
    clearTimeout(retryTimer);
    clearInterval(tick);
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute('src');
    video.load();
    playing = false;
  }

  function stop(state = 'off', text = 'Pulsa para despertar la cámara') {
    teardown();
    set(state, text);
  }

  async function start() {
    teardown();
    retries = 0;
    set('wake', 'Despertando la cámara… suele tardar entre 20 y 40 segundos');
    let info;
    try {
      const r = await fetch('/api/me?camaras=1', { cache: 'no-store' });
      info = await r.json();
    } catch (e) { info = null; }
    const c = info?.camaras?.find((x) => x.id === cam.id);
    if (!info?.configured || !c?.url) { stop('error', 'El servidor de cámaras aún no está configurado.'); return; }
    startedAt = Date.now();
    tick = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      if (s >= MAX_MIN * 60) stop('pause', `Pausado tras ${MAX_MIN} minutos para ahorrar datos de la SIM. Pulsa para seguir.`);
      if (!el.isConnected) teardown();
    }, 1000);
    attach(c);
  }

  async function attach(c) {
    const Hls = await loadHls();
    if (Hls.isSupported()) {
      hls = new Hls({
        liveSyncDurationCount: 2,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 2500,
        xhrSetup: (xhr, url) => {
          if (!/[?&]t=/.test(url)) xhr.open('GET', url + (url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(c.t), true);
        },
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (!playing) { playing = true; retries = 0; set('live'); video.play().catch(() => {}); }
      });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        playing = false;
        hls.destroy(); hls = null;
        if (++retries > 8) { stop('error', 'La cámara no responde. Puede estar sin cobertura o sin batería. Prueba en unos minutos.'); return; }
        set('retry', retries === 1 && screen.dataset.state === 'wake'
          ? 'Despertando la cámara… suele tardar entre 20 y 40 segundos'
          : 'Se ha cortado la conexión con la cámara; reconectando…');
        retryTimer = setTimeout(() => attach(c), 3000);
      });
      hls.loadSource(c.url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = c.url;
      video.onplaying = () => { playing = true; set('live'); };
      video.onerror = () => stop('error', 'No se pudo reproducir en este navegador.');
      video.play().catch(() => {});
    } else {
      stop('error', 'Este navegador no puede reproducir el directo.');
    }
  }

  el.querySelector('.cam-play').onclick = start;
  stopBtn.onclick = () => stop();
  el.querySelector('.cam-full').onclick = () => (screen.requestFullscreen?.() || video.webkitEnterFullscreen?.());
  return { el, stop };
}

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="area-head">
      <div class="area-title">
        <h2>Cámaras</h2>
        <p>Directo de las cámaras 4G de la planta. Cada cámara se enciende solo al pulsar y deja de emitir al salir de esta página, para no gastar datos de su SIM.</p>
      </div>
      <details class="howto">
        <summary>Cómo funciona</summary>
        <div class="howto-body">
          <p><b>Arranque.</b> Las cámaras están dormidas para ahorrar batería y datos. Al pulsar ▶ se despiertan; la imagen llega en 20–40 segundos y con unos segundos de retraso respecto a la realidad.</p>
          <p><b>Dos objetivos.</b> Cada cámara tiene dos objetivos: verás las dos imágenes, una encima de la otra. Si la cobertura falla, se reconecta sola y verás unos segundos de «Reconectando».</p>
          <p><b>Ahorro de datos.</b> El directo se pausa a los ${MAX_MIN} minutos seguidos y al salir de esta página. Si una cámara no responde, puede estar sin cobertura o con la batería baja.</p>
        </div>
      </details>
    </div>
    <div class="grid cams"></div>`;
  const grid = root.querySelector('.cams');
  let mons = [];
  async function render() {
    mons.forEach((m) => m.stop());
    let camaras = [];
    try { camaras = (await (await fetch('/api/me?camaras=1', { cache: 'no-store' })).json()).camaras || []; } catch (e) { /* */ }
    grid.innerHTML = camaras.length ? '' : '<div class="notice col-12">No se pudo cargar la lista de cámaras.</div>';
    mons = camaras.map(monitor);
    mons.forEach((m) => grid.appendChild(m.el));
  }
  render();
  return { el: root, update: () => {} };
}
