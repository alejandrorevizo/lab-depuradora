// Pruebas del motor de datos con el Excel real.
// Ejecutar: EXCEL=/ruta/al/libro.xlsx npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import XLSX from 'xlsx';
import { parseWorkbook } from '../src/parser/index.js';
import { FLAG } from '../src/parser/util.js';

const FILE = process.env.EXCEL || '/home/claude/work/dqo.xlsx';
const skip = !fs.existsSync(FILE) && `No se encuentra el Excel de prueba (${FILE})`;
const read = () => XLSX.read(fs.readFileSync(FILE), { cellFormula: true });
const find = (out, d, param, point, sheet = 'EDARI') =>
  out.records.find((r) => r.d === d && r.param === param && r.point === point && r.sheet === sheet);

test('Valores de control de EDARI coinciden con las celdas', { skip }, () => {
  const out = parseWorkbook(read());
  assert.equal(find(out, '2026-09-24', 'DQO', 'Permeado').v, 117);
  assert.equal(find(out, '2026-09-24', 'DQO', 'Permeado').cell, 'H48');
  const ef = find(out, '2026-09-24', 'Efectividad', 'Homo → Permeado').v;
  assert.equal(ef.toFixed(2), '98.46');
  assert.equal(find(out, '2026-09-18', 'DQO', 'Entrada').v, 35200);
  assert.equal(find(out, '2026-09-18', 'Caudal', 'Permeado').v, 892);
  // Negativos de agua sin tratar: dato válido
  assert.equal(find(out, '2026-08-07', 'Caudal', 'Agua sin tratar').v, -151);
  assert.equal(out.meta.edariMin, '2026-07-23');
  assert.equal(out.meta.edariMax, '2026-09-24'); // la fila del 25/09 tiene fecha pero ningún dato
  assert.ok(out.issues.some((i) => i.type === 'emptyrow' && i.cell === 'A49'));
  assert.equal(find(out, '2026-09-25', 'SST', 'Bio 2').v, null); // =AN49*10 con AN49 vacía: no es 0
});

test('Efectividad = ((Homo − Permeado)/Homo)×100 en todas las filas', { skip }, () => {
  const out = parseWorkbook(read());
  const eff = out.records.filter((r) => r.param === 'Efectividad' && r.sheet === 'EDARI');
  for (const e of eff) {
    const h = find(out, e.d, 'DQO', 'Homo'), p = find(out, e.d, 'DQO', 'Permeado');
    if (h && p && h.v != null && p.v != null) assert.ok(Math.abs(e.v - ((h.v - p.v) / h.v) * 100) < 1e-9, e.d);
    else assert.equal(e.v, null, e.d);
  }
  assert.equal(out.issues.filter((i) => i.type === 'efectividad').length, 0, 'la efectividad guardada coincide con la calculada');
});

test('"-", vacíos, ">60000", "#DIV/0!" nunca se convierten en 0', { skip }, () => {
  const out = parseWorkbook(read());
  for (const r of out.records) {
    if (r.flag !== FLAG.OK && r.flag !== FLAG.TEXTNUM) assert.equal(r.v, null, `${r.sheet}!${r.cell} (${r.raw})`);
    if (r.v === 0) assert.equal(r.flag, FLAG.OK, `${r.sheet}!${r.cell}: cero que no viene de una celda numérica`);
    if (['-', '>60000', '#DIV/0!', '#VALUE!'].includes(String(r.raw).trim())) assert.equal(r.v, null);
  }
  const fr = out.records.filter((r) => r.sheet === 'FRUCTALYS' && r.raw === '>60000');
  assert.ok(fr.length >= 10);
  assert.ok(fr.every((r) => r.flag === FLAG.GT && r.v === null));
  const d25 = find(out, '2026-09-25', 'Efectividad', 'Homo → Permeado');
  assert.equal(d25.v, null);
  assert.equal(d25.flag, FLAG.ERROR);
});

test('BUSCARV desplazados de las hojas de laboratorio se descartan', { skip }, () => {
  const out = parseWorkbook(read());
  const bad = out.records.filter((r) => r.sheet === 'PH' && r.v != null && r.v > 14);
  assert.equal(bad.length, 0, 'ningún pH > 14 (los BUSCARV traían DQO)');
  assert.ok(out.records.some((r) => r.sheet === 'DQO' && r.flag === FLAG.EXCLUDED));
});

test('Límites leídos del propio Excel', { skip }, () => {
  const out = parseWorkbook(read());
  assert.deepEqual([out.limits.efectividad.low, out.limits.efectividad.high], [90, 98]);
  assert.deepEqual([out.limits.sst.min, out.limits.sst.max], [8000, 12000]);
  assert.match(out.limits.sst.src, /SST LM/);
});

test('Una fila nueva en EDARI aparece sin tocar código (copia temporal en memoria)', { skip }, () => {
  const wb = read();
  const ws = wb.Sheets.EDARI;
  // Copia la fila 48 (24/09) a la fila 50 con fecha 26/09. Solo existe en esta prueba.
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = 0; c <= range.e.c; c++) {
    const src = ws[XLSX.utils.encode_cell({ r: 47, c })];
    if (src) ws[XLSX.utils.encode_cell({ r: 49, c })] = { ...src, f: undefined };
  }
  ws.A50 = { t: 'n', v: 46291 }; // 26/09/2026
  range.e.r = Math.max(range.e.r, 49);
  ws['!ref'] = XLSX.utils.encode_range(range);
  const out = parseWorkbook(wb);
  assert.equal(out.meta.edariMax, '2026-09-26');
  assert.equal(find(out, '2026-09-26', 'DQO', 'Permeado').v, 117);
});

test('Una hoja borrada genera aviso y el resto sigue', { skip }, () => {
  const wb = read();
  delete wb.Sheets.TORRES;
  wb.SheetNames = wb.SheetNames.filter((s) => s !== 'TORRES');
  const out = parseWorkbook(wb);
  assert.equal(out.sheets.TORRES.status, 'missing');
  assert.ok(out.issues.some((i) => i.type === 'missing' && i.sheet === 'TORRES'));
  assert.equal(find(out, '2026-09-24', 'DQO', 'Permeado').v, 117);
});

test('Sin EDARI el resto de hojas se sigue leyendo', { skip }, () => {
  const wb = read();
  delete wb.Sheets.EDARI;
  wb.SheetNames = wb.SheetNames.filter((s) => s !== 'EDARI');
  const out = parseWorkbook(wb);
  assert.equal(out.sheets.EDARI.status, 'missing');
  assert.ok(out.records.some((r) => r.sheet === 'FRUCTALYS' && r.v != null));
});

test('Cabecera cambiada en EDARI: aviso y lectura por nombre', { skip }, () => {
  const wb = read();
  const ws = wb.Sheets.EDARI;
  ws.H2 = { t: 's', v: 'Permeado MBR' };
  const out = parseWorkbook(wb);
  assert.equal(out.sheets.EDARI.status, 'header-changed');
  assert.ok(out.issues.some((i) => i.type === 'header' && i.sheet === 'EDARI'));
  assert.equal(find(out, '2026-09-18', 'DQO', 'Entrada').v, 35200);
});
