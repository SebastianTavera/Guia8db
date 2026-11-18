# Actividad 4 – MongoDB desde Python (pymongo)

Tienda de ropa **Monocromo**. Un panel de administración crea, edita y elimina prendas
(precio, descuento, colores, tallas) en **MongoDB**, y la tienda del cliente muestra cada
cambio **en tiempo real**, sin recargar la página. Los clientes crean su cuenta, compran y
califican prendas; todo queda guardado en MongoDB.

## Contenido

1. [Qué pide la guía y dónde está](#1-qué-pide-la-guía-y-dónde-está)
2. [Qué hay que descargar](#2-qué-hay-que-descargar)
3. [Preparar el proyecto (una sola vez)](#3-preparar-el-proyecto-una-sola-vez)
4. [Ejecutar](#4-ejecutar)
5. [Consultas de prueba en MongoDB](#5-consultas-de-prueba-en-mongodb)
6. [Recorrido de prueba completo](#6-recorrido-de-prueba-completo)
7. [Cómo funciona por dentro](#7-cómo-funciona-por-dentro)
8. [Solución de problemas](#8-solución-de-problemas)
9. [Capturas](#9-capturas)

---

## 1. Qué pide la guía y dónde está

| Requisito | Dónde se cumple |
|---|---|
| Conectarse a MongoDB desde Python | `tienda_dao.py` → `conectar()` con `pymongo.MongoClient` y un `ping` de verificación |
| **Create** (`insert_one`) | `ProductoDAO.crear`, `UsuarioDAO.registrar`, `PedidoDAO.crear` |
| **Read** (`find`, `find_one`) | `ProductoDAO.listar` y `ProductoDAO.obtener` |
| **Update** (`update_one`) | `ProductoDAO.actualizar` (`$set`) y `sumar_calificacion` (`$inc`) |
| **Delete** (`delete_one`) | `ProductoDAO.eliminar` |
| Demostración de las 4 operaciones | `crud_consola.py` (salida en la [captura 1](#9-capturas)) |
| Validación y seguridad | Lista blanca de campos y tipos (bloquea inyección NoSQL como `{"$where": …}`), contraseñas con hash, clave de administrador |

| Archivo | Qué hace |
|---|---|
| `Scripts/tienda_dao.py` | Acceso a datos (patrón DAO): `ProductoDAO`, `UsuarioDAO`, `PedidoDAO` y la validación |
| `Scripts/crud_consola.py` | Demostración en consola: `insert_one` → `find` → `update_one` → `delete_one` |
| `Scripts/app.py` | Servidor web Flask: API, sesiones, clave del admin y canal en vivo |
| `Scripts/static/` | Interfaz: `tienda.html`, `admin.html`, `css/` y `js/` |

---

## 2. Qué hay que descargar

| Programa | Para qué | Obligatorio |
|---|---|---|
| **Python 3.10 o superior** | Ejecutar los scripts | Sí |
| **MongoDB Community Server** | La base de datos (`mongod`) | Sí |
| **mongosh** | Consola de MongoDB para las consultas de la sección 5 | Recomendado |
| **MongoDB Compass** | Ver las colecciones de forma gráfica (útil para capturas) | Opcional |
| Un navegador (Chrome, Firefox, Edge…) | Abrir la tienda y el admin | Sí |

Librerías de Python (se instalan con `pip`, sección 3): `pymongo`, `Flask`, `python-dotenv`
(están en `requirements.txt`, en la raíz del proyecto).

### Fedora

```bash
sudo dnf install python3 python3-pip
```

MongoDB no está en los repositorios de Fedora; se agrega el repositorio oficial:

```bash
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo > /dev/null <<'EOF'
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-7.0.asc
EOF
sudo dnf install mongodb-org
sudo systemctl enable --now mongod
```

`mongodb-org` trae el servidor (`mongod`) y `mongosh`. Compass (opcional): descargar el
`.rpm` de <https://www.mongodb.com/try/download/compass> y ejecutar
`sudo dnf install ./mongodb-compass-*.x86_64.rpm`.

### Arch Linux

```bash
sudo pacman -S python python-pip
yay -S mongodb-bin mongosh-bin
sudo systemctl enable --now mongodb
```

(Si no tiene `yay`: `sudo pacman -S --needed git base-devel`, luego
`git clone https://aur.archlinux.org/yay-bin.git && cd yay-bin && makepkg -si`.)

### Windows (PowerShell)

```powershell
winget install Python.Python.3.13
winget install MongoDB.Server
winget install MongoDB.Shell
```

En el instalador de Python marque **"Add python.exe to PATH"**. MongoDB queda instalado
como servicio que arranca solo; compruébelo con `Get-Service MongoDB` (debe decir `Running`).

---

## 3. Preparar el proyecto (una sola vez)

Todos los comandos se escriben desde la carpeta del proyecto (`Guia8DB-main`).

### 3.1 Entorno virtual e instalación de librerías

Fedora / Arch:

```bash
cd ~/Downloads/Guia8DB-main
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows:

```powershell
cd $HOME\Downloads\Guia8DB-main
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> Si PowerShell no deja activar el entorno, ejecute una vez
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y vuelva a intentarlo.

> **Importante:** el entorno virtual queda atado a la versión de Python con la que se creó.
> Si actualiza Python (por ejemplo de 3.13 a 3.14) o copia la carpeta a otro equipo, borre
> `.venv` y repita este paso. Si no, aparece `ModuleNotFoundError` (sección 8).

### 3.2 Archivo `.env`

Copie la plantilla:

```bash
cp .env.example .env
```

(En Windows: `Copy-Item .env.example .env`.) Las variables que usa esta actividad:

| Variable | Valor por defecto | Qué es |
|---|---|---|
| `MONGO_URI` | `mongodb://127.0.0.1:27017` | Dónde está MongoDB (local). Para Atlas, la cadena `mongodb+srv://…` |
| `MONGO_DB` | `tienda_ropa` | Nombre de la base de la tienda |
| `ADMIN_PASSWORD` | `Admin2026` | Clave para entrar a `/admin` |
| `SECRET_KEY` | (texto largo) | Firma de la cookie de sesión de los clientes |
| `PORT` (opcional) | `5000` | Puerto de la web |

Si `ADMIN_PASSWORD` no está definida, la consola muestra una clave temporal distinta en cada
ejecución.

---

## 4. Ejecutar

**Antes de cada sesión**, MongoDB debe estar encendido (después de reiniciar el PC):

| Sistema | Comando |
|---|---|
| Fedora | `sudo systemctl start mongod` |
| Arch | `sudo systemctl start mongodb` |
| Windows | `Start-Service MongoDB` |

Y en **cada terminal nueva** hay que activar el entorno virtual y entrar a la carpeta:

Fedora / Arch:

```bash
cd ~/Downloads/Guia8DB-main/Actividad-4/Scripts
source ../../.venv/bin/activate
```

Windows:

```powershell
cd $HOME\Downloads\Guia8DB-main\Actividad-4\Scripts
..\..\.venv\Scripts\Activate.ps1
```

### 4.1 CRUD en consola (lo que pide la guía)

```bash
python crud_consola.py
```

Crea un producto de prueba (`insert_one`), lista todos (`find`), le cambia el precio de
150.000 a 120.000 con 25 % de descuento (`update_one`) y lo elimina (`delete_one`). No deja
cambios en la tienda.

### 4.2 Tienda web en tiempo real

```bash
python app.py
```

Cuando aparezca `[OK] Tienda: http://127.0.0.1:5000/`, abra:

| Página | Dirección | Acceso |
|---|---|---|
| Tienda | <http://127.0.0.1:5000/> | Libre; para comprar o calificar se crea una cuenta |
| Panel de administración | <http://127.0.0.1:5000/admin> | Clave `ADMIN_PASSWORD` del `.env` (`Admin2026`) |

Deje la terminal abierta mientras usa la tienda. Para detener el servidor: **Ctrl+C**.
La primera vez se cargan 22 prendas (11 de Mujer y 11 de Hombre).

Opcional: la calidad del fondo animado se ajusta sola al equipo; para forzarla agregue
`?arena=2` (alta), `?arena=1` (media) o `?arena=0` (baja), por ejemplo
<http://127.0.0.1:5000/?arena=0>.

---

## 5. Consultas de prueba en MongoDB

Sirven para comprobar en la base lo que hacen los scripts y la web. Hay dos formas de
ejecutarlas.

**Forma A: consola interactiva** (recomendada para ver resultados con formato):

```bash
mongosh tienda_ropa
```

Se abre el prompt `tienda_ropa>`; ahí pegue cada consulta. Para salir: `exit`.

**Forma B: una sola línea desde la terminal** (útil para capturas):

```bash
mongosh tienda_ropa --quiet --eval 'db.productos.countDocuments()'
```

### 5.1 Lectura (Read)

```javascript
// ¿Cuántas prendas hay? → 22
db.productos.countDocuments()

// Todas las prendas: solo nombre, precio y descuento
db.productos.find({}, { _id: 0, nombre: 1, precio: 1, descuento: 1 })

// Una prenda concreta
db.productos.findOne({ nombre: "Camisa Oxford" })

// Prendas de Mujer, de la más cara a la más barata
db.productos.find({ genero: "Mujer" }, { _id: 0, nombre: 1, precio: 1 }).sort({ precio: -1 })

// Prendas en oferta (descuento mayor que 0)
db.productos.find({ descuento: { $gt: 0 } }, { _id: 0, nombre: 1, descuento: 1 })

// Prendas entre $100.000 y $250.000
db.productos.find({ precio: { $gte: 100000, $lte: 250000 } }, { _id: 0, nombre: 1, precio: 1 })

// Prendas que tienen talla XS
db.productos.find({ tallas: "XS" }, { _id: 0, nombre: 1, tallas: 1 })

// Buscar por texto en el nombre (sin distinguir mayúsculas)
db.productos.find({ nombre: { $regex: "camis", $options: "i" } }, { _id: 0, nombre: 1 })

// Las 3 prendas mejor calificadas (promedio = puntos / reseñas)
db.productos.aggregate([
  { $project: { _id: 0, nombre: 1, promedio: { $round: [{ $divide: ["$puntos", "$resenas"] }, 2] } } },
  { $sort: { promedio: -1 } }, { $limit: 3 }
])

// Cuántas prendas hay por categoría y su precio promedio (agregación)
db.productos.aggregate([
  { $group: { _id: "$categoria", prendas: { $sum: 1 }, precioPromedio: { $avg: "$precio" } } },
  { $sort: { prendas: -1 } }
])
```

### 5.2 Creación, actualización y borrado (Create, Update, Delete)

Haga esta secuencia con la tienda abierta: **cada cambio aparece en la página al instante**
si los Change Streams están activos (sección 7).

```javascript
// Create: insertar una prenda de prueba
db.productos.insertOne({
  nombre: "Prenda Consulta", descripcion: "Creada desde mongosh", genero: "Mujer",
  categoria: "Camisetas", prenda: "camiseta", precio: 99000, descuento: 0,
  colores: [{ nombre: "Negro", hex: "#111111" }], tallas: ["S", "M"],
  especificaciones: {}, puntos: 0, resenas: 0, creado: new Date(), actualizado: new Date()
})

// Update: bajar el precio y poner 20 % de descuento
db.productos.updateOne({ nombre: "Prenda Consulta" }, { $set: { precio: 79000, descuento: 20, actualizado: new Date() } })

// Comprobar el cambio
db.productos.findOne({ nombre: "Prenda Consulta" }, { _id: 0, nombre: 1, precio: 1, descuento: 1 })

// Delete: eliminarla
db.productos.deleteOne({ nombre: "Prenda Consulta" })
```

Equivalencias con Python (`pymongo`), que es lo que usa `tienda_dao.py`:

| mongosh | pymongo |
|---|---|
| `db.productos.insertOne({...})` | `coleccion.insert_one({...})` |
| `db.productos.find({...})` | `coleccion.find({...})` |
| `db.productos.findOne({...})` | `coleccion.find_one({...})` |
| `db.productos.updateOne(filtro, {$set: {...}})` | `coleccion.update_one(filtro, {"$set": {...}})` |
| `db.productos.deleteOne(filtro)` | `coleccion.delete_one(filtro)` |
| `db.productos.countDocuments()` | `coleccion.count_documents({})` |

### 5.3 Usuarios y pedidos

Primero cree una cuenta y haga una compra en la tienda (sección 6).

```javascript
// Usuarios: la contraseña NO se guarda en texto plano, solo su hash
db.usuarios.find({}, { _id: 0, nombre: 1, email: 1, clave_hash: 1 })

// El correo es único: este índice impide dos cuentas con el mismo email
db.usuarios.getIndexes()

// Últimos pedidos con su total
db.pedidos.find({}, { _id: 0, cliente: 1, total: 1, estado: 1, creado: 1 }).sort({ creado: -1 }).limit(5)

// Detalle de las prendas de un pedido
db.pedidos.findOne({}, { _id: 0, cliente: 1, items: 1, total: 1 })

// Total vendido y número de pedidos (agregación)
db.pedidos.aggregate([{ $group: { _id: null, pedidos: { $sum: 1 }, vendido: { $sum: "$total" } } }])

// Prendas más vendidas
db.pedidos.aggregate([
  { $unwind: "$items" },
  { $group: { _id: "$items.nombre", unidades: { $sum: "$items.cantidad" } } },
  { $sort: { unidades: -1 } }
])
```

### 5.4 Comprobar la validación (errores esperados)

Desde la web, el servidor rechaza datos inválidos antes de llegar a MongoDB. Pruébelo en el
admin:

| Acción en el admin | Resultado esperado |
|---|---|
| Entrar con una clave incorrecta | "Clave incorrecta" (no entra) |
| Guardar un producto sin nombre, sin colores o sin tallas | El botón **Guardar** queda desactivado |
| Escribir un precio de 0 o mayor que 50.000.000 | No se puede guardar |
| El deslizador de descuento | Solo permite de 0 % a 90 % |

Y en la tienda: crear una cuenta con un correo ya registrado → "Ya existe una cuenta con ese
correo"; contraseña de menos de 8 caracteres → no se permite.

---

## 6. Recorrido de prueba completo

1. **Consola:** `python crud_consola.py` → deben salir las 4 operaciones con `[OK]`.
2. **Tienda:** `python app.py` y abra <http://127.0.0.1:5000/>. Cambie entre **Mujer** y
   **Hombre**, filtre por categoría y ordene por precio.
3. Abra una prenda: precio, colores, tallas, estrellas y especificaciones.
4. **Admin en otra ventana**, al lado de la tienda: <http://127.0.0.1:5000/admin>, clave
   `Admin2026`.
5. Elija una prenda, cambie el precio y mueva el deslizador de descuento → **Guardar cambios**.
   La tienda se actualiza sola y muestra un aviso.
6. En la tienda, agregue una prenda a la bolsa → **Finalizar compra** → **Crear cuenta**
   (nombre, correo y contraseña de 8 o más caracteres) → el pedido queda confirmado.
7. Califique una prenda con estrellas (solo una vez por cuenta).
8. Revise todo en MongoDB con las consultas de la sección 5.
9. Para dejar todo como estaba: en el admin, vuelva a poner el precio y el descuento
   originales.

---

## 7. Cómo funciona por dentro

### Colecciones (base `tienda_ropa`)

| Colección | Contenido |
|---|---|
| `productos` | Las 22 prendas: nombre, género, categoría, precio, descuento, colores, tallas, especificaciones, puntos y reseñas |
| `usuarios` | Clientes: nombre, email (índice único) y `clave_hash` |
| `pedidos` | Compras: cliente, prendas, subtotal, envío, total y estado |
| `meta` | Control interno de la carga inicial del catálogo |

Ejemplo de documento en `productos`:

```json
{
  "nombre": "Camisa Oxford", "genero": "Hombre", "categoria": "Camisas", "prenda": "camisa",
  "precio": 189000, "descuento": 0,
  "colores": [{ "nombre": "Blanco hueso", "hex": "#f2f0eb" }, { "nombre": "Celeste", "hex": "#b9cde0" }, { "nombre": "Grafito", "hex": "#4a4c50" }],
  "tallas": ["S", "M", "L", "XL"],
  "especificaciones": { "material": "100 % algodón oxford", "ajuste": "Regular" },
  "puntos": 1086, "resenas": 231
}
```

### Tiempo real

1. El admin guarda un cambio → `update_one` en MongoDB.
2. Un hilo del servidor escucha la colección con un **Change Stream** (`coleccion.watch()`).
3. Cada cambio se envía a todos los navegadores abiertos por **Server-Sent Events**
   (`/api/stream`).

Los Change Streams solo funcionan si MongoDB corre como *replica set* (Atlas siempre lo es).
En una instalación local normal, la barra del admin muestra **"En vivo · local"**: los
cambios hechos desde la web llegan igual al instante, pero los hechos desde `mongosh` o
Compass no. Para que también lleguen, active el replica set (una sola vez):

Fedora:

```bash
sudo sed -i 's/^#replication:/replication:\n  replSetName: rs0/' /etc/mongod.conf
sudo systemctl restart mongod
mongosh --quiet --eval 'rs.initiate()'
```

y en el `.env` use `MONGO_URI=mongodb://127.0.0.1:27017/?directConnection=true`. Al iniciar
`app.py` debe aparecer `[OK] Change Stream activo`.

### Seguridad

- **Validación con lista blanca:** solo se aceptan campos conocidos con el tipo y rango
  correctos (precio de 1 a 50.000.000, descuento de 0 a 90, tallas XS–XL, colores `#RRGGBB`).
  Así un valor como `{"$where": "..."}` nunca llega a una consulta (inyección NoSQL).
- **Contraseñas con hash** (`werkzeug.security`, algoritmo scrypt); nunca en texto plano.
- **Precios calculados en el servidor:** el total del pedido se toma de la base de datos, no de
  lo que envía el navegador.
- **Límite de intentos:** 10 intentos de inicio de sesión cada 5 minutos por IP.
- Credenciales fuera del código, en el `.env` (que no se sube a git).

---

## 8. Solución de problemas

| Mensaje | Causa | Solución |
|---|---|---|
| `ModuleNotFoundError: No module named 'flask'` (o `pymongo`, `dotenv`) | El entorno virtual no está activado, o se creó con otra versión de Python | Active el entorno (sección 4). Si sigue: `rm -rf .venv` y repita la sección 3.1 |
| `[ERROR] No se pudo conectar a MongoDB` / `ServerSelectionTimeoutError` | MongoDB está apagado | `sudo systemctl start mongod` (Arch: `mongodb`; Windows: `Start-Service MongoDB`) |
| `Falta la cadena de conexión de MongoDB` | No existe el `.env` o le falta `MONGO_URI` | Sección 3.2 |
| `reemplace <db_password>` | La URI de Atlas aún tiene el texto de ejemplo | Ponga la clave real del usuario de Atlas, sin `< >` |
| `Address already in use` / puerto 5000 ocupado | Ya hay un `app.py` abierto | Ciérrelo con Ctrl+C, o use otro puerto: `PORT=5001 python app.py` |
| La página no carga (`ERR_CONNECTION_REFUSED`) | El servidor no está corriendo | Ejecute `python app.py` y deje la terminal abierta |
| La tienda no cambia al editar en `mongosh` | MongoDB local sin replica set | Normal; vea "Tiempo real" en la sección 7 |
| `mongosh: command not found` | No está instalado | Fedora: viene en `mongodb-org`; Arch: `yay -S mongosh-bin`; Windows: `winget install MongoDB.Shell` |
| La web se ve con la versión anterior | Caché del navegador | Recargue con **Ctrl+Shift+R** |

---

## 9. Capturas

Carpeta `Capturas/`. La tienda sigue el tema del sistema: las capturas muestran el modo
oscuro y el claro.

### 1. CRUD en consola

`crud_consola.py`: `insert_one`, `find`, `update_one` y `delete_one` sobre `productos`.

![CRUD en consola](Capturas/01-consola-crud-mongodb.png)

### 2. Tienda · portada

![Tienda](Capturas/02-tienda-inicio.png)

### 3. Catálogo de Mujer

Precios con descuento, valoraciones y colores de cada prenda.

![Catálogo de Mujer](Capturas/03-catalogo-mujer.png)

### 4. Final del catálogo y pie de página

![Pie de página](Capturas/04-catalogo-pie-de-pagina.png)

### 5. Catálogo de Hombre

![Catálogo de Hombre](Capturas/05-catalogo-hombre.png)

### 6. Detalle de una prenda

![Detalle de una prenda](Capturas/06-detalle-de-prenda.png)

### 7. Iniciar sesión

La contraseña se guarda cifrada en MongoDB.

![Iniciar sesión](Capturas/07-iniciar-sesion.png)

### 8. Crear cuenta

![Crear cuenta](Capturas/08-crear-cuenta.png)

### 9. Admin · acceso con `ADMIN_PASSWORD`

![Acceso al admin](Capturas/09-admin-acceso.png)

### 10. Admin · clave incorrecta

![Clave incorrecta](Capturas/10-admin-clave-incorrecta.png)

### 11. Admin · editor de producto

Género, categoría, silueta, precio, descuento, colores y tallas.

![Editor de producto](Capturas/11-admin-editor-producto.png)

### 12. Admin · especificaciones y descripción

![Especificaciones](Capturas/12-admin-especificaciones.png)

### 13. Admin · lista de las 22 prendas

![Lista de productos](Capturas/13-admin-lista-de-productos.png)

### 14. Admin · otro producto

![Otro producto](Capturas/14-admin-otro-producto.png)

### 15. Admin · cambio de precio y descuento

![Cambio de precio](Capturas/15-admin-cambio-precio-descuento.png)

### 16. Admin · cambio guardado (`update_one`)

![Cambio guardado](Capturas/16-admin-cambio-guardado.png)

### 17. Tiempo real

La tienda, abierta en otra ventana, pasa de $ 189.000 a $ 96.850 sin recargar.

![Tiempo real](Capturas/17-tiempo-real-antes-despues.png)

### 18. Bolsa de compras

![Bolsa de compras](Capturas/18-bolsa-de-compras.png)

### 19. Crear cuenta al comprar

![Crear cuenta al comprar](Capturas/19-crear-cuenta-al-comprar.png)

### 20. Pedido confirmado

El pedido queda guardado en la colección `pedidos`.

![Pedido confirmado](Capturas/20-pedido-confirmado.png)

### 21. Documentos en MongoDB

El producto modificado, un usuario con su contraseña cifrada (`scrypt`) y un pedido.

![Documentos en MongoDB](Capturas/21-mongodb-documentos.png)
