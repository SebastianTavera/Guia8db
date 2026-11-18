"""
Actividad 1 - Conexión básica Python-MySQL (Guía 8)

Pasos de una operación con MySQL Connector:
  1. Instalar el conector  -> pip install -r requirements.txt
  2. Conectar al SGBD      -> mysql.connector.connect(...)
  3. Crear un cursor       -> conexion.cursor()
  4. Ejecutar la consulta  -> cursor.execute(...) + fetchall()
  5. Cerrar recursos       -> cursor.close() y conexion.close()

Las credenciales NO se escriben en el código: se leen de variables de entorno
(DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME). Ver .env.example.
"""
import os
from pathlib import Path

try:  # lee el archivo .env de la raíz del proyecto (si python-dotenv está instalado)
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass

import mysql.connector
from mysql.connector import Error

# Configuración de conexión tomada del entorno (con valores por defecto locales)
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "Guia_8"),
}


def conectar_y_consultar():
    conexion = None
    cursor = None
    try:
        # 1. Conexión a la base de datos Guia_8
        conexion = mysql.connector.connect(**DB_CONFIG)

        if conexion.is_connected():
            print(f"[OK] Conexión establecida con el servidor (Versión: {conexion.server_info})")
            print(f"[OK] Base de datos activa: {DB_CONFIG['database']}")
            print("=" * 90)

            # 2. Ejecutar consulta SELECT cruzando Estudiante y sus matrículas
            cursor = conexion.cursor()
            query = """
                SELECT
                    e.IdEstudiante,
                    CONCAT(e.PrimerNombre, ' ', e.PrimerApellido) AS Estudiante,
                    e.CorreoEstudiante,
                    COUNT(m.IdMatricula) AS MateriasInscritas
                FROM Estudiante e
                LEFT JOIN Matricula m ON e.IdEstudiante = m.IdEstudiante
                GROUP BY e.IdEstudiante, e.PrimerNombre, e.PrimerApellido, e.CorreoEstudiante
                ORDER BY e.PrimerApellido;
            """
            cursor.execute(query)
            resultados = cursor.fetchall()

            # 3. Mostrar resultados en consola
            print(f"{'ID ESTUDIANTE':<15} | {'NOMBRE COMPLETO':<22} | {'CORREO':<36} | {'MATRÍCULAS'}")
            print("-" * 90)
            for id_est, nombre, correo, total_mat in resultados:
                print(f"{id_est:<15} | {nombre:<22} | {correo:<36} | {total_mat}")

            print("=" * 90)
            print(f"Total de registros recuperados: {len(resultados)}")

    except Error as err:
        # 4. Manejo de errores (credenciales incorrectas, servicio detenido, tabla inexistente)
        print(f"[ERROR SQL/CONEXIÓN] Fallo al interactuar con la base de datos: {err}")

    finally:
        # 5. Cierre controlado de cursor y conexión (evita fugas de recursos)
        if cursor is not None:
            cursor.close()
        if conexion is not None and conexion.is_connected():
            conexion.close()
            print("[INFO] Conexión cerrada de forma segura.")


if __name__ == "__main__":
    conectar_y_consultar()
