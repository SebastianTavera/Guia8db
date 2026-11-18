# Actividad 5 – Proyecto integrador: Campus

**Campus** es una mini-aplicación de gestión académica sobre la base `Guia_8`:

- **Web** (Flask) para las personas: **estudiantes**, **profesores** y **público general**. Es un
  portal académico completo: inicio con publicaciones, asignaturas, inscripción, aula virtual,
  horario, históricos, registro académico, orden de matrícula, pagos en línea, contrato,
  certificados, foros, laboratorios, ciencias básicas, bases de datos en línea, reconocimiento
  docente y perfil. Diseño de **vidrio esmerilado (liquid glass) sobre fondo negro**, letras
  blancas y acentos rojos; el puntero es una luz suave que se refleja en los bordes del vidrio.
  Diseño minimalista: un solo rojo, reservado a la acción principal de cada pantalla y a las
  alertas; el resto en grafito y blanco, con contorno de neón blanco solo al pasar el mouse.
  En **Preferencias** (MongoDB) se elige el menú **lateral** (grupos plegables, por defecto) o
  **superior** (desplegables por grupo), el vidrio **opaco** (más rápido en equipos modestos)
  y si se usa la luz del puntero. En el celular el menú siempre se abre desde el botón ☰.
- La estructura de secciones está inspirada en los portales estudiantiles universitarios, pero la
  marca es propia (**Campus**): no usa el nombre, el logo ni los colores institucionales de ninguna
  universidad real. Los **pagos son simulados** (no se piden ni se guardan datos de tarjetas).
- **Terminal** para el **administrador** (`admin.py`), que no puede entrar por la web.
- **MySQL** para los datos transaccionales y **MongoDB** para los no estructurados.

> La instalación completa (Python, MariaDB, MongoDB, entorno virtual y `.env`) está en el
> [README principal](../README.md). Esta guía asume que eso ya está hecho y que la base `Guia_8`
> tiene las tablas, los datos y los procedimientos de la Actividad 3.

## Cómo cumple la guía

| Requisito | Dónde |
|---|---|
| Mini-aplicación de gestión (consola **y** web) | `admin.py` (terminal) y `app.py` + `static/` (web) |
| MySQL para datos transaccionales | Usuarios, estudiantes, profesores, cursos, matrículas, notas, **pagos** y **reservas de laboratorio** (`dao_mysql.py`) |
| MongoDB para datos no estructurados | Bitácora, preferencias, publicaciones, foros, aula virtual, evaluaciones docentes, monitorías, certificados, firmas de contrato y recursos (`dao_mongo.py`) |
| Autenticación básica | Inicio de sesión con contraseña cifrada (hash), roles y sesión firmada |
| Consultas parametrizadas en todas las operaciones | Todas las consultas de `dao_mysql.py` usan `%s` + tupla; MongoDB usa filtros tipados y lista blanca |
| Patrón DAO | Una clase por entidad. MySQL: `UsuarioDAO`, `EstudianteDAO`, `ProfesorDAO`, `GrupoDAO`, `OfertaDAO`, `ProcedimientosDAO`, `PagoDAO`, `ReservaDAO`. MongoDB: `BitacoraDAO`, `PreferenciaDAO`, `PublicacionDAO`, `ForoDAO`, `AulaDAO`, `ReconocimientoDAO`, `MonitoriaDAO`, `RecursoDAO`, `CertificadoDAO`, `ContratoDAO` |
| CRUD completo en la web | Matrícula del estudiante: **inscribir** (`POST`), **ver** comprobante (`GET`), **cambiar de curso** (`PATCH`) y **retirar** (`DELETE`); notas del profesor (`PUT`) |
| Procedimientos almacenados (Actividad 3) | `sp_registrar_matricula`, `sp_calcular_promedio` y `sp_actualizar_estado_curso`, usados desde la web y la terminal |
| Reglas de negocio | Máximo **9 materias por estudiante y periodo** (validado en una transacción con `SELECT … FOR UPDATE` antes de `sp_registrar_matricula`, en la web y en la terminal) |
| Transacciones | Pagos (`SELECT … FOR UPDATE` y validación del saldo), cambio de curso, reservas de laboratorio (índice `UNIQUE` que impide dobles reservas aunque dos personas reserven al mismo tiempo) |

## Arquitectura

```
                 ┌─────────────────────────────┐        ┌──────────────────────────┐
  Navegador ───► │ app.py  (Flask, puerto 5050)│        │ admin.py  (terminal)     │ ◄── Administrador
 (estudiante,    │  · sesiones y roles         │        │  · menús con rich        │
  profesor,      │  · API JSON                 │        │  · CRUD y procedimientos │
  público)  ◄─── │  · /api/stream (tiempo real)│        │  · bitácora en vivo      │
   SSE           └──────┬───────────────▲──────┘        └─────┬──────────────┬─────┘
                        │ DAO           │ revisa cada 0,8 s   │ DAO          │
             ┌──────────▼──────────┐ ┌──┴──────────────────────▼──┐         │
             │ MySQL · Guia_8      │ │ MongoDB · campus            │ ◄───────┘
             │ Usuario, Pago,      │ │ bitacora (TTL 180 d)        │
             │ ReservaLaboratorio  │ │ preferencias, publicaciones │
             │   (nuevas)          │ │ foros, aula, reconocimientos│
             │ Estudiante, Profesor│ │ monitorias, certificados    │
             │ Grupo, Matricula... │ │ contratos, recursos         │
             │ 3 procedimientos    │ │                             │
             └─────────────────────┘ └─────────────────────────────┘
```

**Tiempo real entre la terminal y la web:** cada acción (de la web o de la terminal) se guarda
en la bitácora de MongoDB indicando a quién afecta. La web revisa la bitácora cada 0,8 s y envía
cada evento al navegador del usuario afectado por *Server-Sent Events*. Por eso, si el
administrador matricula a un estudiante desde la terminal, el estudiante ve una notificación y su
panel se actualiza sin recargar la página.

## Archivos

| Archivo | Qué hace |
|---|---|
| `Scripts/config.py` | Lee el `.env`, crea el *pool* de conexiones de MySQL, el cliente de MongoDB y las tablas nuevas |
| `Scripts/sql/usuarios.sql` | Esquema de las tablas `Usuario`, `Pago` y `ReservaLaboratorio` (se aplica solo al iniciar) |
| `Scripts/sql/oferta_ampliada.sql` | Docentes, materias y cursos adicionales (se aplica una sola vez) |
| `Scripts/dao_mysql.py` | Acceso a MySQL: cuentas, oferta, estudiantes, profesores, cursos, procedimientos, pagos y laboratorios |
| `Scripts/dao_mongo.py` | Acceso a MongoDB: bitácora, preferencias, publicaciones, foros, aula, reconocimiento, monitorías, recursos, certificados y contratos |
| `Scripts/horarios.py` | Lee los horarios en texto ("Martes 8-10 am y jueves 11-1 pm"), detecta cruces y arma el horario ideal (búsqueda con poda: responde en milisegundos aunque haya decenas de cursos) |
| `Scripts/app.py` | Servidor web: sesiones, permisos por rol, matrícula, notas y notificaciones en vivo |
| `Scripts/rutas_campus.py` | API de las secciones del portal (horario, trámites, comunidad y servicios) |
| `Scripts/admin.py` | Consola de administración |
| `Scripts/static/fonts/` | Tipografía **Inter** (variable, licencia SIL Open Font License en `LICENSE-Inter.txt`), incluida para que la web se vea igual en Windows, Linux y el celular sin depender de internet |
| `Scripts/static/favicon.svg` | Logo de Campus (ícono de la pestaña) |
| `Scripts/static/` | Interfaz web: `campus.html`, `css/` (`base.css` + `campus.css` diseño negro, rojo y blanco) y `js/`: `campus.js` (marco, menú, enrutador, acceso), `comunidad.js` (inicio, foros, aula, reconocimiento), `estudiante.js` (asignaturas, inscripción, perfil), `academico.js` (horario, históricos, registro, orden, pagos, contrato, certificados), `servicios.js` (laboratorios, ciencias básicas, bases de datos), `profesor.js` (cursos y notas), `comun.js` (utilidades) |

## Ejecución

Se usan **dos terminales**, ambas con el entorno virtual activado y desde `Actividad-5/Scripts`.

Fedora / Arch:

```bash
cd ~/Downloads/Guia8DB-main/Actividad-5/Scripts && source ../../.venv/bin/activate
```

Windows:

```powershell
cd $HOME\Downloads\Guia8DB-main\Actividad-5\Scripts; ..\..\.venv\Scripts\Activate.ps1
```

**Terminal 1 – la web:**

```bash
python app.py
```

Abra <http://127.0.0.1:5050/> (deje esta terminal abierta).

**Terminal 2 – el administrador:**

```bash
python admin.py
```

La **primera vez** pide crear la cuenta del administrador (nombre, correo y contraseña). Después,
cada vez pide iniciar sesión.

> El puerto de la web se puede cambiar con la variable `CAMPUS_PORT` (por defecto 5050, para que
> pueda funcionar al mismo tiempo que la tienda de la Actividad 4, que usa el 5000).

## Cómo entra cada persona a la web

| Rol | Cómo obtiene su cuenta | Qué puede hacer |
|---|---|---|
| **Estudiante** | **Activar cuenta → Soy estudiante**, con su documento y su correo institucional (deben coincidir con la tabla `Estudiante`). O el administrador la crea desde la terminal | Todas las secciones de la tabla siguiente |
| **Profesor** | **Activar cuenta → Soy profesor**, con su código y su correo institucional | Inicio, **Mis cursos** (planilla de notas y cierre), **Aula virtual** (publica anuncios, material y tareas), **Horario**, **Foros**, resultados de **Reconocimiento docente**, **Laboratorios**, **Ciencias básicas**, **Bases de datos** y **Catálogo** |
| **Público general** | **Registrarse** con nombre, correo y contraseña | Inicio con publicaciones, **Catálogo** y **Favoritos**, **Foro general**, **Ciencias básicas**, **Bases de datos** y **Verificar certificado**. El menú muestra con candado las secciones del portal estudiantil y **Vincular mi cuenta** |
| **Sin cuenta** | — | **Catálogo** y **Verificar certificado** (el enlace impreso en cada certificado funciona sin iniciar sesión) |
| **Administrador** | Se crea en la primera ejecución de `admin.py` | Todo, **solo desde la terminal** |

### ¿Me registré como público general siendo estudiante?

Pasa si se usa **Crear cuenta** en vez de **Activar cuenta**: la cuenta no queda unida al registro
académico y por eso no se ven materias, horario ni trámites. Solución, sin crear otra cuenta:
entrar con esa cuenta → **Vincular mi cuenta** (menú lateral o banda del inicio) → elegir
*Soy estudiante* o *Soy docente* → documento, correo institucional y la contraseña actual. La cuenta
pasa a ser de estudiante o docente (`POST /api/vincular`, `UsuarioDAO.vincular`). Si se intenta
**Activar cuenta** con un correo que ya tiene cuenta de público general, el mensaje indica este camino.

### Secciones del estudiante

El selector **Período académico** de la cabecera cambia el período de horario, orden, pagos y contrato.

| Grupo | Sección | Qué hace | Datos |
|---|---|---|---|
| Académico | **Inicio** | Bienvenida, indicadores (promedio, asignaturas, créditos, matrícula) y pestañas **Publicaciones** / **Horarios ideales** (propone la mejor combinación de cursos sin cruces y permite inscribirlos) | MySQL + MongoDB `publicaciones` |
| | **Inicio → Mis materias / Mi horario** | Pestañas por defecto del inicio: las materias del periodo (ver, cambiar de curso, retirar) y el horario semanal | MySQL |
| | **Asignaturas** | Tarjetas de mis materias: profesor, horario, nota, estado, comprobante, cambiar curso y retirar | MySQL |
| | **Inscripción** | Arriba, **Estoy inscrito en** (x de 9 materias) con *ver*, *cambiar de curso* y **Retirar** en cada materia. Abajo, una sola tabla con los cursos del periodo: los inscritos marcados **✓ Inscrito** con botón *Retirar*, los de una materia que ya tienes con *Cambiarme*, y el resto con *Inscribir*; filtros *Todos / Inscritas / Con cupo* y por programa, cupos en vivo y aviso de **cruce de horario** | `sp_registrar_matricula` |
| | **Aula virtual** | Anuncios, material y tareas que publican los profesores de mis cursos, en vivo | MongoDB `aula` |
| | **Horario** | Calendario semanal (lunes a sábado) con línea de la hora actual; imprimible | MySQL + `horarios.py` |
| | **Históricos** | Promedio ponderado por créditos de cada período con gráfica | MySQL |
| | **Registro académico** | Expediente completo con notas, créditos y estado; imprimible | MySQL |
| Trámites | **Orden de matrícula** | Liquidación con referencia de pago, fecha límite y sello PAGADA / PENDIENTE / VENCIDA; descargar en PDF | MySQL |
| | **Pagos en línea** | Estado de cuenta, pago **simulado** (PSE, tarjeta o efectivo, sin datos de tarjeta), recibo `PG-…` y historial | MySQL `Pago` (transacción) |
| | **Descargar contrato** | Contrato del período con cláusulas; se firma electrónicamente y se descarga en PDF | MongoDB `contratos` |
| | **Certificados académicos** | Estudios, notas o matrícula, con código de verificación único | MongoDB `certificados` |
| Comunidad | **Foros** | Foro general y un foro por curso (solo sus integrantes); temas y respuestas en vivo | MongoDB `foros` |
| | **Laboratorios** | Reserva de franjas de 2 h en 6 laboratorios (máx. 3 activas); ocupación en vivo | MySQL `ReservaLaboratorio` |
| | **Ciencias básicas** | Monitorías gratuitas con cupo; inscripción atómica | MongoDB `monitorias` |
| | **Bases de datos en línea** | Recursos académicos abiertos agrupados por área, con buscador | MongoDB `recursos` |
| | **Reconocimiento docente** | Evaluación anónima de cada profesor (4 criterios de 1 a 5 y comentario) | MongoDB `reconocimientos` (agregación) |
| Cuenta | **Editar perfil** | Datos personales, contacto y preferencias (tema claro u oscuro) | MySQL + MongoDB |

### CRUD de la matrícula (estudiante)

| Operación | En la web | API | Base de datos |
|---|---|---|---|
| **Crear** | Inscripción → *Inscribir* → *Confirmar* | `POST /api/estudiante/matricular` | `sp_registrar_matricula` (valida cupo y duplicados en una transacción) |
| **Leer** | Mis materias → tarjeta → comprobante | `GET /api/estudiante/matriculas/<id>` | `SELECT … JOIN` de matrícula, curso, materia, programa y profesor |
| **Actualizar** | Tarjeta → *Cambiar de curso* | `PATCH /api/estudiante/matriculas/<id>` | `UPDATE` en transacción con `SELECT … FOR UPDATE` (misma materia y con cupo) |
| **Eliminar** | Tarjeta → *Retirar* | `DELETE /api/estudiante/matriculas/<id>` | `DELETE` solo si la materia no tiene nota ni cierre |

Cada operación queda en la bitácora de MongoDB y avisa en vivo al estudiante, al **profesor del curso** y
a todos los que estén viendo los cupos.

Todos los usuarios de la web pueden cambiar sus **preferencias** (tema oscuro, claro o del
sistema), que se guardan en MongoDB. La campana muestra su actividad y sus notificaciones.

### Datos de prueba (de `02_Datos.sql`)

| Rol | Documento / código | Correo institucional | Cursos |
|---|---|---|---|
| Estudiante | `1030281186` | `andresduenas.fm@academia.umb.edu.co` | 1 materia |
| Estudiante | `1031422990` | `juangamez.mn@academia.umb.edu.co` | 5 materias |
| Estudiante | `1028886975` | `joanromana.st@academia.umb.edu.co` | 3 materias |
| Profesor | `501` | `john.hernandezm@docentes.umb.edu.co` | Curso 1 (Teoría de bases de datos) |
| Profesor | `502` | `olga.roa@docentes.umb.edu.co` | Curso 2 (Taller de programación) |

La contraseña la elige cada persona al activar su cuenta (mínimo 8 caracteres).

> Las tablas nuevas (`Usuario`, `Pago`, `ReservaLaboratorio`) y las colecciones de MongoDB se crean
> solas la primera vez que se ejecuta `app.py` o `admin.py`. También se carga **una sola vez** la
> **oferta ampliada** (`Scripts/sql/oferta_ampliada.sql`): 12 docentes ficticios, 45 materias
> (10 por programa en total) y 51 cursos del periodo 2026-2 con horarios de lunes a sábado. Usa
> `INSERT IGNORE` y no modifica los datos existentes. Las publicaciones, monitorías y
> recursos traen contenido de ejemplo.

## Consola del administrador

```
Menú principal
 1  Tablero               → totales y actividad reciente (MongoDB)
 2  Estudiantes           → ver detalle, crear, editar, recalcular promedio (SP), eliminar
 3  Profesores            → crear y eliminar
 4  Cursos y matrículas   → matricular (SP), cerrar curso (SP con cursor), crear curso, cambiar cupo
 5  Cuentas de la web     → crear, activar/desactivar, restablecer contraseña, eliminar
 6  Bitácora (MongoDB)    → últimos eventos, filtros, resumen agregado de 7 días, vista en vivo
 7  Publicaciones         → publicar o eliminar avisos del inicio (llegan en vivo a la web)
 8  Reconocimiento docente→ ranking de profesores (agregación en MongoDB)
 9  Pagos en línea        → últimos pagos registrados
 0  Salir
```

En la bitácora, `⌨` indica una acción hecha desde la terminal y `◎` una hecha desde la web.

## Seguridad

- **SQL parametrizado** en todas las consultas (`cursor.execute(sql, valores)`). Las pocas
  consultas que arman SQL dinámico solo insertan nombres de columna de una lista blanca o
  marcadores `%s`; los valores siempre van aparte.
- **Contraseñas con hash** (`werkzeug.security`): ni la base de datos ni la bitácora guardan la
  contraseña.
- **Permisos por rol** en cada ruta. Un profesor solo puede leer y calificar **sus** cursos: el
  `UPDATE` de notas lleva `JOIN Grupo … AND g.IdProfesor = %s`.
- **Activación de cuenta verificada:** el documento y el correo institucional deben coincidir con
  el registro.
- **Sesión firmada** con `SECRET_KEY` (cookie `HttpOnly`, `SameSite=Lax`).
- **Límite de intentos de acceso:** 8 intentos fallidos cada 5 minutos por IP en la web y 3
  intentos en la terminal.
- **MongoDB:** filtros con valores tipados y preferencias por lista blanca, lo que evita la
  inyección NoSQL. La bitácora se limpia sola a los 180 días (índice TTL).
- Si el administrador **desactiva** una cuenta, esa persona sale de la web en vivo.
- Un estudiante solo puede ver, cambiar o retirar **sus** matrículas (`WHERE … AND IdEstudiante = %s`),
  y no puede retirar ni cambiar de curso una materia ya calificada o cerrada.
- **Pagos simulados:** no se piden ni se guardan números de tarjeta; el valor nunca puede superar el
  saldo pendiente (se valida dentro de la transacción).
- Los foros de curso solo los ven sus integrantes; el reconocimiento docente es anónimo y solo se
  puede evaluar una vez por curso (índice único); la verificación pública de certificados oculta
  el documento (`••••••2990`).

## Guion para el video (3 minutos)

| Tiempo | Qué mostrar |
|---|---|
| 0:00 – 0:15 | Pantalla de acceso. Explicar: web para personas, terminal para el administrador, MySQL y MongoDB. |
| 0:15 – 0:30 | Terminal: `python admin.py`, **Tablero** y **Publicaciones → Publicar** (aparece en vivo en el inicio de la web). |
| 0:30 – 1:10 | Web estudiante (`1030281186`): **Inicio** (indicadores, publicaciones, **Horarios ideales**) → **Inscripción** con aviso de cruce → *Confirmar* → comprobante → **Horario** semanal. |
| 1:10 – 1:40 | **Orden de matrícula** → **Pagos en línea** (pago simulado y recibo) → la orden pasa a **PAGADA** → **Contrato** (firmar y PDF) → **Certificado** y su verificación pública con el código. |
| 1:40 – 2:15 | Otra ventana, profesor `501`: el estudiante apareció en vivo en su curso; poner nota; publicar una **tarea en el Aula virtual** (le llega al estudiante). |
| 2:15 – 2:40 | **Foros** (respuesta en vivo), **Laboratorios** (reservar; la franja se ve ocupada en la otra ventana), **Ciencias básicas** y **Reconocimiento docente**. |
| 2:40 – 3:00 | Celular, tema oscuro y cierre: patrón DAO, consultas parametrizadas, transacciones, contraseñas con hash. |

## Capturas (carpeta `Capturas/`)

Portal del estudiante, con el menú lateral, en el período 2026-2.

### 1. Inicio

Indicadores (promedio, asignaturas, créditos, matrícula) y la pestaña **Mis materias** del período con profesor, horario y nota.

![Inicio](Capturas/01-inicio-mis-materias.png)

### 2. Asignaturas

Tarjetas de todas las materias con filtros *Todas / En curso / Calificadas*; desde cada una se ve el comprobante, se cambia de curso o se retira.

![Asignaturas](Capturas/02-asignaturas.png)

### 3. Inscripción · Estoy inscrito en

Las 9 materias del período (máximo permitido) con ver, cambiar de curso y retirar.

![Inscripción · Estoy inscrito en](Capturas/03-inscripcion-estoy-inscrito.png)

### 4. Inscripción · oferta por programa

Cursos inscritos marcados **✓ Inscrito** con *Retirar*, otros cursos de la misma materia con *Cambiarme* y el resto con *Límite 9*.

![Inscripción · oferta por programa](Capturas/04-inscripcion-oferta-ingenieria.png)

### 5. Inscripción · cruces de horario

Aviso **⚠ Cruce con …** calculado al leer los horarios.

![Inscripción · cruces de horario](Capturas/05-inscripcion-oferta-psicologia.png)

### 6. Horario

Calendario de lunes a sábado con la línea de la hora actual.

![Horario](Capturas/06-horario-semanal.png)

### 7. Históricos

Promedio acumulado ponderado por créditos y gráfica por período.

![Históricos](Capturas/07-historicos.png)

### 8. Históricos · detalle

Materias del período con estado (*En curso*, *Aprobando*) y nota.

![Históricos · detalle](Capturas/08-historicos-detalle.png)

### 9. Registro académico

Expediente imprimible con promedio ponderado y créditos aprobados.

![Registro académico](Capturas/09-registro-academico.png)

### 10. Pagos en línea

Estado de cuenta, pasarela **simulada** (PSE, tarjeta o efectivo, sin datos de tarjeta) e historial con recibo.

![Pagos en línea](Capturas/10-pagos-en-linea.png)

### 11. Contrato de matrícula

Cláusulas del período, firma electrónica e impresión en PDF.

![Contrato de matrícula](Capturas/11-contrato-de-matricula.png)

### 12. Certificados académicos

Estudios, notas o constancia de matrícula con código de verificación.

![Certificados académicos](Capturas/12-certificados-academicos.png)

### 13. Foros

Foro general y un foro por cada curso del estudiante.

![Foros](Capturas/13-foros.png)

### 14. Laboratorios

Franjas de 2 horas por laboratorio y día; máximo 3 reservas activas.

![Laboratorios](Capturas/14-laboratorios.png)

### 15. Ciencias básicas

Monitorías con cupo e inscripción atómica (MongoDB).

![Ciencias básicas](Capturas/15-ciencias-basicas.png)

### 16. Bases de datos en línea

Recursos académicos abiertos agrupados por área.

![Bases de datos en línea](Capturas/16-bases-de-datos-en-linea.png)

### 17. Reconocimiento docente

Evaluación anónima de cada profesor del período.

![Reconocimiento docente](Capturas/17-reconocimiento-docente.png)

### 18. Editar perfil

Datos personales y de contacto (MySQL).

![Editar perfil](Capturas/18-editar-perfil.png)

### 19. Consola · primera ejecución

Sin administradores, `admin.py` pide crear la cuenta del administrador.

![Consola · primera ejecución](Capturas/19-consola-admin-primera-ejecucion.png)

### 20. Consola · menú principal

Todas las secciones de administración.

![Consola · menú principal](Capturas/20-consola-admin-menu-principal.png)

### 21. Consola · tablero

Totales de estudiantes, profesores, cursos, matrículas y cuentas web.

![Consola · tablero](Capturas/21-consola-admin-tablero.png)

### 22. Consola · estudiantes

Materias, promedio y estado de cada estudiante (MySQL).

![Consola · estudiantes](Capturas/22-consola-admin-estudiantes.png)

### 23. Consola · detalle de un estudiante

Datos de contacto, promedio y todas sus materias con nota.

![Consola · detalle de un estudiante](Capturas/23-consola-admin-detalle-estudiante.png)

### 24. Consola · validación del procedimiento

`sp_registrar_matricula` rechaza al estudiante 999 porque no existe.

![Consola · validación del procedimiento](Capturas/24-consola-admin-matricula-rechazada.png)

### 25. Consola · pagos en línea

Pagos simulados registrados en la tabla `Pago`.

![Consola · pagos en línea](Capturas/25-consola-admin-pagos.png)

### Capturas pendientes

- Vista del profesor: planilla de notas y cierre del curso.
- Notificación en vivo en la web después de una acción de la terminal.
