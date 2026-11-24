// Notas para quien no conoce la planta: qué es cada dato, de qué hoja y columna del Excel sale y cómo leerlo.
// Se muestran con el botón ⓘ de cada tarjeta, en "Cómo leer esta página" de cada área y en la página Guía.

const n = (que, fuente, leer) => `
  <div class="note"><b>Qué es</b><p>${que}</p></div>
  <div class="note"><b>De dónde sale</b><p>${fuente}</p></div>
  <div class="note"><b>Cómo leerlo</b><p>${leer}</p></div>`;

export const SEMAFORO = 'Verde: dentro del límite. Ámbar: a menos del 10 % del límite, o por encima en el caso de la efectividad. Rojo: fuera del límite. Cada límite indica si viene del <b>Excel</b> o es de <b>referencia</b> (valor habitual del sector, editable en «Límites»).';

export const NOTES = {
  // ---------- EDARI ----------
  edariKpis: 'Último valor de cada indicador dentro de las fechas elegidas, con su variación frente al registro anterior (▲▼) y la tendencia de los últimos 30 registros. La barra de color a la izquierda es el semáforo. Pasa el ratón por encima del límite para ver su origen.',
  tren: n(
    'La DQO (Demanda Química de Oxígeno) mide la materia orgánica del agua: cuanto más alta, más sucia. El tren sigue el agua por la depuradora: <b>Entrada</b> (agua que llega), <b>Homo</b> (homogeneizador, donde se mezcla y regula), <b>DAF</b> (flotación por aire disuelto, que separa grasas y sólidos) y <b>Permeado</b> (el último punto que mide el Excel: el agua a la salida).',
    'Hoja <b>EDARI</b>, columnas E a H (DQO Entrada, Homo, DAF y Permeado), una fila por día.',
    'La DQO debe bajar en cada etapa. El porcentaje entre cajas es lo que se reduce respecto a la etapa anterior; si sale en rojo, la DQO sube en esa etapa. Lo importante es que el permeado sea bajo y la efectividad esté en banda.'),
  efectividad: n(
    'Porcentaje de materia orgánica (DQO) que elimina la depuradora entre el homogeneizador y la salida.',
    'Se calcula con la fórmula del propio Excel: <b>((DQO Homo − DQO Permeado) / DQO Homo) × 100</b>, con las columnas F y H de la hoja <b>EDARI</b>. La banda 90–98 % sale de las columnas BAJO y ALTO de la hoja <b>DQO</b>.',
    'Barras verdes: la planta depura lo esperado. Rojas (menos del 90 %): está eliminando menos de lo debido; hay que revisar la carga de entrada, el biológico (SST y oxígeno) y el DAF. Ámbar: cerca del 90 % o por encima del 98 %. Por encima de 98 no es un problema, pero conviene confirmar el análisis.'),
  sst: n(
    'SST (sólidos en suspensión totales) del licor mezcla: la cantidad de fango activo, es decir, de bacterias que depuran, en el reactor biológico.',
    'Hoja <b>SST LM</b> hasta el 22/07 y columna «SST Bio 2» de la hoja <b>EDARI</b> desde el 23/07. La banda 8.000–12.000 mg/L sale de las columnas MÍNIMO y MÁXIMO de la hoja SST LM.',
    'Por debajo de 8.000 hay poca biomasa y la planta depura menos. Por encima de 12.000 sobra fango: se purga, porque si no se dificulta la aireación y la filtración. Lo deseable es una línea estable dentro de la banda verde.'),
  od: n(
    'Oxígeno disuelto (O.D.) en el reactor biológico B2. Las bacterias necesitan oxígeno para degradar la materia orgánica.',
    'Hoja <b>O.D. B2</b>, tres medidas al día (mañana, tarde y noche). El rango 1,5–3 ppm es de <b>referencia</b> (habitual en fangos activados); el Excel no lo da.',
    'Por debajo de 1,5 ppm falta aireación y el biológico trabaja mal. Por encima de 3 ppm se gasta energía en soplantes sin necesidad. Esta hoja tiene datos hasta mediados de julio.'),
  urea: n(
    'Urea añadida al biológico como nutriente (nitrógeno) cuando el agua de entrada no trae suficiente para las bacterias.',
    'Hoja <b>D. UREA</b>, columna de kilos por día. Las observaciones sobre sacos están en la columna Observaciones de EDARI.',
    'Sirve para relacionar la dosificación con la evolución del biológico (SST, efectividad). Un día sin barra es un día sin dosificación registrada.'),
  obsEdari: 'Texto libre del laboratorio: columna <b>Observaciones</b> de la hoja EDARI y comentarios de la hoja D. UREA. En los gráficos, las líneas verticales punteadas con ✎ marcan los días con observación. Haz clic en una fecha para ver todo lo medido ese día.',
  edariParam: {
    _: 'Hoja <b>EDARI</b> (desde el 23/07), una columna por parámetro y punto. Antes del 23/07, de las hojas de laboratorio DQO, PH, C.E. y SST LM. Las columnas se buscan por su nombre, no por su letra.',
    DQO: 'Materia orgánica (mg/L). Debe bajar de Entrada a Permeado. Balsa N, Chulives y Tanque gris son otros puntos de muestreo de la planta.',
    pH: 'Acidez del agua (7 es neutro). El permeado tiene un rango de referencia de 6–9 para vertido. Un pH muy bajo o muy alto en la entrada u homogeneizador frena el biológico y obliga a corregir con ácido o sosa.',
    Temperatura: 'Temperatura del agua (°C). Las bacterias trabajan mejor entre unos 20 y 35 °C; los cambios bruscos alteran el biológico.',
    Conductividad: 'Sales disueltas (µS/cm). Subidas bruscas en la entrada indican vertidos con más sales o limpiezas químicas.',
    SST: 'Sólidos en suspensión (mg/L). En el permeado debe ser muy bajo; en Bio 2 es el fango activo (ver Biológico).',
    Amonio: 'Nitrógeno amoniacal. Indica si las bacterias tienen nitrógeno suficiente o si queda sin eliminar.',
    'Fósforo total': 'Fósforo, el otro nutriente de las bacterias. ">32,6" significa que supera el rango del método: no tiene valor numérico y no se dibuja.',
    Caudal: 'm³/día de agua sin tratar y de permeado (columnas B y C de EDARI). Los negativos de agua sin tratar están confirmados por el cliente y se muestran tal cual.',
    Efectividad: 'Porcentaje de DQO eliminada (ver la tarjeta Efectividad).',
  },

  sinoptico: n(
    'Esquema de la instalación con el análisis de laboratorio del día elegido sobre cada equipo. El borde de cada equipo y de su etiqueta toma el color del peor valor con límite; el punto de cada fila es el semáforo de ese valor.',
    'Cada valor sale del Excel, igual que en el resto del panel (detalle por hoja y columna en <b>Ayuda → Sinópticos</b>). Los equipos y su orden son los puntos de muestreo del libro; las tuberías, formas y animaciones son solo dibujo: el Excel no describe cómo está conectada la planta.',
    'No es tiempo real ni muestra niveles de depósito (no se miden): es el análisis de ese día. Pasa el ratón por un valor para ver su límite y su origen. Usa las flechas para cambiar de día y ver cómo evolucionó la planta.'),

  // ---------- Calderas y torres ----------
  calderasKpis: 'Conductividad de cada caldera, ciclos de concentración, dureza del agua descalcificada y pH del glicol, con su semáforo. Los límites de calderas y glicol salen del informe del laboratorio en el propio Excel.',
  calderas: n(
    'Estado de cada equipo el día elegido. <b>Caldera 1 y 2</b>: agua dentro de la caldera. <b>Condensado 1 y 2</b>: vapor condensado que vuelve. <b>Descalcificador</b>: agua de aporte ya sin cal.',
    'Hoja <b>CALDERAS Y TORRES</b>, sección «Control de calderas» de cada día. Los rangos (&lt; 6000 µS/cm, pH 10,5–12,5, dureza &lt; 2 o &lt; 5…) son los que escribe el laboratorio en su informe, en esa misma hoja.',
    'Conductividad de caldera alta: hay demasiadas sales y hay que purgar más. pH de caldera entre 10,5 y 12,5: protege el metal de la corrosión. Dureza del descalcificador alta: el descalcificador se ha agotado y hay que regenerarlo. Conductividad alta en condensados: el condensado se está contaminando.'),
  ciclos: n(
    'Ciclos de concentración: cuántas veces se concentran en la caldera las sales del agua de aporte.',
    '<b>Calculado</b>: conductividad de la caldera dividida entre la conductividad del descalcificador el mismo día (hoja CALDERAS Y TORRES). No figura en el Excel.',
    'Muchos ciclos significa poca purga, con ahorro de agua y energía pero riesgo de incrustaciones. Pocos ciclos significa que se purga de más y se tira agua caliente y producto químico. Lo importante es que sea estable.'),
  torres: n(
    'Torres de refrigeración: enfrían el agua de proceso por evaporación. Por su riesgo de legionela están reguladas.',
    'Hoja <b>TORRES</b> (del 23/07 al 27/08) y sección «Control de torres» de <b>CALDERAS Y TORRES</b> (desde el 02/09). Límites de <b>referencia</b> del programa de mantenimiento químico 2025: pH 6,5–9, conductividad &lt; 4000 µS/cm, turbidez &lt; 15 NTU y biocida (Ferrocid 4601) ≥ 0,50 ppm.',
    'Turbidez alta: agua sucia, con lodos o biofilm, y mayor riesgo microbiológico; revisar purgas y biocida. pH fuera de 6,5–9: corrosión o incrustación, y el biocida pierde eficacia. Conductividad alta: faltan purgas. Biocida por debajo de 0,50 ppm: protección insuficiente frente a legionela.'),
  glicol: n(
    'Circuito de glicol (anticongelante de frío industrial) y comprobación diaria de reactivos.',
    'Hoja <b>CALDERAS Y TORRES</b>, secciones «Control de glicol» y «Verificación de reactivos». El pH ≥ 9 sale del informe del laboratorio.',
    'pH del glicol por debajo de 9: el glicol se degrada y se vuelve corrosivo; hay que reponer el inhibidor. La temperatura de congelación indica hasta qué temperatura protege la mezcla. En reactivos, cada casilla es un día; en rojo, faltaban reactivos para dosificar.'),
  obsCalderas: 'Comentarios del laboratorio en la hoja CALDERAS Y TORRES y en la hoja TORRES.',
  calderasParam: {
    _: 'Hoja <b>CALDERAS Y TORRES</b>, sección «Control de calderas», un bloque por día.',
    Conductividad: 'Sales disueltas (µS/cm). En caldera, el límite del informe es &lt; 6000; en condensados y descalcificador, &lt; 2000.',
    'Ciclos de concentración': 'Calculado: conductividad de caldera / conductividad del descalcificador.',
    pH: 'Caldera 10,5–12,5; condensados y descalcificador 6–9 (rangos del informe).',
    'Dureza (titulación)': 'Cal (calcio y magnesio) por titulación. Debe ser casi nula: &lt; 2 en condensados y &lt; 5 en el descalcificador.',
    Turbidez: 'Turbidez (NTU): partículas en suspensión. El Excel no da límite.',
  },
  torresParam: {
    _: 'Hoja <b>TORRES</b> y sección «Control de torres» de CALDERAS Y TORRES.',
    Turbidez: 'Referencia &lt; 15 NTU (programa de mantenimiento químico 2025). Por encima indica suciedad o biofilm.',
    pH: 'Referencia 6,5–9 (programa de mantenimiento químico 2025).',
    Conductividad: 'Sales concentradas por la evaporación; se controla con las purgas. Referencia &lt; 4000 µS/cm (programa de mantenimiento químico 2025).',
    Temperatura: 'Temperatura del agua de la torre (°C).',
    Biocida: 'Biocida Ferrocid 4601 (ppm), medido con fotómetro de cloro. Concentración mínima 0,50 ppm (programa de mantenimiento químico 2025).',
  },

  // ---------- Fructalys ----------
  fructalysKpis: 'Último análisis de la muestra de Fructalys. En DQO se indica además cuántos análisis dieron «>60.000», es decir, por encima de lo que el método puede medir.',
  dqoFru: n(
    'Carga orgánica (DQO) de la muestra de la hoja FRUCTALYS. Sus valores van de miles a decenas de miles de mg/L.',
    'Hoja <b>FRUCTALYS</b>, columna DQO (mg/L).',
    'Los triángulos huecos arriba son días en que el análisis dio «>60.000»: el agua estaba tan cargada que superó el rango del método. No son huecos sin dato, son los días de más carga. Por eso la media de la tarjeta «Muestreo y carga» se queda corta.'),
  fruSum: 'Resumen del periodo: días con muestra frente a días laborables, proporción de análisis por encima del rango del método y DQO media y máxima de los análisis que sí tienen número. Hoja FRUCTALYS.',
  fruParam: {
    _: 'Hoja <b>FRUCTALYS</b>, una fila por día.',
    pH: 'Acidez. Referencia 5,5–9,5 (habitual en ordenanzas de vertido; ajústala a la autorización real en «Límites»).',
    Conductividad: 'Sales disueltas (µS/cm).',
    Temperatura: 'Temperatura (°C). Referencia de vertido ≤ 40 °C.',
    Turbidez: 'Partículas en suspensión (NTU).',
    DQO: 'Materia orgánica (mg/L). Los «>60.000» no se dibujan en esta gráfica: se ven en la gráfica de DQO de arriba.',
  },
  obsFru: 'Columna OBSERVACIÓN de la hoja FRUCTALYS.',

  // ---------- Agua potable ----------
  puntosKpi: 'Una tarjeta por punto (Entrada, Tanque, Salida) con el último dato de cada parámetro y su semáforo. <b>Cloro libre</b>: desinfectante activo; por debajo de 0,2 mg/L el agua queda sin protección. <b>Cloro combinado</b> (calculado, total − libre): cloro ya gastado; si sube, el agua trae materia que consume cloro. <b>Conductividad</b>: sales; máximo legal 2.500 µS/cm (RD 3/2023).',
  potableParam: {
    _: 'Hoja <b>AGUA POTABLE</b>.',
    'Cloro libre': 'Referencia 0,2–1,0 mg/L en tanque y salida. La entrada se muestra sin semáforo: el límite de referencia solo se aplica a tanque y salida.',
    'Cloro total': 'Cloro libre + cloro combinado.',
    'Cloro combinado': 'Calculado: cloro total − cloro libre.',
    Conductividad: 'Máximo 2.500 µS/cm (RD 3/2023).',
  },
  registro: 'Tabla día a día de la hoja AGUA POTABLE, con el semáforo en cada celda. Un guion significa que ese día no se tomó muestra en ese punto (en el Excel aparece «-» o vacío).',

  // ---------- Portada ----------
  alertas: 'Controles con límite cuyo último valor (como mucho una semana anterior al último dato del área) está fuera o cerca del límite. Haz clic en una fila para ir al área.',
  obsTodas: 'Últimos comentarios del laboratorio en todas las hojas: EDARI, D. UREA, CALDERAS Y TORRES, TORRES y FRUCTALYS.',
};

/** Nota de un parámetro concreto dentro de un explorador. */
export function paramNote(map, param) {
  return `<div class="note"><b>De dónde sale</b><p>${map._}</p></div>${map[param] ? `<div class="note"><b>${param}</b><p>${map[param]}</p></div>` : ''}<div class="note"><b>Semáforo</b><p>${SEMAFORO}</p></div>`;
}

/** Recuadro "Cómo leer esta página" de cada área. */
export const HOWTO = {
  hoy: 'Esta portada resume las cuatro áreas de la planta con su <b>último dato</b>. Cada tarjeta muestra cuatro indicadores clave, con un punto de color (su semáforo), su tendencia reciente y su valor. La franja de color de arriba de cada tarjeta es el peor estado del área. Abajo, <b>Alertas</b> lista todo lo que está fuera o cerca del límite, y <b>Últimas observaciones</b> recoge los comentarios del laboratorio. Pulsa una tarjeta o una alerta para ir al área. Los datos salen del Excel «COMPORTAMIENTO DE LA DQO OFICIAL», que el panel lee de Google Drive.',
  edari: 'La <b>EDARI</b> es la depuradora. El Excel la mide en estos puntos, con este orden de columnas: <b>Entrada, Homo, DAF y Permeado</b>, más el reactor biológico <b>Bio 2</b> y otros puntos de muestreo (<b>Balsa N, Chulives y Tanque gris</b>). Lo fundamental: <b>la DQO del permeado debe ser baja y la efectividad estar entre el 90 y el 98 %</b> (banda del propio Excel). Para que el biológico funcione, el fango (SST de Bio 2) debe estar entre 8.000 y 12.000 mg/L, también según el Excel.',
  calderas: 'Las <b>calderas</b> producen vapor. Su agua debe estar libre de cal (descalcificador) y con un pH alto para no corroer, y se purga para que no se acumulen sales. Las <b>torres</b> enfrían agua por evaporación y se controlan por su riesgo de legionela: turbidez &lt; 15 NTU, pH entre 6,5 y 9, conductividad &lt; 4000 µS/cm y biocida ≥ 0,50 ppm. El <b>glicol</b> es el anticongelante del circuito de frío. Arriba ves el estado de cada equipo el día elegido; abajo, las tendencias.',
  fructalys: '<b>Fructalys</b> es la hoja FRUCTALYS del Excel: un análisis por día de pH, conductividad, temperatura, DQO y turbidez de un mismo punto, más una columna de observaciones. El Excel no indica de qué agua se trata ni a dónde va. Muchos análisis de DQO dan «>60.000»: superan lo que el método puede medir y se marcan aparte, no se pierden.',
  potable: 'La hoja AGUA POTABLE mide tres puntos: <b>Entrada «P», Tanque «P» y Salida «P»</b> (cloro libre, cloro total y conductividad). El Excel no indica qué equipos hay entre esos puntos. El indicador clave es el <b>cloro libre</b> en el tanque y la salida (referencia 0,2–1,0 mg/L). Cada tarjeta resume el último dato de un punto; la tabla de abajo muestra todos los días.',
};
