# Guía 8 – Bases de datos desde Python

Proyecto de la Guía 8: conexión a **MySQL/MariaDB** desde Python (Actividades 1 a 3), a
**MongoDB** con `pymongo` (Actividad 4: tienda de ropa *Monocromo* en tiempo real) y el proyecto
integrador **Campus** (Actividad 5: web para estudiantes y profesores, terminal para el
administrador, MySQL + MongoDB).

| Actividad | Qué hace | Base de datos | Cómo se ejecuta |
|---|---|---|---|
| 1 | Conexión básica, `SELECT` y manejo de errores | MySQL/MariaDB | `python "Actividad-1/Scripts/Conexion basica.py"` |
| 2 | CRUD completo con menú y consultas parametrizadas | MySQL/MariaDB | `python Actividad-2/Scripts/Crud.py` |
| 3 | Procedimientos almacenados con parámetros `OUT` | MySQL/MariaDB | `python "Actividad-3/Scripts/Procedimientos almacenados.py"` |
| 4 | CRUD con `pymongo` + tienda web en tiempo real | MongoDB | `python crud_consola.py` y `python app.py` |
| 5 | Proyecto integrador *Campus*: web por roles + consola de administración | MySQL + MongoDB | `python app.py` y `python admin.py` |

---

## Contenido

1. [Qué hay que instalar](#1-qué-hay-que-instalar)
2. [Instalación en Fedora](#2-instalación-en-fedora)
3. [Instalación en Arch Linux](#3-instalación-en-arch-linux)
4. [Instalación en Windows](#4-instalación-en-windows)
5. [Preparar el proyecto (todos los sistemas)](#5-preparar-el-proyecto-todos-los-sistemas)
6. [Crear la base de datos MySQL/MariaDB](#6-crear-la-base-de-datos-mysqlmariadb)
7. [Ejecutar cada actividad](#7-ejecutar-cada-actividad)
8. [Tiempo real con Change Streams (opcional)](#8-tiempo-real-con-change-streams-opcional)
9. [Capturas para la entrega](#9-capturas-para-la-entrega)
10. [Solución de problemas](#10-solución-de-problemas)
11. [Estructura del proyecto](#11-estructura-del-proyecto)

---

## 1. Qué hay que instalar

| Programa | Para qué | Versión probada |
|---|---|---|
| **Python** 3.10 o superior | Ejecutar todos los scripts | 3.13 y 3.14 |
| **MariaDB** o **MySQL** | Actividades 1, 2 y 3 | MariaDB 11 / MySQL 8 |
| **MongoDB Community Server** | Actividad 4 | 7.0 |
| **mongosh** (opcional) | Consola de MongoDB, para revisar datos o activar Change Streams | 2.x |
| **MongoDB Compass** (opcional) | Ver las colecciones gráficamente (útil para las capturas) | 1.4x |
| **Navegador** con WebGL2 (Brave, Chrome, Edge, Firefox) | Ver la tienda de la Actividad 4 | — |
| **Editor de texto** (nano, VS Code, Bloc de notas) | Editar el archivo `.env` | — |

Las librerías de Python (`mysql-connector-python`, `pymongo`, `Flask`, `python-dotenv`) se
instalan después con `pip`, dentro de un entorno virtual (sección 5).

> **MongoDB Atlas** (la nube) es opcional: la tienda funciona igual con MongoDB instalado en el
> equipo. Si prefieren Atlas, vean la sección 5.4.

---

## 2. Instalación en Fedora

Probado en Fedora 41+ (también sirve para Nobara).

### 2.1 Python, pip y nano

Fedora ya trae Python 3. Instale pip y el editor nano (Fedora no lo trae):

```bash
sudo dnf install python3 python3-pip nano
```

### 2.2 MariaDB

```bash
sudo dnf install mariadb-server
```

```bash
sudo systemctl enable --now mariadb
```

Compruebe que está activo:

```bash
systemctl status mariadb
```

> En Fedora el usuario `root` de MariaDB entra con `sudo mysql` (sin contraseña) y **no** puede
> conectarse desde Python. Por eso en la sección 6 se crea un usuario `guia8` para los scripts.

### 2.3 MongoDB

MongoDB no está en los repositorios de Fedora; se usa el repositorio oficial de MongoDB
(el de Red Hat 9 funciona en Fedora). Cree el archivo del repositorio:

```bash
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo > /dev/null <<'EOF'
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-7.0.asc
EOF
```

Instale MongoDB (incluye el servidor `mongod`, `mongosh` y las herramientas):

```bash
sudo dnf install mongodb-org
```

Inícielo y déjelo activo al encender el equipo:

```bash
sudo systemctl enable --now mongod
```

```bash
systemctl status mongod
```

Debe decir `active (running)`. Para salir de esa vista presione `q`.

### 2.4 MongoDB Compass (opcional)

Descargue el paquete `.rpm` desde <https://www.mongodb.com/try/download/compass> e instálelo:

```bash
sudo dnf install ./mongodb-compass-*.x86_64.rpm
```

---

## 3. Instalación en Arch Linux

Probado en Arch y derivados (Manjaro, EndeavourOS).

### 3.1 Python, pip y nano

```bash
sudo pacman -S python python-pip nano
```

> Arch no permite instalar paquetes con `pip` en el Python del sistema (error
> *externally-managed-environment*). Por eso **siempre** se usa el entorno virtual de la sección 5.

### 3.2 MariaDB

```bash
sudo pacman -S mariadb
```

En Arch hay que inicializar el directorio de datos una sola vez:

```bash
sudo mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql
```

```bash
sudo systemctl enable --now mariadb
```

Igual que en Fedora, `root` entra con `sudo mysql` y para Python se crea el usuario `guia8`
(sección 6).

### 3.3 MongoDB

MongoDB no está en los repositorios oficiales de Arch (por su licencia); se instala desde el
**AUR**. Con un ayudante como `yay` (las versiones `-bin` ya vienen compiladas, así que no tardan):

```bash
yay -S mongodb-bin mongosh-bin
```

Si no tiene `yay`, instálelo primero:

```bash
sudo pacman -S --needed git base-devel
```

```bash
git clone https://aur.archlinux.org/yay-bin.git && cd yay-bin && makepkg -si && cd ..
```

Inicie MongoDB:

```bash
sudo systemctl enable --now mongodb
```

> En Arch el servicio se llama `mongodb` (en Fedora y Windows se llama `mongod`).

**Alternativa sin AUR (contenedor):** si tiene Docker o Podman, puede correr MongoDB así:

```bash
podman run -d --name mongo -p 27017:27017 docker.io/library/mongo:7
```

### 3.4 MongoDB Compass (opcional)

Busque el paquete en el AUR e instale la versión `-bin` (ya compilada) que aparezca:

```bash
yay -Ss mongodb-compass
```

---

## 4. Instalación en Windows

Probado en Windows 10 y 11. Los comandos van en **PowerShell**.
`winget` viene incluido en Windows 10/11; si un paquete no aparece en `winget`, use el enlace
de descarga indicado.

### 4.1 Python

```powershell
winget install Python.Python.3.13
```

O descárguelo de <https://www.python.org/downloads/>. **Importante:** en el instalador marque
**"Add python.exe to PATH"**. Cierre y vuelva a abrir PowerShell, y compruebe:

```powershell
py --version
```

### 4.2 MariaDB (o MySQL)

Opción A, MariaDB:

```powershell
winget install MariaDB.Server
```

O descárguelo de <https://mariadb.org/download/>. Durante la instalación:
- Defina una contraseña para `root` y anótela.
- Deje marcada la opción **"Install as service"**.
- Marque **"Use UTF8 as default server's character set"**.

Opción B, MySQL: instálelo con *MySQL Installer* desde
<https://dev.mysql.com/downloads/installer/> (elija **Server only**, o **Developer Default** si
también quiere *MySQL Workbench*).

Para usar el comando `mysql` en PowerShell, agregue la carpeta `bin` al PATH (o use la consola
"MariaDB Command Prompt" / "MySQL Command Line Client" del menú Inicio). Por ejemplo:

```powershell
$env:Path += ";C:\Program Files\MariaDB 11.4\bin"
```

(Ajuste la versión de la carpeta a la que se instaló.)

### 4.3 MongoDB

```powershell
winget install MongoDB.Server
```

```powershell
winget install MongoDB.Shell
```

O descárguelo de <https://www.mongodb.com/try/download/community> (paquete `.msi`). En el
instalador elija **Complete** y deje marcado **"Install MongoDB as a Service"**: así queda
iniciado siempre. Compruébelo:

```powershell
Get-Service MongoDB
```

Debe decir `Running`. Si está detenido:

```powershell
Start-Service MongoDB
```

### 4.4 MongoDB Compass (opcional)

El instalador `.msi` de MongoDB ofrece instalarlo. También desde
<https://www.mongodb.com/try/download/compass>.

### 4.5 Permitir los scripts del entorno virtual

PowerShell bloquea por defecto el script que activa el entorno virtual. Ejecute esto **una sola
vez**:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## 5. Preparar el proyecto (todos los sistemas)

Todos los comandos se ejecutan desde la **carpeta raíz del proyecto** (la que contiene este
README y `requirements.txt`).

### 5.1 Ir a la carpeta del proyecto

Linux (ajuste la ruta a donde lo descargó):

```bash
cd ~/Downloads/Guia8DB-main
```

Windows:

```powershell
cd $HOME\Downloads\Guia8DB-main
```

### 5.2 Crear y activar el entorno virtual

> Cree el entorno virtual **en su propio equipo**. Si copió la carpeta `.venv` de otro computador,
> bórrela primero: un `.venv` de otra máquina no funciona (error `No module named ...`).

**Fedora / Arch:**

```bash
python3 -m venv .venv
```

```bash
source .venv/bin/activate
```

**Windows:**

```powershell
py -m venv .venv
```

```powershell
.\.venv\Scripts\Activate.ps1
```

Al activarlo aparece `(.venv)` al inicio de la línea de la terminal. **Cada vez que abra una
terminal nueva** debe activarlo de nuevo (solo el segundo comando).

### 5.3 Instalar las librerías

Con el entorno activado (igual en todos los sistemas):

```bash
pip install -r requirements.txt
```

Instala `mysql-connector-python`, `pymongo`, `Flask`, `python-dotenv` y `rich` (tablas y colores
de la consola de la Actividad 5).

### 5.4 Crear el archivo `.env`

El archivo `.env` guarda las contraseñas y conexiones (así no quedan escritas en el código). Está
en `.gitignore`: **nunca se sube a GitHub**.

**Fedora / Arch:**

```bash
cp .env.example .env
```

```bash
nano .env
```

(En nano: guardar con `Ctrl+O` y `Enter`, salir con `Ctrl+X`.)

**Windows:**

```powershell
Copy-Item .env.example .env
```

```powershell
notepad .env
```

Contenido y qué significa cada línea:

| Variable | Valor de ejemplo | Para qué |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | Servidor MySQL/MariaDB |
| `DB_PORT` | `3306` | Puerto de MySQL/MariaDB |
| `DB_USER` | `guia8` | Usuario de la base de datos (sección 6). En Windows puede usar `root` |
| `DB_PASSWORD` | `Guia8-2026` | Contraseña de ese usuario |
| `DB_NAME` | `Guia_8` | Base de datos de las Actividades 1 a 3 |
| `MONGO_URI` | `mongodb://127.0.0.1:27017` | Conexión a MongoDB local |
| `MONGO_DB` | `tienda_ropa` | Base de datos de la tienda |
| `ADMIN_PASSWORD` | `Admin2026` | Clave para entrar al panel `/admin` |
| `SECRET_KEY` | (texto largo al azar) | Firma la sesión de los clientes de la tienda |

Genere su propia `SECRET_KEY` y péguela en el `.env`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**Usar MongoDB Atlas en lugar de MongoDB local (opcional):**

1. En Atlas, en su cluster, clic en **Connect → Drivers → Python** y copie la cadena.
2. En **Database & Network Access → Database Users → Edit → Edit Password** defina una clave
   (sin `@`, `:` ni `/`).
3. En **IP Access List → Add Current IP Address** autorice su IP.
4. En el `.env`, reemplace `MONGO_URI` por la cadena, cambiando `<db_password>` (incluidos los
   signos `< >`) por la clave real:

```
MONGO_URI=mongodb+srv://usuario:SuClave@cluster0.xxxxx.mongodb.net/
```

---

## 6. Crear la base de datos MySQL/MariaDB

Se ejecutan, en este orden, los tres scripts SQL:

1. `Tablas y datos/01_Tablas.sql` – crea la base `Guia_8` y sus tablas.
2. `Tablas y datos/02_Datos.sql` – inserta los datos de ejemplo.
3. `Actividad-3/Scripts/Procedimientos almacenados.sql` – crea los 3 procedimientos almacenados.

### 6.1 Fedora / Arch

Desde la carpeta del proyecto:

```bash
sudo mysql < "Tablas y datos/01_Tablas.sql"
```

```bash
sudo mysql Guia_8 < "Tablas y datos/02_Datos.sql"
```

```bash
sudo mysql Guia_8 < "Actividad-3/Scripts/Procedimientos almacenados.sql"
```

Cree el usuario que usarán los scripts de Python (la contraseña debe ser la misma de
`DB_PASSWORD` en el `.env`):

```bash
sudo mysql -e "CREATE USER IF NOT EXISTS 'guia8'@'localhost' IDENTIFIED BY 'Guia8-2026'; CREATE USER IF NOT EXISTS 'guia8'@'127.0.0.1' IDENTIFIED BY 'Guia8-2026'; GRANT ALL PRIVILEGES ON Guia_8.* TO 'guia8'@'localhost'; GRANT ALL PRIVILEGES ON Guia_8.* TO 'guia8'@'127.0.0.1'; FLUSH PRIVILEGES;"
```

Compruebe que el usuario funciona (pedirá la contraseña):

```bash
mysql -h 127.0.0.1 -u guia8 -p -e "SELECT COUNT(*) AS estudiantes FROM Guia_8.Estudiante;"
```

### 6.2 Windows

PowerShell no acepta `<` para pasar un archivo a un programa, así que se usa el comando
`source` dentro del cliente `mysql`. Entre al cliente con la contraseña de `root` que definió al
instalar:

```powershell
mysql -u root -p
```

Dentro de `mysql`, ejecute (use `/` en las rutas y ajuste la ruta del proyecto):

```sql
source C:/Users/SuUsuario/Downloads/Guia8DB-main/Tablas y datos/01_Tablas.sql
source C:/Users/SuUsuario/Downloads/Guia8DB-main/Tablas y datos/02_Datos.sql
source C:/Users/SuUsuario/Downloads/Guia8DB-main/Actividad-3/Scripts/Procedimientos almacenados.sql
```

Si `source` no acepta los espacios de la ruta, copie la carpeta del proyecto a una ruta sin
espacios (por ejemplo `C:/guia8/`) o abra los archivos en MySQL Workbench / HeidiSQL (viene con
MariaDB) y ejecútelos con el botón del rayo.

En Windows puede usar `root` directamente: ponga `DB_USER=root` y su contraseña en
`DB_PASSWORD` del `.env`. Si prefiere el usuario `guia8`, créelo dentro de `mysql`:

```sql
CREATE USER IF NOT EXISTS 'guia8'@'localhost' IDENTIFIED BY 'Guia8-2026';
CREATE USER IF NOT EXISTS 'guia8'@'127.0.0.1' IDENTIFIED BY 'Guia8-2026';
GRANT ALL PRIVILEGES ON Guia_8.* TO 'guia8'@'localhost';
GRANT ALL PRIVILEGES ON Guia_8.* TO 'guia8'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Salga con `exit`.

---

## 7. Ejecutar cada actividad

Antes de cada ejecución: estar en la carpeta raíz del proyecto y con el entorno virtual activado
(`(.venv)` al inicio de la línea). En Linux use `python` (dentro del entorno virtual) y en Windows
también `python`.

### Actividad 1 – Conexión básica

```bash
python "Actividad-1/Scripts/Conexion basica.py"
```

Resultado esperado: `[OK] Conexión establecida…`, la tabla de estudiantes con sus matrículas y
`[INFO] Conexión cerrada de forma segura.`

**Para la captura del manejo de errores**, ejecútelo con una contraseña incorrecta (no cambia el
`.env`):

Fedora / Arch:

```bash
DB_PASSWORD=incorrecta python "Actividad-1/Scripts/Conexion basica.py"
```

Windows:

```powershell
$env:DB_PASSWORD="incorrecta"; python "Actividad-1/Scripts/Conexion basica.py"; Remove-Item Env:DB_PASSWORD
```

Debe mostrar `[ERROR SQL/CONEXIÓN] … Access denied …` (error 1045).

### Actividad 2 – CRUD con menú

```bash
python Actividad-2/Scripts/Crud.py
```

Menú: `1` insertar, `2` consultar (listar o buscar por ID), `3` actualizar, `4` eliminar (pide
confirmación), `5` salir. Todas las consultas que reciben datos del usuario son parametrizadas
(`%s`), lo que evita la inyección SQL.

Ejemplo para probar todo: inserte el estudiante `1999999999`, búsquelo con la opción 2, cambie su
teléfono con la 3 y elimínelo con la 4. Para ver el error de llave foránea, intente eliminar un
estudiante que tenga matrículas (por ejemplo, uno de la lista de la opción 2).

### Actividad 3 – Procedimientos almacenados

Requiere haber ejecutado `Procedimientos almacenados.sql` (sección 6).

```bash
python "Actividad-3/Scripts/Procedimientos almacenados.py"
```

| Opción | Procedimiento | Pide | Parámetros OUT que muestra |
|---|---|---|---|
| 1 | `sp_registrar_matricula` | ID de estudiante y de grupo (ej. `1030281186` y `3`; para ver un error use el estudiante `999`) | Mensaje de éxito o error |
| 2 | `sp_calcular_promedio` | ID de estudiante (ej. `1031422990`) | Promedio y clasificación |
| 3 | `sp_actualizar_estado_curso` | ID de grupo (ej. `1`, `2`, `4`) | Mensaje con el resultado (usa un cursor) |

### Actividad 4 – MongoDB con pymongo

Requiere MongoDB en ejecución (secciones 2.3, 3.3 o 4.3) y `MONGO_URI` en el `.env`.

**a) CRUD en consola** (para las capturas de la guía: `insert_one`, `find`, `update_one`,
`delete_one`):

Fedora / Arch:

```bash
cd Actividad-4/Scripts && python crud_consola.py && cd ../..
```

Windows:

```powershell
cd Actividad-4\Scripts; python crud_consola.py; cd ..\..
```

Crea un producto de prueba, lo lista, lo actualiza (precio y descuento) y lo elimina.

**b) Tienda web en tiempo real:**

Fedora / Arch:

```bash
cd Actividad-4/Scripts && python app.py
```

Windows:

```powershell
cd Actividad-4\Scripts; python app.py
```

Cuando aparezca `[OK] Tienda: http://127.0.0.1:5000/`, abra en el navegador:

- **Tienda:** <http://127.0.0.1:5000/>
- **Panel de administración:** <http://127.0.0.1:5000/admin> (clave = `ADMIN_PASSWORD` del `.env`)

**Deje esa terminal abierta** mientras use la tienda; para detener el servidor presione `Ctrl+C`.
La primera vez se cargan 22 prendas (11 de Mujer y 11 de Hombre).

Qué se puede hacer:

| En la tienda | En el admin |
|---|---|
| Cambiar entre **Mujer** y **Hombre**, filtrar por categoría y ordenar por precio, descuento o calificación | Crear, editar y eliminar productos |
| Abrir una prenda para ver especificaciones, colores, tallas y estrellas | Cambiar precio, descuento (deslizador), colores, tallas, género y categoría |
| Agregar a la bolsa (desde el detalle o con "Agregar rápido") | Cada cambio guardado aparece **al instante** en la tienda, sin recargar |
| Finalizar la compra: pide **iniciar sesión o crear cuenta** | |
| Calificar prendas (una vez por cuenta) y ver "Mis pedidos" | |

**Para ver el tiempo real:** abra la tienda y el admin en dos pestañas (o dos ventanas lado a
lado), cambie un precio en el admin y presione **Guardar cambios**.

**Fondo de arena interactiva:** al pasar el mouse la arena se aparta y vuelve a su forma en
aproximadamente un segundo; la linterna sigue al puntero. La calidad se ajusta sola al equipo.
Para forzar un nivel agregue a la dirección `?arena=2` (alto), `?arena=1` (medio) o `?arena=0`
(bajo), por ejemplo <http://127.0.0.1:5000/?arena=2>.

Colecciones que se crean en MongoDB (base `tienda_ropa`): `productos`, `usuarios` (contraseñas
guardadas con hash, nunca en texto plano), `pedidos` y `meta`. Para revisarlas:

```bash
mongosh tienda_ropa --eval "db.productos.countDocuments(); db.usuarios.find({}, {nombre:1, email:1, clave_hash:1}).limit(2)"
```

O conéctese con **MongoDB Compass** a `mongodb://127.0.0.1:27017`.

Más detalles técnicos de la Actividad 4 en [Actividad-4/README.md](Actividad-4/README.md).

### Actividad 5 – Proyecto integrador *Campus*

Requiere MariaDB con la base `Guia_8` (sección 6) y MongoDB en ejecución. Usa las mismas tablas,
datos y procedimientos de las Actividades 1 a 3; solo agrega las tablas `Usuario`, `Pago` y
`ReservaLaboratorio` (se crean solas al iniciar) y la base `campus` en MongoDB (bitácora,
preferencias, publicaciones, foros, aula virtual, reconocimiento docente, monitorías, certificados,
contratos y recursos). Es un portal académico completo: inicio, asignaturas, inscripción, aula
virtual, horario, históricos, registro académico, orden de matrícula, pagos en línea (simulados),
contrato, certificados, foros, laboratorios, ciencias básicas, bases de datos en línea y
reconocimiento docente.

Se usan **dos terminales**, ambas con el entorno virtual activado.

**Terminal 1 – la web** (estudiantes, profesores y público general):

Fedora / Arch:

```bash
cd Actividad-5/Scripts && python app.py
```

Windows:

```powershell
cd Actividad-5\Scripts; python app.py
```

Abra <http://127.0.0.1:5050/> y deje esta terminal abierta.

**Terminal 2 – el administrador** (solo entra por aquí):

Fedora / Arch:

```bash
cd Actividad-5/Scripts && python admin.py
```

Windows:

```powershell
cd Actividad-5\Scripts; python admin.py
```

La primera vez pide crear la cuenta del administrador. En la web, los estudiantes y profesores
entran con **Activar cuenta** (documento o código + correo institucional) y el público con **Crear
cuenta**. Ejemplo: estudiante `1030281186` con `andresduenas.fm@academia.umb.edu.co`; profesor
`501` con `john.hernandezm@docentes.umb.edu.co`.

Todo el detalle (roles, consola, seguridad, datos de prueba y **guion para el video de 3
minutos**) está en [Actividad-5/README.md](Actividad-5/README.md).

---

## 8. Tiempo real con Change Streams (opcional)

La tienda se actualiza en tiempo real de todas formas. La diferencia:

- **Sin replica set** (MongoDB local recién instalado): la consola muestra
  `[AVISO] Change Streams no disponibles … Se notificará desde la API`. Los cambios hechos desde el
  admin llegan al instante; los hechos por fuera de la app (Compass, `mongosh`) no.
- **Con replica set o con Atlas:** se usa `coleccion.watch()` y **cualquier** cambio en la
  colección llega a la tienda, incluso si se hace desde Compass. La consola muestra
  `[OK] Change Stream activo`.

Atlas ya es un replica set: no hay que hacer nada. Para activarlo en MongoDB local:

**1. Editar la configuración de MongoDB**

- Fedora / Arch: `sudo nano /etc/mongod.conf` (en Arch puede ser `/etc/mongodb.conf`)
- Windows: abra el Bloc de notas **como administrador** y edite
  `C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg`

Agregue al final (con los dos espacios de la segunda línea; si ya existe una línea
`#replication:`, déjela comentada):

```yaml
replication:
  replSetName: rs0
```

**2. Reiniciar MongoDB e iniciar el replica set**

Fedora:

```bash
sudo systemctl restart mongod && mongosh --quiet --eval "rs.initiate()"
```

Arch:

```bash
sudo systemctl restart mongodb && mongosh --quiet --eval "rs.initiate()"
```

Windows (PowerShell como administrador):

```powershell
Restart-Service MongoDB; mongosh --quiet --eval "rs.initiate()"
```

**3. Ajustar el `.env`**

```
MONGO_URI=mongodb://127.0.0.1:27017/?directConnection=true
```

Reinicie `app.py` (`Ctrl+C` y otra vez `python app.py`).

---

## 9. Capturas para la entrega

Guárdelas en la carpeta `Capturas/` de cada actividad. Tome cada captura desde el comando
ejecutado, con el nombre actual del archivo visible.

| Actividad | Capturas |
|---|---|
| 1 | Conexión exitosa (que se vea `[OK] Conexión establecida` y la tabla) · Error de acceso 1045 |
| 2 | Insertar · Consultar (listar o buscar) · Actualizar · Eliminar con confirmación · Error por llave foránea |
| 3 | Registrar matrícula con la `[RESPUESTA OUT DEL SP]` (y el caso de error con `999`) · Calcular promedio · Actualizar estado del curso |
| 4 | Salida completa de `crud_consola.py` · Tienda y admin lado a lado con un cambio en vivo · Detalle de una prenda · Inicio de sesión al comprar y pedido confirmado · Colecciones `productos`, `usuarios` y `pedidos` en Compass · Un error de validación (por ejemplo, clave de admin incorrecta) |
| 5 | Consola del admin (menú y tablero) · Matrícula por la terminal (éxito y error) · Portada web · Panel del estudiante · Planilla y cierre de curso del profesor · Notificación en vivo tras una acción de la terminal · Colecciones `bitacora` y `preferencias` en Compass · Tabla `Usuario` con `ClaveHash` |

---

## 10. Solución de problemas

| Mensaje o síntoma | Causa | Solución |
|---|---|---|
| `ModuleNotFoundError: No module named 'mysql'` / `'dotenv'` / `'flask'` | El entorno virtual no está activado, o el `.venv` viene de otro equipo | Active el entorno (sección 5.2). Si sigue, borre `.venv` y créelo de nuevo |
| `error: externally-managed-environment` (Arch) | Se intentó instalar con `pip` fuera del entorno virtual | Active `.venv` antes de `pip install` |
| `ERROR: Could not open requirements file` | Se ejecutó `pip` desde otra carpeta | Vuelva a la carpeta raíz del proyecto |
| `Access denied for user 'root'@'localhost'` (1698) | En Linux, `root` de MariaDB solo entra con `sudo mysql` | Use el usuario `guia8` (sección 6.1) |
| `Access denied for user 'guia8'…` (1045) | La contraseña del `.env` no coincide con la del usuario | Revise `DB_USER` y `DB_PASSWORD` en el `.env` |
| `Can't connect to MySQL server on '127.0.0.1:3306'` (2003) | MariaDB/MySQL no está iniciado | Linux: `sudo systemctl start mariadb` · Windows: vea el nombre del servicio con `Get-Service *maria*, *mysql*` e inícielo con `Start-Service <nombre>` |
| `PROCEDURE Guia_8.sp_… does not exist` | No se ejecutó el SQL de la Actividad 3 | Ejecute `Procedimientos almacenados.sql` (sección 6) |
| `[ERROR] No se pudo conectar a MongoDB: Falta la cadena de conexión` | No existe el `.env` o falta `MONGO_URI` | Sección 5.4 |
| `… reemplace <db_password>` o `A password is required` | La cadena de Atlas no tiene la clave real | Ponga la clave entre `usuario:` y `@`, sin `< >` |
| `ServerSelectionTimeoutError` / `Connection refused` en el puerto 27017 | MongoDB no está iniciado | Fedora: `sudo systemctl start mongod` · Arch: `sudo systemctl start mongodb` · Windows: `Start-Service MongoDB` |
| `bad auth : authentication failed` (Atlas) | Usuario o clave de Atlas incorrectos | Cambie la clave en Atlas (sección 5.4) y actualice el `.env` |
| El navegador dice `ERR_CONNECTION_REFUSED` | El servidor `app.py` no está corriendo o se cerró su terminal | Ejecute `python app.py` y deje la terminal abierta |
| `Address already in use` (puerto 5000 ocupado) | Ya hay otro `app.py` corriendo | Cierre el otro, o use otro puerto: Linux `PORT=5001 python app.py` · Windows `$env:PORT=5001; python app.py` |
| `[AVISO] Change Streams no disponibles` | MongoDB local sin replica set | Es normal; la tienda funciona igual. Ver sección 8 |
| `nano: command not found` (Fedora) | Fedora no trae nano | `sudo dnf install nano` |
| `code: command not found` | VS Code no agregó su comando a la terminal | Abra el archivo desde VS Code, o use `nano` / `notepad` |
| `.\.venv\Scripts\Activate.ps1 no se puede cargar…` (Windows) | Política de ejecución de PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (sección 4.5) |
| La tienda se ve sin el fondo de arena | El navegador no tiene WebGL2 o la aceleración gráfica está apagada | Brave/Chrome: Configuración → Sistema → "Usar aceleración de gráficos" y reinicie el navegador |
| El fondo de arena quedó quieto en un equipo que sí es bueno | Un momento lento hizo que la arena se apagara (se recuerda 3 días) | En el navegador presione `F12` → Consola y ejecute `localStorage.removeItem("arena-calidad")`; luego recargue |
| Los cambios de diseño no aparecen | El navegador guardó la versión anterior | Recargue con `Ctrl+Shift+R` |
| `El administrador ingresa por la terminal` (Campus) | Se intentó entrar a la web con la cuenta de administrador | Es intencional: el administrador usa `python admin.py` |
| `El documento y el correo institucional no coinciden` (Campus) | Datos distintos a los de la tabla `Estudiante` / `Profesor` | Use exactamente el documento y el correo registrados (ver Actividad-5/README.md) |
| `Unknown database 'Guia_8'` (1049) | No se ejecutó `01_Tablas.sql` | Ejecute los 3 scripts de la sección 6 **en orden** |
| Olvidé la contraseña del administrador de Campus | — | Ejecute `sudo mariadb Guia_8 -e "DELETE FROM Usuario WHERE Rol='admin';"` y al abrir `admin.py` creará uno nuevo |

---

## 11. Estructura del proyecto

```
Guia8DB-main/
├── README.md                     ← este archivo
├── requirements.txt              ← librerías de Python
├── .env.example                  ← plantilla del .env (el .env real no se sube)
├── Tablas y datos/
│   ├── 01_Tablas.sql             ← crea la BD Guia_8 y sus tablas
│   └── 02_Datos.sql              ← datos de ejemplo
├── Actividad-1/Scripts/Conexion basica.py
├── Actividad-2/Scripts/Crud.py
├── Actividad-3/Scripts/
│   ├── Procedimientos almacenados.sql   ← los 3 procedimientos (adaptados de la Práctica 5)
│   └── Procedimientos almacenados.py
├── Actividad-4/
│   ├── README.md                 ← detalle técnico de la tienda
│   └── Scripts/
│       ├── tienda_dao.py         ← acceso a datos (patrón DAO): productos, usuarios, pedidos
│       ├── crud_consola.py       ← CRUD de la guía en consola
│       ├── app.py                ← servidor Flask (API, sesiones, tiempo real)
│       └── static/               ← interfaz web: tienda.html, admin.html, css/, js/
└── Actividad-5/
    ├── README.md                 ← Campus: roles, consola, seguridad y guion del video
    └── Scripts/
        ├── config.py             ← .env, pool de MySQL, cliente de MongoDB
        ├── sql/usuarios.sql      ← tablas Usuario, Pago y ReservaLaboratorio
        ├── dao_mysql.py          ← DAO de MySQL (cuentas, cursos, procedimientos, pagos, laboratorios)
        ├── dao_mongo.py          ← DAO de MongoDB (bitácora, foros, aula, certificados…)
        ├── horarios.py           ← cruces de horario y horario ideal
        ├── app.py                ← web para estudiantes, profesores y público
        ├── rutas_campus.py       ← API de las secciones del portal
        ├── admin.py              ← consola del administrador
        └── static/               ← interfaz web (campus.html, css/, js/)
```

**Seguridad aplicada en todo el proyecto:** credenciales fuera del código (`.env`), consultas
parametrizadas en SQL, validación por lista blanca en MongoDB (evita inyección NoSQL),
contraseñas de clientes con hash, cookie de sesión firmada (`HttpOnly`, `SameSite=Lax`) y precios
de los pedidos calculados en el servidor.
