import XLSX from 'xlsx';
import { parseWorkbook } from '../src/parser/index.js';
const f = process.argv[2];
if (!f) { console.error('Uso: node scripts/inspect.mjs ruta/al/excel.xlsx'); process.exit(1); }
const wb = XLSX.readFile(f, { cellFormula: true });
const out = parseWorkbook(wb, { fileName: f });
console.log(out.meta);
for (const s of Object.values(out.sheets)) console.log(s.name.padEnd(20), s.status.padEnd(15), 'rows', s.rows, 'rec', s.records, 'val', s.values, s.dmin, s.dmax, JSON.stringify(s.discarded), s.notes.join(' | '));
console.log('limits', out.limits);
const combos = {};
for (const r of out.records) { const k = `${r.inst} | ${r.param} [${r.unit}] | ${r.point}`; combos[k] = combos[k] || [0,0]; combos[k][0]++; if (r.v!=null) combos[k][1]++; }
for (const [k,v] of Object.entries(combos).sort()) console.log(k, v);
console.log('ISSUES', out.issues.length);
for (const i of out.issues) console.log(i.level, i.sheet, i.cell||'', i.type, i.msg.slice(0,160));
console.log('obs', out.obs.length, 'reactivos', out.tables.reactivos.length, 'regfot', out.tables.regFot.length, 'refRanges', out.tables.refRanges);
const g = (d,p,pt) => out.records.find(r=>r.d===d&&r.param===p&&r.point===pt&&r.sheet==='EDARI');
console.log('24/09 DQO perm', g('2026-09-24','DQO','Permeado')?.v, 'efect', g('2026-09-24','Efectividad','Homo → Permeado')?.v);
console.log('18/09 DQO entrada', g('2026-09-18','DQO','Entrada')?.v, 'caudal perm', g('2026-09-18','Caudal','Permeado')?.v);
