# Laboratorio depuradora · Revizo

Dashboard web del libro de laboratorio **COMPORTAMIENTO DE LA DQO OFICIAL.xlsx**.

El Excel se sube desde la propia página. Se lee en el navegador con SheetJS y todos los gráficos se recalculan con sus datos. Ningún dato, límite ni texto se inventa: todo sale del Excel. Los únicos límites con semáforo son los que figuran en el propio libro:

- Efectividad: 90–98 %, columnas BAJO/ALTO de la hoja DQO.
- SST licor mezcla: 8.000–12.000 mg/L, columnas MÍNIMO/MÁXIMO de la hoja SST LM.

- **Stack:** Vite (HTML/JS sin framework) + SheetJS + ECharts 6. Funciones de Vercel para el acceso y el almacenamiento (Vercel Blob).
- **Proyecto independiente:** no comparte código, repositorio ni dominio con otras webs de Revizo.

---

## 1. Despliegue en Vercel (primera vez)

1. **Sube esta carpeta a un repositorio nuevo de GitHub** (por ejemplo `alejandrorevizo/lab-depuradora`). Con GitHub Desktop: *File → Add local repository*, elige la carpeta, *Publish repository* (o *Push origin* si el repositorio ya existe).
2. En **vercel.com → Add New → Project**, importa ese repositorio. Vercel detecta Vite solo; no cambies nada del build.
3. **Contraseña.** En *Settings → Environment Variables* añade:
   | Variable | Valor | Obligatoria |
   |---|---|---|
   | `DASHBOARD_PASSWORD` | La contraseña de acceso | Sí (sin ella la web responde "Acceso no configurado") |
   | `AUTH_SECRET` | Una cadena larga aleatoria (32+ caracteres) para firmar la sesión | Recomendada |
   | `SESSION_DAYS` | Días que dura la sesión (por defecto 30) | No |
4. **Almacenamiento compartido.** En *Storage → Create → Blob*, crea un almacén con acceso **Private** y conéctalo al proyecto. Vercel añade solo `BLOB_READ_WRITE_TOKEN`. Si lo creas como *Public*, añade también `BLOB_ACCESS=public`.
5. *Deployments → Redeploy* para que coja las variables. Abre la URL, entra con la contraseña y sube el Excel. Pulsa **Publicar para todos**.

Sin Blob configurado la web sigue funcionando, pero cada persona ve solo el Excel que sube en su sesión.

## 2. Cómo se actualiza

- Cada día: **Subir Excel** (o arrastrar el archivo a la página) → se muestra el **resumen de carga** con:
  - hojas leídas,
  - filas,
  - rango de fechas,
  - celdas sin valor y su motivo,
  - avisos.
- **Publicar para todos:** guarda el archivo en Vercel Blob y desde ese momento es lo que ven todos al entrar.
- **Ver sin publicar:** lo muestra solo en tu sesión, sin tocar lo publicado.
- Cada publicación se guarda con fecha. El botón de **historial** (reloj) permite abrir versiones anteriores.
- No hay que tocar código para que aparezcan filas o fechas nuevas.

## 3. Qué pasa si cambia el Excel

- **Falta una hoja:** aviso arriba de cada página y en *Calidad de datos*. El resto funciona igual.
- **Cambia una cabecera de EDARI:** aviso de "cabecera cambiada". Las columnas se buscan por su **nombre** (grupo de la fila 1 + punto de la fila 2), no por su letra. Si se inserta una columna, se sigue leyendo bien.
- **Columna nueva con nombre nuevo** (por ejemplo otro punto de muestreo en EDARI): aparece sola como punto nuevo del parámetro.
- **Hoja nueva desconocida:** se lista como "no reconocida" y se ignora. Para leerla hay que añadir un parser en `src/parser/index.js` (tabla `PARSERS`).
- **Hoja con estructura muy distinta:** el parser de esa hoja falla con un aviso y las demás siguen.

## 4. Cómo se leen los datos (motor en `src/parser/`)

Cada hoja se convierte a **formato largo**: una fila por valor, con estos campos:

- fecha
- instalación
- punto
- parámetro
- valor
- unidad
- texto original
- hoja y celda de origen
- hora, si la hay
- nota de la celda, si la hay

Nunca se convierte en 0 nada que no sea un 0 escrito en el Excel:

| Celda | Tratamiento |
|---|---|
| `-`, vacía | Sin dato |
| `>60000`, `>32,6` | Fuera de rango del método: sin valor numérico, se marca aparte |
| `#DIV/0!`, `#VALUE!` | Error de fórmula: sin dato |
| `4.19` escrito como texto | Número guardado como texto: se usa y se avisa |
| `0, 64` (con espacio) | Texto no numérico: no se interpreta, se avisa |
| Fórmula que solo depende de celdas vacías (p. ej. `=AN49*10`, que Excel muestra como 0) | Sin dato |
| Parte baja de una celda combinada (p. ej. B42:B43) | Sin dato para la segunda fecha |
| Fórmula BUSCARV a otra hoja (DQO, SST LM, PH, C.E. desde el 23/07) | Descartada: traen columnas de EDARI desplazadas; desde el 23/07 la fuente es EDARI |

Hoja por hoja:

- **Efectividad:** se recalcula con la fórmula del Excel, `((DQO Homo − DQO Permeado) / DQO Homo) × 100`. Si no coincide con el valor guardado, se avisa.
- **EDARI:** una fila por fecha desde la fila 3. Las observaciones (columna AW) aparecen como marcas ✎ en todos los gráficos temporales.
- **Hojas de laboratorio** (DQO, SST LM, PH, C.E., O.D. B2, NITRITO NO2, NITRATOS, FÓSFORO, AMONIACO, Hoja1):
  - Cabecera en la fila 1.
  - Las columnas con cabecera más abajo (HOMOGENIZADOR, POZO ENTRADA, BIO 2) se leen desde esa fila.
  - Los puntos conservan sus nombres (no se unen con los de EDARI).
- **TORRES:** la fecha de la primera fila se aplica a todo su bloque.
- **CALDERAS Y TORRES:** tiene tres formatos de bloque a lo largo de la hoja (fecha en B, "FECHA:" + fecha en C, e "INFORME DE LABORATORIO"). Los tres se leen.
  - El primer bloque no tiene fecha y no se carga.
  - Los rangos escritos en el informe (p. ej. "< 2000 uS/cm") se muestran como texto, sin semáforo.
- **Hoja2 y Reg. Fot.:** solo se muestran como tablas de consulta. Las rutas locales no llevan enlace.
- **Reportes:** se omite por decisión del cliente.

## 5. Páginas

| Página | Contenido |
|---|---|
| Resumen | Último día (efectividad y tren de DQO), 6 KPIs con variación frente al registro anterior y a la media de los 7 previos, sparklines, efectividad diaria, caudales y últimas observaciones |
| Proceso DQO | Tren Entrada → Homo → DAF → Permeado para la fecha elegida, con % de eliminación entre etapas; evolución por punto (escala log/lineal) |
| Efectividad | Serie con banda 90–98 % y semáforo (▼ por debajo, ● dentro, ▲ por encima), distribución y tabla |
| Parámetros por punto | Mapa de calor fecha × punto y pequeños múltiplos para cualquier parámetro e instalación |
| Biológico | SST licor mezcla con banda 8.000–12.000, O.D. B2 por turno, dosificación de urea |
| Instalaciones | Torres, Calderas y glicol (con verificación de reactivos), Agua potable, Ósmosis O y P, Fructalys |
| Análisis | Gráfico de control (media ± 2σ), dispersión con correlación y recta, comparación de dos periodos |
| Bitácora | Línea de tiempo y buscador de observaciones, registro fotográfico, tabla puntual de Hoja2 |
| Calidad de datos | Hojas leídas, días sin muestra por punto, valores ">", errores, negativos, descartes y avisos |

**Interacción:**

- Filtros:
  - segmentador de fechas con presets,
  - filtros de instalación, punto y parámetro.
- Clic en un gráfico → **detalle del día** (todas las hojas, observación y notas de celda).
- Zoom en cualquier gráfico → botón para convertir el zoom en filtro.
- Tooltips con valor, unidad, fecha y observación del día.
- Herramientas en cada visual:
  - tabla de datos,
  - PNG,
  - CSV,
  - ampliar.
- Exportación CSV de los datos filtrados.
- **Vistas guardadas** (en el navegador) y enlaces que reproducen la vista.
- Modo claro/oscuro y modo presentación a pantalla completa.

## 6. Pasar a usuarios individuales

Añade la variable `DASHBOARD_USERS` con un JSON de usuario → hash SHA-256 de su contraseña:

```bash
npm run hash-password -- "contraseña-de-ana"
# DASHBOARD_USERS={"ana":"<hash>","ismael":"<hash>"}
```

Con esa variable la página de acceso pide usuario y contraseña, y `DASHBOARD_PASSWORD` deja de usarse. El usuario queda en la sesión (`lib/auth.js`) para registrar quién sube cada Excel si se quiere más adelante.

## 7. Desarrollo local

```bash
npm install
npm run dev          # http://localhost:5173 (sin funciones: modo local, el Excel no se guarda)
npm run build
EXCEL=/ruta/COMPORTAMIENTO_DE_LA_DQO_OFICIAL_1.xlsx npm test
```

Las pruebas comprueban:

- EDARI 24/09 (DQO permeado 117 mg/L, efectividad 98,46 %) y 18/09 (DQO entrada 35.200 mg/L, permeado 892 m³/día).
- La fórmula de efectividad en todas las filas.
- Que "-", ">60000" y "#DIV/0!" nunca sean 0.
- Fila nueva, hoja borrada y cabecera cambiada.
- Contraseña, cookie firmada, middleware y funciones /api.

## 8. Estructura

```
index.html            página del dashboard
public/login.html     acceso
public/logo-*         logo de Revizo (original, recortado y versión para modo oscuro)
src/parser/           motor de datos (Excel → formato largo)
src/pages/            una página por pestaña
src/ui/               gráficos (ECharts), componentes, formato
src/store.js          filtros, selección cruzada y series
api/                  login, logout, latest, history, upload (Vercel Functions)
lib/auth.js           sesión firmada (Edge y Node)
middleware.js         protege todo el sitio
tests/                pruebas con node:test
```
