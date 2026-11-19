// Página Guía y fuentes: de dónde sale cada dato, cómo se trata, qué significan los límites y un glosario.
import { state } from '../store.js';
import { fmtDate, fmtNum, esc } from '../ui/format.js';
import { allLimits, limitText, SRC_LABEL } from '../limits.js';
import { SEMAFORO } from '../notes.js';

// Dónde se ve cada hoja del Excel.
const SHEET_USE = {
  EDARI: 'EDARI: tren de DQO, efectividad, caudales, evolución por punto, SST Bio 2 y observaciones',
  DQO: 'EDARI (datos anteriores al 23/07) y banda de efectividad 90–98 %',
  'SST LM': 'EDARI · Biológico (hasta el 22/07) y banda de SST 8.000–12.000',
  PH: 'EDARI (datos anteriores al 23/07)',
  'C.E.': 'EDARI (datos anteriores al 23/07)',
  'O.D. B2': 'EDARI · oxígeno disuelto por turno',
  'NITRITO NO2': 'EDARI · evolución por punto', NITRATOS: 'EDARI · evolución por punto', 'FÓSFORO': 'EDARI · evolución por punto', AMONIACO: 'EDARI · evolución por punto',
  'D. UREA': 'EDARI · dosificación de urea',
  Hoja1: 'EDARI (valores repetidos de otras hojas: se cuentan una vez)',
  Hoja2: 'Bitácora (tabla de consulta sin fecha)',
  TORRES: 'Calderas y torres (del 23/07 al 27/08)',
  'CALDERAS Y TORRES': 'Calderas y torres: calderas, torres (desde el 02/09), glicol, reactivos y rangos del informe',
  'AGUA POTABLE': 'Agua potable',
  'PAR. PLANTA O': 'Más → Ósmosis', 'PAR. PLANTA P': 'Más → Ósmosis',
  FRUCTALYS: 'Fructalys',
  'Reg. Fot.': 'Bitácora (registro fotográfico)',
  Reportes: 'No se muestra (decisión del cliente)',
};
// Origen de cada valor de los sinópticos (src/ui/synoptic.js).
const SYN_SOURCES = [
  ['EDARI', 'Entrada', 'EDARI', 'DQO · Entrada, pH · Entrada, SST · Entrada'],
  ['EDARI', 'Homo', 'EDARI', 'DQO · Homo, pH · Homo, Temperatura · Homo'],
  ['EDARI', 'DAF', 'EDARI', 'DQO · DAF, pH · DAF, SST · DAF'],
  ['EDARI', 'Biológico: Bio 0, Bio 1, Bio 2…', 'EDARI y O.D. B2', 'Un depósito por cada punto «Bio» que trae el Excel, con lo que tenga medido: Bio 0 y Bio 1, pH y Temperatura; Bio 2, SST, pH y Temperatura. O.D.: media de mañana, tarde y noche de la hoja O.D. B2 ese día, solo en Bio 2 (esa hoja llega hasta julio). Si el Excel añade otro Bio, aparece solo'],
  ['EDARI', 'Permeado', 'EDARI', 'DQO · Permeado, pH · Permeado, SST · Permeado'],
  ['EDARI', 'Balsa N, Chulives, Tanque gris', 'EDARI', 'DQO y pH de cada punto'],
  ['EDARI', '% en las tuberías', 'EDARI', '<i>Calculado</i>: lo que baja la DQO respecto al punto anterior (rojo si sube)'],
  ['EDARI', 'Efectividad', 'EDARI y DQO', '<i>Calculada</i> con la fórmula del Excel: (DQO Homo − DQO Permeado) / DQO Homo × 100. Banda: columnas BAJO y ALTO de la hoja DQO'],
  ['Calderas', 'Descalcificador', 'CALDERAS Y TORRES', 'Sección «Control de calderas»: Dureza, Conductividad, pH'],
  ['Calderas', 'Caldera 1 y Caldera 2', 'CALDERAS Y TORRES', 'Conductividad (aguja hasta el límite del informe del laboratorio), pH, Dureza, Turbidez. Ciclos: <i>calculado</i>, conductividad de la caldera / conductividad del descalcificador'],
  ['Calderas', 'Condensado 1 y 2', 'CALDERAS Y TORRES', 'Conductividad y pH'],
  ['Calderas', 'Glicol', 'CALDERAS Y TORRES', 'Sección «Control de glicol»: pH y T Cg. (temperatura de congelación)'],
  ['Torres', 'INOX (T1), ITR (T2), ALT (T3), EOS 3 (T4), EOS 1, EOS 2', 'TORRES (hasta el 27/08) y CALDERAS Y TORRES (desde el 02/09)', 'Turbidez, pH, Conductividad, Biocida'],
  ['Agua potable', 'Entrada «P», Tanque «P», Salida «P»', 'AGUA POTABLE', 'Cloro libre (aguja con la banda de referencia 0,2–1,0 mg/L en tanque y salida), Cloro total, Conductividad. Combinado: <i>calculado</i>, total − libre'],
  ['Fructalys', 'Depósito y medidor de DQO', 'FRUCTALYS', 'DQO (si el Excel pone «>60000», el medidor llega al tope y lo indica), pH (aguja con la banda de referencia), Temperatura, Conductividad, Turbidez y los últimos 10 análisis de DQO'],
];

const ST = { ok: 'Leída', 'header-changed': 'Leída (cabecera distinta)', missing: 'Falta', omitted: 'Omitida', unknown: 'No reconocida', error: 'Error' };

const GLOSARIO = [
  ['DQO', 'Demanda Química de Oxígeno (mg/L). Mide la materia orgánica del agua: cuanto más alta, más contaminada.'],
  ['Efectividad', 'Porcentaje de DQO que elimina la depuradora: ((Homo − Permeado) / Homo) × 100.'],
  ['Homo / homogeneizador', 'Depósito donde se mezcla y regula el agua antes de tratarla.'],
  ['DAF', 'Flotación por aire disuelto: separa grasas y sólidos haciéndolos flotar con microburbujas.'],
  ['Permeado', 'Último punto de la EDARI que mide el Excel: el agua a la salida de la depuradora. En depuración, «permeado» es el agua que atraviesa una membrana de filtración.'],
  ['Licor mezcla / Bio 2', 'Contenido del reactor biológico: agua más fango activo (bacterias).'],
  ['SST', 'Sólidos en suspensión totales (mg/L). En el biológico indica cuánta biomasa hay.'],
  ['O.D.', 'Oxígeno disuelto (ppm = mg/L). Necesario para que respiren las bacterias del biológico.'],
  ['pH', 'Acidez o alcalinidad (0–14; 7 es neutro).'],
  ['Conductividad / C.E.', 'Sales disueltas en el agua (µS/cm).'],
  ['Turbidez', 'Partículas en suspensión que enturbian el agua (NTU).'],
  ['Dureza', 'Cal (calcio y magnesio). En calderas debe ser casi nula para no incrustar.'],
  ['Ciclos de concentración', 'Conductividad de la caldera / conductividad del agua de aporte. Indica cuánto se concentran las sales antes de purgar.'],
  ['Purga', 'Agua que se extrae de una caldera o torre para eliminar sales acumuladas.'],
  ['Biocida', 'Producto que se dosifica en las torres para evitar bacterias (legionela) y biofilm.'],
  ['Glicol', 'Anticongelante del circuito de frío.'],
  ['Cloro libre / total / combinado', 'Libre: desinfectante activo. Total: libre + combinado. Combinado (cloraminas): cloro ya gastado.'],
  ['">60000", ">32,6"', 'El análisis supera el rango que puede medir el método. No hay número exacto; se marca aparte y nunca se convierte en 0.'],
];

export default function create() {
  const root = document.createElement('div');
  function render() {
    const d = state.data;
    const sheets = Object.values(d.sheets);
    const lims = allLimits(d).filter((l) => !l.off);
    root.innerHTML = `
    <div class="area-head"><div class="area-title"><h2>Guía y fuentes</h2><p>De dónde sale cada dato, cómo se trata y cómo leerlo. Pensada para quien consulta el panel sin conocer la planta.</p></div></div>
    <div class="guide">
      <section class="card g-sec col-12">
        <h3>1. Qué es este panel</h3>
        <p>Es la lectura automática del libro de laboratorio <b>«COMPORTAMIENTO DE LA DQO OFICIAL.xlsx»</b>, que el laboratorio rellena a diario. El panel no tiene datos propios: <b>todo lo que se ve sale de ese Excel</b>. Al subir una versión nueva, todo se recalcula.</p>
        <p>Está organizado en las cuatro áreas de la planta: <b>EDARI</b> (depuradora), <b>Calderas y torres</b>, <b>Fructalys</b> y <b>Agua potable</b>. <b>Planta hoy</b> resume el estado de todas.</p>
        <p class="muted small">Archivo cargado: ${esc(d.meta.fileName || '')} · ${fmtNum(d.meta.values)} valores numéricos · del ${fmtDate(d.meta.dmin)} al ${fmtDate(d.meta.dmax)}.</p>
      </section>

      <section class="card g-sec col-12">
        <h3>2. Recorrido del dato</h3>
        <ol class="flow">
          <li><b>Laboratorio</b><span>Analiza las muestras y anota los resultados en su hoja del Excel.</span></li>
          <li><b>Google Drive</b><span>El panel lee el Excel directamente de Google Drive: al abrirlo (como mucho cada 10 minutos), cada mañana y con el botón ⟳. También se puede subir a mano.</span></li>
          <li><b>Lectura</b><span>Cada celda se convierte en un registro con su fecha, punto, parámetro, unidad, hoja y celda de origen.</span></li>
          <li><b>Panel</b><span>Gráficos, semáforos y tablas se calculan con esos registros. Al hacer clic en un día se ve cada valor con su celda del Excel.</span></li>
        </ol>
        <p>Los únicos datos <b>calculados</b> (no escritos en el Excel) son la efectividad (con la fórmula del propio Excel), los ciclos de concentración de calderas y el cloro combinado. Siempre se indica en su nota ⓘ.</p>
      </section>

      <section class="card g-sec col-12">
        <h3>3. Sinópticos: de dónde sale cada valor del dibujo</h3>
        <p>Cada área tiene arriba un esquema con el análisis del día elegido. <b>Los valores salen todos del Excel</b>; la tabla dice de qué hoja y de qué columna (grupo · punto, tal como se llaman en el libro). Los nombres de los equipos son los de los puntos de muestreo del Excel.</p>
        <div class="table-wrap"><table class="t"><thead><tr><th>Área</th><th>Equipo del dibujo</th><th>Hoja</th><th>Valores</th></tr></thead><tbody>
          ${SYN_SOURCES.map(([a, e, h, v]) => `<tr><td>${esc(a)}</td><td><b>${esc(e)}</b></td><td>${esc(h)}</td><td>${v}</td></tr>`).join('')}
        </tbody></table></div>
        <p style="margin-top:12px"><b>Qué es solo dibujo (no sale del Excel):</b> las tuberías y las flechas de sentido, la forma de cada equipo y las animaciones (agua circulando, burbujas, ventiladores, vapor). El Excel no describe cómo están conectados los equipos: en la EDARI, Entrada, Homo, DAF y Permeado siguen el orden de las columnas del libro, y los Bio (que en el Excel van después de Permeado) se han dibujado juntos entre DAF y Permeado porque es donde suele estar el biológico; el Excel tampoco dice si van en serie o en paralelo, así que no se unen entre sí. Pendiente de confirmar con la planta. En calderas las uniones entre descalcificador, calderas, vapor y condensados son las habituales en una sala de calderas, no un plano de esta. Tampoco se dibujan niveles de depósito ni estados de marcha, porque el Excel no los recoge.</p>
        <p><b>Colores:</b> el borde de cada equipo toma el peor semáforo de sus valores con límite. Las agujas pintan sus zonas verde, ámbar y roja con ese mismo límite.</p>
      </section>

      <section class="card g-sec col-12">
        <h3>4. Celdas especiales: qué se hace con ellas</h3>
        <div class="table-wrap"><table class="t"><thead><tr><th>En el Excel</th><th>En el panel</th></tr></thead><tbody>
          <tr><td>«-» o vacía</td><td>Sin dato. No se dibuja y <b>nunca se convierte en 0</b>.</td></tr>
          <tr><td>«&gt;60000», «&gt;32,6»</td><td>Por encima del rango del método: sin número, se marca aparte (en Fructalys, triángulos en el techo).</td></tr>
          <tr><td>#DIV/0!, #VALUE!</td><td>Error de fórmula: sin dato.</td></tr>
          <tr><td>Número escrito como texto («4.19»)</td><td>Se usa el número y se avisa en Calidad de datos.</td></tr>
          <tr><td>Texto que no es un número («0, 64»)</td><td>No se interpreta y se avisa.</td></tr>
          <tr><td>Celdas combinadas en dos días</td><td>El valor cuenta solo para el primer día.</td></tr>
          <tr><td>Fórmulas BUSCARV que copian de EDARI</td><td>Descartadas: traían columnas desplazadas. Desde el 23/07 la fuente es EDARI.</td></tr>
        </tbody></table></div>
        <p class="muted small">El detalle de cada caso, con su celda, está en <b>Más → Calidad de datos</b>.</p>
      </section>

      <section class="card g-sec col-12">
        <h3>5. Hojas del Excel y dónde se ven</h3>
        <div class="table-wrap"><table class="t"><thead><tr><th>Hoja</th><th>Estado</th><th>Periodo</th><th class="n">Valores</th><th>Dónde se ve en el panel</th></tr></thead><tbody>
          ${sheets.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(ST[s.status] || s.status)}</td><td>${s.dmin ? `${fmtDate(s.dmin)} – ${fmtDate(s.dmax)}` : '–'}</td><td class="n">${fmtNum(s.values)}</td><td>${esc(SHEET_USE[s.name] || (s.status === 'unknown' ? 'Hoja nueva aún no incorporada al panel' : ''))}</td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <section class="card g-sec col-12">
        <h3>6. Semáforo y límites</h3>
        <p>${SEMAFORO}</p>
        <p>Los límites del <b>Excel</b> son los que escribe el propio laboratorio y no se pueden cambiar desde la web. Los de <b>referencia</b> son valores habituales del sector o de la normativa, para lo que el Excel no acota. Se pueden ajustar o desactivar en el botón <b>Límites</b> (arriba a la derecha) y conviene revisarlos con el responsable de la planta.</p>
        <div class="table-wrap"><table class="t"><thead><tr><th>Origen</th><th>Área</th><th>Parámetro</th><th>Puntos</th><th>Límite</th><th>Fundamento</th></tr></thead><tbody>
          ${lims.map((l) => `<tr><td><span class="src ${l.src}">${esc(SRC_LABEL[l.src])}</span></td><td>${esc(l.inst)}</td><td>${esc(l.param)}</td><td>${esc(l.points === '*' ? 'Todos' : l.points.join(', '))}</td><td class="num">${esc(limitText(l))}</td><td class="muted small">${esc(l.note || '')}</td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <section class="card g-sec col-12">
        <h3>7. Cómo usar el panel</h3>
        <ul class="tips">
          <li><b>Fechas.</b> Elige el periodo arriba o usa un atajo (7 días, mes actual…). Los KPI muestran el último valor dentro del periodo.</li>
          <li><b>Ver: diario, semanal o mensual.</b> Agrupa las tendencias con la media de la semana o del mes, útil para ver la evolución sin el ruido diario.</li>
          <li><b>Chips de parámetro y punto.</b> En cada gráfico de evolución elige qué parámetro ver y qué puntos comparar.</li>
          <li><b>Clic en un gráfico.</b> Abre el detalle de ese día: todo lo medido, con su hoja y celda del Excel, y las observaciones.</li>
          <li><b>Zoom.</b> Arrastra la barra inferior de un gráfico; el botón «Filtrar» convierte ese zoom en el periodo de todo el panel.</li>
          <li><b>Botones de cada gráfico.</b> ⓘ explicación · tabla de datos · descarga PNG · descarga CSV · ampliar.</li>
          <li><b>Vistas guardadas y enlace.</b> El marcador guarda la vista actual; la dirección de la página reproduce exactamente lo que ves.</li>
        </ul>
      </section>

      <section class="card g-sec col-12">
        <h3>8. Glosario</h3>
        <dl class="gloss">${GLOSARIO.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </section>
    </div>`;
  }
  render();
  return { el: root, update: render };
}
