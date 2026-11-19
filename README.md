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

### Actualización automática desde Google Drive u OneDrive

Si `EXCEL_URL` tiene el enlace del Excel en Google Drive o en OneDrive, compartido como «Cualquier persona con el enlace» (también vale `ONEDRIVE_URL`, la variable antigua), `api/sync.js` lo descarga (`lib/source.js`: Google Drive, o `lib/onedrive.js`) y, si ha cambiado (huella SHA-256), lo publica como versión nueva:

- al abrir el panel, en segundo plano, como mucho cada 10 minutos;
- cada día a las 05:00 UTC con la tarea programada de Vercel (`vercel.json` → `crons`, protegida con `CRON_SECRET`);
- con el botón ⟳ de la cabecera (administrador y editores).

Se conservan las últimas 120 versiones. El estado de la última comprobación está en `config/sync.json` (Vercel Blob) y se ve al pasar el ratón por el nombre del archivo en la cabecera. Si se deja de compartir el archivo o se mueve, la comprobación da error y el panel sigue mostrando la última versión publicada.

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

Pestañas principales (con un punto de color con el estado de cada área):

| Página | Contenido |
|---|---|
| Planta hoy | Estado de las 4 áreas con sus indicadores clave, recuento fuera/cerca/en rango, tabla de alertas y últimas observaciones |
| EDARI | KPIs, tren de DQO Entrada → Homo → DAF → Permeado, efectividad con banda, evolución por punto (chips de parámetro y punto), SST licor mezcla, O.D. B2 por turno, urea y observaciones |
| Calderas y torres | Estado del día de cada caldera, condensado y descalcificador, y de cada torre (matriz con semáforo), ciclos de concentración (calculados), glicol, reactivos, tendencias y observaciones |
| Fructalys | KPIs, DQO con los ">60000" dibujados en el techo del método, muestreo y carga, tendencias y observaciones |
| Agua potable | Tarjeta por punto (entrada, tanque, salida) con cloro libre, total, combinado (calculado) y conductividad; evolución y registro diario |

Menú "Más": Explorador por punto, Ósmosis, Análisis, Bitácora, Calidad de datos y **Guía y fuentes** (de dónde sale cada dato, tratamiento de celdas, hojas, límites y glosario). Cada gráfico tiene un botón ⓘ con su hoja y columna de origen y cómo interpretarlo (textos en `src/notes.js`), y cada área un recuadro "Cómo leer esta página".

**Semáforo y límites** (`src/limits.js`): verde en rango, ámbar a menos del 10 % del límite, rojo fuera. Los límites del Excel (efectividad, SST, rangos del informe de calderas y glicol) son de solo lectura. Los de referencia (O.D., pH del permeado, cloro y conductividad de agua potable, torres según el RD 487/2022, Fructalys) se editan con el botón "Límites" y se guardan para todos en Vercel Blob (`config/limits.json`, vía `api/limits.js`); sin Blob, se guardan en el navegador.

**Ver: diario, semanal o mensual** agrupa las tendencias con la media. Los enlaces antiguos (`#resumen`, `#proceso`, `#efectividad`, `#biologico`, `#instalaciones`) redirigen a la página nueva equivalente.

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

## 6. Accesos: solicitudes y aprobación

Cada persona tiene su cuenta (correo y contraseña):

1. En la página de acceso, pestaña **Solicitar acceso**: nombre, correo, empresa, motivo y la contraseña que elige (se guarda cifrada con PBKDF2).
2. El administrador recibe un aviso en el panel (botón **Accesos** con contador) y por correo.
3. En **Accesos** aprueba o rechaza, elige el permiso (**lector**: solo consulta; **editor**: además publica Excel y cambia límites), retira accesos y ve el último acceso de cada uno. Si retira un acceso, la sesión deja de valer en unos segundos.

### Contraseñas olvidadas y administradores

- **«¿Has olvidado tu contraseña?»** en la entrada: el usuario escribe su correo y se avisa a los administradores (panel, contador de **Accesos**, y correo al principal). En **Accesos → Restablecer contraseña** se elige: un **enlace de un solo uso** (48 h) que se le envía por WhatsApp o correo, o una **contraseña provisional**. Los administradores pueden hacerlo también sin que el usuario lo pida.
- Si quien la olvida es el administrador principal, el enlace le llega directamente por correo.
- Permiso **Administrador** (en Accesos): gestiona accesos y contraseñas como el principal, pero no puede tocar la cuenta principal ni retirarse a sí mismo. Cada uno cambia solo su propia contraseña.
- Para que el enlace llegue por correo directamente a cada usuario hay que verificar el dominio en Resend y definir `RESEND_FROM`.

El administrador es `ADMIN_EMAIL` (por defecto `alejandro@revizo.es`). Entra con `DASHBOARD_PASSWORD` hasta que ponga una contraseña propia desde **Accesos**. Las sesiones de la antigua contraseña común ya no valen.

| Variable | Para qué |
|---|---|
| `ADMIN_EMAIL` | Correo del administrador (opcional, por defecto alejandro@revizo.es) |
| `RESEND_API_KEY` | Clave de [Resend](https://resend.com) para el aviso por correo de cada solicitud. Sin ella, el aviso solo aparece en el panel |
| `RESEND_FROM` | Remitente con dominio verificado en Resend (opcional). Sin él se usa `onboarding@resend.dev`, que solo puede escribir al correo con el que se creó la cuenta de Resend |
| `PUBLIC_URL` | Dirección del panel para el botón del correo (opcional) |

Los usuarios se guardan en Vercel Blob (`config/users.json`, `lib/users.js`). Funciones: `api/request-access.js` (pública), `api/login.js`, `api/me.js`, `api/admin.js`.

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
src/pages/            una página por pestaña (hoy, edari, calderas, fructalys, potable, guia…)
src/ui/               gráficos (ECharts), componentes, kit de áreas (KPI, chips, matriz, explorador), formato
src/store.js          filtros, selección cruzada, series y agrupación semanal/mensual
src/limits.js         límites del semáforo (Excel + referencia editable)
src/notes.js          textos explicativos (ⓘ, "Cómo leer esta página")
api/                  login, logout, me, request-access, admin, latest, history, upload, limits (Vercel Functions)
lib/auth.js           sesión firmada y contraseñas (Edge y Node)
lib/users.js          usuarios y solicitudes (Vercel Blob)
lib/mail.js           aviso por correo (Resend)
src/admin.js          panel de accesos del administrador
middleware.js         protege todo el sitio
tests/                pruebas con node:test
```
