#!/usr/bin/env bash
# Instala y deja listo todo lo de la Guía 8 en Debian 12/13, Raspberry Pi OS y Ubuntu.
#   - MariaDB con la base Guia_8, sus datos, los procedimientos y el usuario guia8
#   - MongoDB en un contenedor Docker (MongoDB no tiene paquetes de Debian para ARM)
#   - Entorno virtual .venv con las librerías de requirements.txt
#   - Archivo .env con una SECRET_KEY nueva
#
# Uso, desde la carpeta raíz del proyecto:
#   bash instalar_debian.sh
#
# Se puede ejecutar varias veces: no borra datos que ya existan.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
if [ ! -f requirements.txt ] || [ ! -d "Tablas y datos" ]; then
    echo "[ERROR] Ejecute este script desde la carpeta raíz del proyecto." >&2
    exit 1
fi

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

paso() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
error() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

# Arranca y deja habilitado un servicio (con systemd, o con "service" si no hay systemd)
encender() {
    if [ -d /run/systemd/system ]; then
        $SUDO systemctl enable --now "$1"
    else
        $SUDO service "$1" start
    fi
}

# ---------------------------------------------------------------------------
paso "1/6 Comprobando el equipo"
ARQ="$(uname -m)"
MODELO="$( { tr -d '\0' < /proc/device-tree/model; } 2>/dev/null || true)"
echo "Arquitectura: $ARQ ${MODELO:+· $MODELO}"

case "$ARQ" in
    x86_64)
        # MongoDB 5.0 o superior necesita AVX en procesadores de PC
        if grep -qw avx /proc/cpuinfo; then IMAGEN_MONGO="mongo:7"; else IMAGEN_MONGO="mongo:4.4.18"; fi ;;
    aarch64|arm64)
        # MongoDB 5.0 o superior necesita ARMv8.2 (Raspberry Pi 5 sí; Pi 4 y 3 no)
        if grep -qw atomics /proc/cpuinfo; then IMAGEN_MONGO="mongo:7"; else IMAGEN_MONGO="mongo:4.4.18"; fi ;;
    *)
        error "Sistema de 32 bits ($ARQ): MongoDB no funciona aquí. Instale la versión de 64 bits del sistema o use MongoDB Atlas (README, sección 5.4)." ;;
esac
ok "Se usará MongoDB con la imagen $IMAGEN_MONGO"

# ---------------------------------------------------------------------------
paso "2/6 Instalando paquetes del sistema (pide su contraseña)"
$SUDO apt-get update
$SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y \
    python3 python3-venv python3-pip nano curl mariadb-server mariadb-client docker.io
encender mariadb
encender docker
ok "MariaDB y Docker encendidos"

# ---------------------------------------------------------------------------
paso "3/6 MongoDB en Docker"
if $SUDO docker container inspect mongo >/dev/null 2>&1; then
    $SUDO docker start mongo >/dev/null
    echo "El contenedor 'mongo' ya existía; se encendió."
else
    $SUDO docker run -d --name mongo --restart unless-stopped \
        -p 127.0.0.1:27017:27017 -v mongo-datos:/data/db "$IMAGEN_MONGO" >/dev/null
fi

for _ in $(seq 60); do
    if (echo > /dev/tcp/127.0.0.1/27017) 2>/dev/null; then break; fi
    sleep 1
done
if [ "$($SUDO docker inspect -f '{{.State.Running}}' mongo)" != "true" ] \
   || ! (echo > /dev/tcp/127.0.0.1/27017) 2>/dev/null; then
    $SUDO docker logs --tail 20 mongo || true
    error "MongoDB no arrancó. Si arriba dice 'Illegal instruction', borre el contenedor con 'sudo docker rm -f mongo' y vuelva a ejecutar el script."
fi
ok "MongoDB escuchando en 127.0.0.1:27017 (se enciende solo al iniciar el equipo)"

# ---------------------------------------------------------------------------
paso "4/6 Base de datos MySQL/MariaDB Guia_8"
SQL="$SUDO mariadb"
if $SQL -N -e "SELECT 1 FROM information_schema.tables WHERE table_schema='Guia_8' AND table_name='Estudiante'" | grep -q 1; then
    echo "La base Guia_8 ya existe: no se toca (para no borrar sus datos)."
else
    $SQL < "Tablas y datos/01_Tablas.sql"
    $SQL Guia_8 < "Tablas y datos/02_Datos.sql"
    echo "Tablas y datos cargados."
fi
$SQL Guia_8 < "Actividad-3/Scripts/Procedimientos almacenados.sql"
$SQL -e "CREATE USER IF NOT EXISTS 'guia8'@'localhost' IDENTIFIED BY 'Guia8-2026';
         CREATE USER IF NOT EXISTS 'guia8'@'127.0.0.1' IDENTIFIED BY 'Guia8-2026';
         GRANT ALL PRIVILEGES ON Guia_8.* TO 'guia8'@'localhost';
         GRANT ALL PRIVILEGES ON Guia_8.* TO 'guia8'@'127.0.0.1';
         FLUSH PRIVILEGES;"
ok "Base Guia_8, procedimientos y usuario guia8 listos"

# ---------------------------------------------------------------------------
paso "5/6 Entorno virtual de Python y librerías"
if [ ! -x .venv/bin/python ] || ! .venv/bin/python -c "import sys" 2>/dev/null; then
    rm -rf .venv
    python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
ok "Librerías instaladas en .venv"

if [ ! -f .env ]; then
    cp .env.example .env
    CLAVE="$(.venv/bin/python -c 'import secrets; print(secrets.token_hex(32))')"
    sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$CLAVE/" .env
    ok "Archivo .env creado con una SECRET_KEY nueva"
else
    echo "El archivo .env ya existía; no se modificó."
fi

# ---------------------------------------------------------------------------
paso "6/6 Probando las conexiones desde Python"
.venv/bin/python - <<'PY'
import os
from dotenv import load_dotenv
import mysql.connector
from pymongo import MongoClient

load_dotenv(".env")
con = mysql.connector.connect(
    host=os.getenv("DB_HOST"), port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
)
cur = con.cursor()
cur.execute("SELECT COUNT(*) FROM Estudiante")
print(f"[OK] MariaDB: {cur.fetchone()[0]} estudiantes en Guia_8")
con.close()

cliente = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=5000)
version = cliente.server_info()["version"]
print(f"[OK] MongoDB {version} responde")
PY

cat <<'FIN'

==========================================================
 Todo listo. Para trabajar, cada vez:

   sudo systemctl start mariadb
   source .venv/bin/activate

 Actividad 4:
   cd Actividad-4/Scripts && python crud_consola.py && cd ../..
   cd Actividad-4/Scripts && python app.py      -> http://127.0.0.1:5000/

 Actividad 5 (dos terminales):
   cd Actividad-5/Scripts && python app.py      -> http://127.0.0.1:5050/
   cd Actividad-5/Scripts && python admin.py

 Consola de MongoDB:
   sudo docker exec -it mongo mongosh tienda_ropa
   (con la imagen mongo:4.4.18 el comando es "mongo" en vez de "mongosh")
==========================================================
FIN
