"""
Actividad 3 - Llamada a procedimientos almacenados desde Python (Guía 8)

Se invocan con cursor.callproc(nombre, argumentos). callproc devuelve una
tupla con los argumentos; en las posiciones de los parámetros OUT queda el
valor asignado por el procedimiento. Los argumentos viajan como parámetros,
no concatenados, por lo que también están protegidos contra inyección SQL.

Requiere haber ejecutado "Procedimientos almacenados.sql".
Las credenciales se leen de variables de entorno (ver .env.example).
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

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "Guia_8"),
}


def obtener_conexion():
    """Establece conexión con la base de datos Guia_8."""
    return mysql.connector.connect(**DB_CONFIG)


def cerrar(cursor, conexion):
    """Cierra cursor y conexión si fueron abiertos (evita fugas de recursos)."""
    if cursor is not None:
        cursor.close()
    if conexion is not None and conexion.is_connected():
        conexion.close()


def invocar_registrar_matricula():
    """Llama a sp_registrar_matricula(IN p_IdEstudiante, IN p_IdGrupo, OUT p_Mensaje)."""
    print("\n--- 1. REGISTRAR MATRÍCULA (sp_registrar_matricula) ---")
    conexion = cursor = None
    try:
        id_est = int(input("Ingrese ID del Estudiante (ej. 1030281186 o 999): ").strip())
        id_grupo = int(input("Ingrese ID del Grupo/Curso (ej. 1, 3, 5): ").strip())

        conexion = obtener_conexion()
        cursor = conexion.cursor()

        # Posición 0: IN id_est | Posición 1: IN id_grupo | Posición 2: OUT p_Mensaje (placeholder "")
        argumentos = [id_est, id_grupo, ""]
        resultado = cursor.callproc("sp_registrar_matricula", argumentos)

        # Captura del parámetro OUT desde el índice 2 de la tupla retornada
        mensaje_out = resultado[2]
        print(f"\n[RESPUESTA OUT DEL SP] -> {mensaje_out}")

    except ValueError:
        print("[ERROR] Los IDs deben ser números enteros.")
    except Error as err:
        print(f"[ERROR SQL] Fallo al ejecutar sp_registrar_matricula: {err}")
    finally:
        cerrar(cursor, conexion)


def invocar_calcular_promedio():
    """Llama a sp_calcular_promedio(IN p_IdEstudiante, OUT p_Promedio, OUT p_Clasificacion)."""
    print("\n--- 2. CALCULAR PROMEDIO Y CLASIFICACIÓN (sp_calcular_promedio) ---")
    conexion = cursor = None
    try:
        id_est = int(input("Ingrese ID del Estudiante (ej. 1031422990, 1000000001 o 999): ").strip())

        conexion = obtener_conexion()
        cursor = conexion.cursor()

        # Posición 0: IN id_est | Posición 1: OUT p_Promedio | Posición 2: OUT p_Clasificacion
        argumentos = [id_est, 0.0, ""]
        resultado = cursor.callproc("sp_calcular_promedio", argumentos)

        promedio_out = resultado[1]
        clasificacion_out = resultado[2]

        print("\n[PARÁMETROS OUT CAPTURADOS]")
        print(f"  * Estudiante ID : {id_est}")
        print(f"  * Promedio      : {promedio_out if promedio_out is not None else 'N/A (Sin notas)'}")
        print(f"  * Clasificación : {clasificacion_out}")

    except ValueError:
        print("[ERROR] El ID del estudiante debe ser numérico.")
    except Error as err:
        print(f"[ERROR SQL] Fallo al ejecutar sp_calcular_promedio: {err}")
    finally:
        cerrar(cursor, conexion)


def invocar_actualizar_estado_curso():
    """Llama a sp_actualizar_estado_curso(IN p_IdGrupo, OUT p_Mensaje)."""
    print("\n--- 3. ACTUALIZAR ESTADO DE CURSO CON CURSOR (sp_actualizar_estado_curso) ---")
    conexion = cursor = None
    try:
        id_grupo = int(input("Ingrese ID del Grupo/Curso a evaluar (ej. 1, 2, 4): ").strip())

        conexion = obtener_conexion()
        cursor = conexion.cursor()

        # Posición 0: IN id_grupo | Posición 1: OUT p_Mensaje
        argumentos = [id_grupo, ""]
        resultado = cursor.callproc("sp_actualizar_estado_curso", argumentos)

        mensaje_out = resultado[1]
        print(f"\n[RESPUESTA OUT DEL SP] -> {mensaje_out}")

    except ValueError:
        print("[ERROR] El ID del grupo debe ser un número entero.")
    except Error as err:
        print(f"[ERROR SQL] Fallo al ejecutar sp_actualizar_estado_curso: {err}")
    finally:
        cerrar(cursor, conexion)


def menu_procedimientos():
    """Menú interactivo para probar los procedimientos almacenados con parámetros OUT."""
    while True:
        print("\n============================================================")
        print("   INVOCACIÓN DE PROCEDIMIENTOS ALMACENADOS (callproc)      ")
        print("============================================================")
        print("1. Registrar matrícula          (sp_registrar_matricula)")
        print("2. Calcular promedio académico  (sp_calcular_promedio)")
        print("3. Actualizar estado de curso   (sp_actualizar_estado_curso)")
        print("4. Salir")
        print("============================================================")

        opcion = input("Seleccione una opción (1-4): ").strip()

        if opcion == "1":
            invocar_registrar_matricula()
        elif opcion == "2":
            invocar_calcular_promedio()
        elif opcion == "3":
            invocar_actualizar_estado_curso()
        elif opcion == "4":
            print("[INFO] Cerrando módulo de procedimientos almacenados...")
            break
        else:
            print("[AVISO] Opción inválida. Intente de nuevo.")


if __name__ == "__main__":
    menu_procedimientos()
