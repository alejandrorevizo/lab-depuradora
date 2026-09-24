// Página Resumen: KPIs del último día con variación y sparkline, efectividad diaria y caudales.
import { state, sel, series, setTab } from '../store.js';
import { card, tokens, makeChart, timeXAxis, valueYAxis, axisTooltip, markLines, timeGrid, lineSeries, toData, attachDateClick, seriesRows, dataZoom, STATUS } from '../ui/charts.js';
import { fmtNum, fmtVal, fmtSigned, fmtDate, fmtDateLong, esc, unitSuffix } from '../ui/format.js';
import { S, sstLM, kpiStats, bandStatus, STATUS_LABEL, effAxisMin } from './common.js';

const KPIS = [
  { id: 'dqo', label: 'DQO permeado', spec: S.dqoPerm, param: 'DQO', unit: 'mg/L', tab: 'proceso' },
  { id: 'ef', label: 'Efectividad', spec: S.efect, param: 'Efectividad', unit: '%', tab: 'efectividad', band: 'efectividad', hint: '((Homo − Permeado) / Homo) × 100' },
  { id: 'qb', label: 'Agua sin tratar', spec: S.qBruta, param: 'Caudal', unit: 'm³/día', tab: 'proceso' },
  { id: 'qp', label: 'Permeado', spec: S.qPerm, param: 'Caudal', unit: 'm³/día', tab: 'proceso' },
  { id: 'sst', label: 'SST licor mezcla', union: true, param: 'SST', unit: 'mg/L', tab: 'biologico', band: 'sst', hint: 'Hoja SST LM hasta el 22/07 y EDARI "SST Bio 2" desde el 23/07' },
  { id: 'ph', label: 'pH permeado', spec: S.phPerm, param: 'pH', unit: '', tab: 'parametros' },
];

export default function create() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="page-head"><div><h2>Resumen</h2><p>Último registro de cada indicador dentro del rango de fechas seleccionado. La variación se compara con el registro anterior y con la media de los 7 registros previos.</p></div></div>
    <section class="hero-band" aria-label="Último día"></section>
    <div class="kpis"></div>
    <div class="grid"></div>`;
  const kpiHost = root.querySelector('.kpis');
  const hero = root.querySelector('.hero-band');
  const grid = root.querySelector('.grid');
  const sparks = {};

  const cEf = card({ title: 'Efectividad diaria', sub: '', cls: 'col-7' });
  const cQ = card({ title: 'Caudales', sub: 'Agua sin tratar y permeado (m³/día)', cls: 'col-5' });
  const cObs = card({ title: 'Últimas observaciones', sub: 'Columna Observaciones de EDARI', cls: 'col-7', chart: false });
  const cSt = card({ title: 'Estado de la carga', sub: '', cls: 'col-5', chart: false, tools: false });
  grid.append(cEf.el, cQ.el, cObs.el, cSt.el);
  attachDateClick(cEf.chart, () => series(S.efect).map((x) => x.d));
  attachDateClick(cQ.chart, () => series(S.qPerm).concat(series(S.qBruta)).map((x) => x.d));

  function kpiSeries(k) { return k.union ? sstLM() : series(k.spec); }

  function renderKpis() {
    const t = tokens();
    const L = state.data.limits;
    kpiHost.innerHTML = '';
    for (const k of KPIS) {
      const s = kpiSeries(k);
      const st = kpiStats(s);
      const el = document.createElement('button');
      el.className = 'card kpi';
      el.type = 'button';
      el.title = `Ir a ${k.tab}`;
      let status = '';
      if (st && k.band) {
        const lim = L[k.band];
        const [lo, hi] = k.band === 'efectividad' ? [lim.low, lim.high] : [lim.min, lim.max];
        const b = bandStatus(st.last.v, lo, hi, { aboveIsSeparate: k.band === 'efectividad' });
        const icon = b === 'good' ? '●' : b === 'critical' ? '▼' : '▲';
        const lbl = k.band === 'sst' && b === 'critical' && st.last.v > hi ? 'Por encima' : STATUS_LABEL[b];
        status = `<span class="status ${b}" title="Rango del Excel: ${fmtNum(lo)}-${fmtNum(hi)}${unitSuffix(k.unit)} (${esc(lim.src)})">${icon} ${lbl} ${fmtNum(lo)}-${fmtNum(hi)}</span>`;
      }
      const delta = (v, pct, lbl) => (v == null ? `<span class="d"><em>${lbl}</em> n/d</span>` : `<span class="d" title="${esc(fmtSigned(v, 2))}${unitSuffix(k.unit)}"><em>${lbl}</em> ${v > 0 ? '↑' : v < 0 ? '↓' : '→'} ${fmtSigned(v, Math.abs(v) >= 100 ? 0 : 2)}${pct != null ? ` (${fmtSigned(pct, 1)} %)` : ''}</span>`);
      el.innerHTML = st ? `
        <div class="kpi-top"><span class="kpi-label">${esc(k.label)}</span><span class="kpi-date">${fmtDate(st.last.d)}</span></div>
        <div class="kpi-value"><b>${fmtNum(st.last.v, k.param)}</b><span>${esc(k.unit)}</span></div>
        ${status ? `<div style="margin:2px 0 6px">${status}</div>` : ''}
        <div class="kpi-deltas">${delta(st.dPrev, st.dPrevPct, 'vs anterior')}${delta(st.dMean, st.dMeanPct, `vs media ${st.n7}`)}</div>
        <div class="kpi-spark"></div>` : `
        <div class="kpi-top"><span class="kpi-label">${esc(k.label)}</span></div>
        <div class="kpi-value"><b class="muted">n/d</b></div><p class="muted small">Sin datos en el rango seleccionado.</p>`;
      if (k.hint) el.title = k.hint;
      el.onclick = () => setTab(k.tab);
      kpiHost.appendChild(el);
      const sp = el.querySelector('.kpi-spark');
      if (sp) {
        const c = makeChart(sp);
        sparks[k.id] = c;
        const lim = k.band ? L[k.band] : null;
        const band = lim ? (k.band === 'efectividad' ? [lim.low, lim.high] : [lim.min, lim.max]) : null;
        c.setOption({
          animationDuration: 500,
          grid: { left: 2, right: 6, top: 4, bottom: 2 },
          xAxis: { type: 'time', show: false, min: 'dataMin', max: 'dataMax' },
          yAxis: { type: 'value', show: false, scale: true },
          tooltip: { trigger: 'axis', ...{ backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.ink, fontSize: 11 } }, formatter: (p) => `${fmtDate(p[0].value[2].d)}: <b>${fmtVal(p[0].value[1], k.unit, k.param)}</b>`, confine: true },
          series: [{
            type: 'line', data: toData(s), showSymbol: false, symbol: 'circle', symbolSize: 4,
            lineStyle: { width: 1.5, color: t.single }, itemStyle: { color: t.single },
            areaStyle: { color: t.single + '14' },
            markArea: band ? { silent: true, itemStyle: { color: 'rgba(12,163,12,0.08)' }, data: [[{ yAxis: band[0] }, { yAxis: band[1] }]] } : undefined,
            markPoint: { symbol: 'circle', symbolSize: 7, itemStyle: { color: t.single, borderColor: t.surface, borderWidth: 2 }, label: { show: false }, data: [{ coord: [st.last.t, st.last.v] }] },
          }],
        });
      }
    }
  }

  function renderEf() {
    const t = tokens();
    const lim = state.data.limits.efectividad;
    const s = series(S.efect);
    cEf.setTitle('Efectividad diaria', `Banda ${fmtNum(lim.low)}-${fmtNum(lim.high)} % del Excel (${lim.src}). ▼ por debajo · ● dentro · ▲ por encima`);
    const yMin = effAxisMin(s.map((x) => x.v), lim.low);
    const data = s.map((x) => {
      const b = bandStatus(x.v, lim.low, lim.high);
      const out = x.v < yMin;
      return { value: [x.t, out ? yMin : x.v, { n: x.n, d: x.d, real: out ? x.v : null }], itemStyle: { color: STATUS[b === 'good' ? 'good' : b === 'critical' ? 'critical' : 'above'], borderRadius: [3, 3, 0, 0], decal: out ? { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [3, 3], rotation: -0.785 } : undefined }, label: out ? { show: true, position: 'insideBottom', formatter: `${fmtNum(x.v, 'Efectividad')}`, color: '#fff', fontSize: 9 } : undefined };
    });
    cEf.chart.setOption({
      grid: timeGrid({ bottom: 44 }),
      tooltip: axisTooltip(t, { unitOf: () => '%', paramOf: () => 'Efectividad', extra: (d) => { const x = s.find((y) => y.d === d); if (!x) return ''; const b = bandStatus(x.v, lim.low, lim.high); return `<div style="margin-top:4px">Estado: <b>${STATUS_LABEL[b]}</b></div>`; } }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit: '%', min: yMin, max: 100, scale: false }),
      dataZoom: dataZoom(t),
      series: [{
        type: 'bar', name: 'Efectividad', data, barMaxWidth: 14,
        markArea: { silent: true, itemStyle: { color: 'rgba(12,163,12,0.07)' }, data: [[{ yAxis: lim.low }, { yAxis: lim.high }]] },
        markLine: markLines(t),
        animationDurationUpdate: 500,
      }, {
        type: 'line', name: '__limits', data: [], markLine: { silent: true, symbol: 'none', label: { color: t.ink3, fontSize: 10, formatter: (p) => `${p.value} %` }, lineStyle: { color: t.ink3, type: [4, 4] }, data: [{ yAxis: lim.low }, { yAxis: lim.high }] },
      }],
    }, { replaceMerge: ['series'] });
    const tb = seriesRows([{ name: 'Efectividad', unit: '%', param: 'Efectividad', data: s }]);
    tb.cols.splice(2, 0, { key: 'st', label: 'Estado', fmt: (r) => STATUS_LABEL[bandStatus(r.s0, lim.low, lim.high)] });
    cEf.setRows(tb.cols, tb.rows);
  }

  function renderQ() {
    const t = tokens();
    const a = series(S.qBruta), b = series(S.qPerm);
    cQ.chart.setOption({
      grid: timeGrid({ bottom: 44 }),
      legend: { top: 0, right: 0, textStyle: { color: t.ink2, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      tooltip: axisTooltip(t, { unitOf: () => 'm³/día', paramOf: () => 'Caudal' }),
      xAxis: timeXAxis(t),
      yAxis: valueYAxis(t, { unit: 'm³/día', scale: false }),
      dataZoom: dataZoom(t),
      series: [
        { ...lineSeries(t, { name: 'Agua sin tratar', data: toData(a), color: t.cat[0] }), markLine: markLines(t) },
        lineSeries(t, { name: 'Permeado', data: toData(b), color: t.cat[1] }),
      ],
    }, { replaceMerge: ['series'] });
    const tb = seriesRows([{ name: 'Agua sin tratar', unit: 'm³/día', data: a }, { name: 'Permeado', unit: 'm³/día', data: b }]);
    cQ.setRows(tb.cols, tb.rows);
    const neg = a.filter((x) => x.v < 0).length;
    cQ.setFoot(neg ? `Incluye ${neg} valores negativos de agua sin tratar, tratados como dato válido. Lista en Calidad de datos.` : '');
  }

  function renderObs() {
    const f = state.filters;
    const list = state.data.obs.filter((o) => o.kind === 'EDARI' && (!f.from || o.d >= f.from) && (!f.to || o.d <= f.to)).slice(-5).reverse();
    cObs.body.innerHTML = list.length
      ? `<ul class="timeline">${list.map((o) => `<li><time>${fmtDate(o.d)}</time><div><p>${esc(o.text)}</p></div></li>`).join('')}</ul>`
      : '<p class="muted">Sin observaciones en el rango seleccionado.</p>';
    cObs.setRows([{ key: 'd', label: 'Fecha', fmt: (r) => fmtDate(r.d) }, { key: 'text', label: 'Observación' }, { key: 'cell', label: 'Celda' }], list);
  }

  function renderStatus() {
    const d = state.data;
    const sheets = Object.values(d.sheets);
    const ok = sheets.filter((s) => s.status === 'ok').length;
    const warn = d.issues.filter((i) => i.level === 'warn').length;
    const missing = sheets.filter((s) => s.status === 'missing').map((s) => s.name);
    const changed = sheets.filter((s) => s.status === 'header-changed').map((s) => s.name);
    cSt.setTitle('Estado de la carga', d.meta.fileName || '');
    cSt.body.innerHTML = `
      <div class="summary-grid">
        <div class="s"><b>${ok}</b><span>hojas leídas de ${sheets.length}</span></div>
        <div class="s"><b>${fmtNum(d.meta.values)}</b><span>valores numéricos</span></div>
        <div class="s"><b>${fmtDate(d.meta.edariMin, true)}-${fmtDate(d.meta.edariMax, true)}</b><span>periodo EDARI</span></div>
        <div class="s"><b>${warn}</b><span>avisos</span></div>
      </div>
      ${missing.length ? `<div class="notice"><b>Faltan hojas:</b> ${esc(missing.join(', '))}</div>` : ''}
      ${changed.length ? `<div class="notice"><b>Cabecera cambiada:</b> ${esc(changed.join(', '))}</div>` : ''}
      <button class="btn" data-go="calidad">Ver calidad de datos</button>`;
    cSt.body.querySelector('[data-go]').onclick = () => setTab('calidad');
  }

  function renderHero() {
    const L = state.data.limits.efectividad;
    const ef = series(S.efect);
    if (!ef.length) { hero.innerHTML = '<div class="hero-main"><p class="hero-kicker">Sin datos de efectividad en el rango seleccionado</p></div>'; return; }
    const last = ef[ef.length - 1];
    const d = last.d;
    const b = bandStatus(last.v, L.low, L.high);
    const val = (spec) => { const x = series(spec).find((y) => y.d === d); return x ? x.v : null; };
    const stages = ['Entrada', 'Homo', 'DAF', 'Permeado'].map((p) => ({ p, v: val({ inst: 'EDARI', param: 'DQO', point: p }) }));
    const q = val(S.qPerm);
    const obs = (sel().obsByDate.get(d) || []).filter((o) => o.kind === 'EDARI');
    hero.innerHTML = `
      <div class="hero-main">
        <p class="hero-kicker">Último día con efectividad · ${fmtDateLong(d)}</p>
        <div class="hero-figure"><b>${fmtNum(last.v, 'Efectividad')}</b><span>%</span></div>
        <p class="hero-label">Efectividad de depuración, DQO Homo frente a Permeado</p>
        <span class="status ${b} hero-status">${b === 'good' ? '●' : b === 'critical' ? '▼' : '▲'} ${STATUS_LABEL[b]} ${fmtNum(L.low)}-${fmtNum(L.high)} %</span>
      </div>
      <div class="hero-train" role="list" aria-label="DQO por etapa el ${fmtDate(d)}">
        ${stages.map((s2, i) => {
          const prev = i > 0 ? stages[i - 1].v : null;
          const pct = prev != null && s2.v != null && prev !== 0 ? ((prev - s2.v) / prev) * 100 : null;
          return `${i > 0 ? `<div class="hero-arrow" aria-hidden="true"><span>${pct == null ? '' : pct >= 0 ? fmtNum(pct, '', 0) + ' %' : '+' + fmtNum(-pct, '', 0) + ' %'}</span></div>` : ''}
            <div class="hero-stage" role="listitem"><small>${esc(s2.p)}</small><b>${s2.v == null ? 'n/d' : fmtNum(s2.v, 'DQO')}</b><em>mg/L DQO</em></div>`;
        }).join('')}
        <p class="hero-foot">${q != null ? `Permeado ${fmtNum(q, 'Caudal')} m³/día` : 'Caudal de permeado sin dato ese día'}${obs.length ? ` · ✎ ${esc(obs[0].text.slice(0, 90))}${obs[0].text.length > 90 ? '…' : ''}` : ''}</p>
      </div>`;
  }

  function update() {
    renderHero();
    for (const k of Object.keys(sparks)) { try { sparks[k].dispose(); } catch (e) { /* */ } delete sparks[k]; }
    renderKpis(); renderEf(); renderQ(); renderObs(); renderStatus();
  }
  update();
  return { el: root, update };
}
