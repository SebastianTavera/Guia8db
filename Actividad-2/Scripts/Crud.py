"""
Actividad 2 - CRUD completo desde Python (Guía 8)

Todas las operaciones que reciben datos del usuario usan consultas
parametrizadas (cursor.execute(sql, valores)): el conector envía los datos
separados del código SQL, lo que previene la inyección SQL.

Las credenciales se leen de variables de entorno (ver .env.example).
"""
import os
from pathlib import Path

try:  # lee el archivo .env de la raíz del proyecto (si python-dotenv está instalado)
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass
from datetime import datetime

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
    """Establece y retorna una conexión activa con la base de datos Guia_8."""
    return mysql.connector.connect(**DB_CONFIG)


def cerrar(cursor, conexion):
    """Cierra cursor y conexión si fueron abiertos (evita fugas de recursos)."""
    if cursor is not None:
        cursor.close()
    if conexion is not None and conexion.is_connected():
        conexion.close()


def pedir_obligatorio(mensaje):
    """Solicita un dato que no puede quedar vacío."""
    while True:
        valor = input(mensaje).strip()
        if valor:
            return valor
        print("  [AVISO] Este campo es obligatorio.")


def pedir_fecha(mensaje):
    """Solicita una fecha válida en formato YYYY-MM-DD."""
    while True:
        valor = input(mensaje).strip()
        try:
            datetime.strptime(valor, "%Y-%m-%d")
            return valor
        except ValueError:
            print("  [AVISO] Formato inválido. Use YYYY-MM-DD (ej. 2005-03-21).")


def insertar_estudiante():
    """CREATE: Inserta un nuevo estudiante usando consulta parametrizada."""
    print("\n--- REGISTRAR NUEVO ESTUDIANTE ---")
    conexion = cursor = None
    try:
        id_est = int(input("ID Estudiante (Documento): ").strip())
        p_nombre = pedir_obligatorio("Primer Nombre: ")
        s_nombre = input("Segundo Nombre (Enter si no tiene): ").strip() or None
        p_apellido = pedir_obligatorio("Primer Apellido: ")
        s_apellido = input("Segundo Apellido (Enter si no tiene): ").strip() or None
        correo = pedir_obligatorio("Correo Institucional: ")
        prefijo = input("Prefijo Teléfono (Enter = +57): ").strip() or "+57"
        telefono = pedir_obligatorio("Teléfono: ")
        fecha_nac = pedir_fecha("Fecha de Nacimiento (YYYY-MM-DD): ")
        direccion = input("Dirección (Enter si no aplica): ").strip() or None

        conexion = obtener_conexion()
        cursor = conexion.cursor()

        sql = """
            INSERT INTO Estudiante (
                IdEstudiante, PrimerNombre, SegundoNombre,
                PrimerApellido, SegundoApellido, CorreoEstudiante,
                PrefijoTelefono, Telefono, FechaNacimiento, Direccion
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        valores = (
            id_est, p_nombre, s_nombre,
            p_apellido, s_apellido, correo,
            prefijo, telefono, fecha_nac, direccion
        )

        cursor.execute(sql, valores)
        conexion.commit()
        print(f"[OK] Estudiante '{p_nombre} {p_apellido}' registrado correctamente.")

    except ValueError:
        print("[ERROR] El ID del estudiante debe ser un número entero.")
    except Error as err:
        # Ej.: ID duplicado (1062 Duplicate entry)
        print(f"[ERROR SQL] No se pudo insertar el estudiante: {err}")
    finally:
        cerrar(cursor, conexion)


def consultar_estudiantes():
    """READ: Lista todos los estudiantes o busca uno por ID parametrizado."""
    print("\n--- CONSULTAR ESTUDIANTES ---")
    print("1. Listar todos los estudiantes")
    print("2. Buscar estudiante por ID")
    opcion = input("Seleccione una opción: ").strip()

    if opcion not in ("1", "2"):
        print("[AVISO] Opción no válida.")
        return

    conexion = cursor = None
    try:
        sql = """
            SELECT IdEstudiante,
                   CONCAT_WS(' ', PrimerNombre, SegundoNombre, PrimerApellido, SegundoApellido) AS NombreCompleto,
                   CorreoEstudiante,
                   CONCAT(PrefijoTelefono, ' ', Telefono) AS TelefonoCompleto,
                   FechaNacimiento
            FROM Estudiante
        """
        if opcion == "1":
            # Sin datos del usuario: no requiere parámetros
            sql += " ORDER BY PrimerApellido"
            parametros = ()
        else:
            id_buscar = int(input("Ingrese el ID del estudiante a buscar: ").strip())
            sql += " WHERE IdEstudiante = %s"
            parametros = (id_buscar,)

        conexion = obtener_conexion()
        cursor = conexion.cursor()
        cursor.execute(sql, parametros)
        filas = cursor.fetchall()

        if not filas:
            print("[INFO] No se encontraron registros.")
            return

        print("\n" + "=" * 110)
        print(f"{'ID':<12} | {'NOMBRE COMPLETO':<30} | {'CORREO':<36} | {'TELÉFONO':<15} | {'NACIMIENTO'}")
        print("-" * 110)
        for id_est, nombre, correo, tel, fecha in filas:
            print(f"{id_est:<12} | {nombre:<30} | {correo:<36} | {tel:<15} | {fecha}")
        print("=" * 110)
        print(f"Registros encontrados: {len(filas)}")

    except ValueError:
        print("[ERROR] El ID debe ser numérico.")
    except Error as err:
        print(f"[ERROR SQL] Error al consultar: {err}")
    finally:
        cerrar(cursor, conexion)


def actualizar_estudiante():
    """UPDATE: Actualiza correo, teléfono y dirección mediante consulta parametrizada.
    Si el usuario deja un campo vacío, se conserva el valor actual."""
    print("\n--- ACTUALIZAR DATOS DE ESTUDIANTE ---")
    print("(Deje un campo vacío para conservar el valor actual)")
    conexion = cursor = None
    try:
        id_est = int(input("Ingrese el ID del estudiante a modificar: ").strip())
        nuevo_correo = input("Nuevo correo institucional: ").strip()
        nuevo_tel = input("Nuevo teléfono: ").strip()
        nueva_dir = input("Nueva dirección: ").strip()

        if not (nuevo_correo or nuevo_tel or nueva_dir):
            print("[INFO] No se ingresó ningún cambio.")
            return

        conexion = obtener_conexion()
        cursor = conexion.cursor()

        # NULLIF convierte '' en NULL y COALESCE conserva el valor actual
        sql = """
            UPDATE Estudiante
            SET CorreoEstudiante = COALESCE(NULLIF(%s, ''), CorreoEstudiante),
                Telefono         = COALESCE(NULLIF(%s, ''), Telefono),
                Direccion        = COALESCE(NULLIF(%s, ''), Direccion)
            WHERE IdEstudiante = %s
        """
        valores = (nuevo_correo, nuevo_tel, nueva_dir, id_est)

        cursor.execute(sql, valores)
        conexion.commit()

        if cursor.rowcount > 0:
            print(f"[OK] Registro con ID {id_est} actualizado exitosamente.")
        else:
            print(f"[AVISO] No existe el estudiante {id_est} o los datos eran iguales.")

    except ValueError:
        print("[ERROR] El ID debe ser un número entero.")
    except Error as err:
        print(f"[ERROR SQL] No se pudo actualizar el registro: {err}")
    finally:
        cerrar(cursor, conexion)


def eliminar_estudiante():
    """DELETE: Elimina un estudiante por ID usando consulta parametrizada."""
    print("\n--- ELIMINAR ESTUDIANTE ---")
    conexion = cursor = None
    try:
        id_est = int(input("Ingrese el ID del estudiante a eliminar: ").strip())
        confirmar = input(f"¿Está seguro de eliminar al estudiante {id_est}? (s/n): ").strip().lower()

        if confirmar != "s":
            print("[INFO] Operación cancelada.")
            return

        conexion = obtener_conexion()
        cursor = conexion.cursor()

        sql = "DELETE FROM Estudiante WHERE IdEstudiante = %s"
        cursor.execute(sql, (id_est,))
        conexion.commit()

        if cursor.rowcount > 0:
            print(f"[OK] Estudiante con ID {id_est} eliminado correctamente.")
        else:
            print(f"[AVISO] No se encontró ningún estudiante con ID {id_est}.")

    except ValueError:
        print("[ERROR] El ID debe ser un número entero.")
    except Error as err:
        # Captura si falla por restricción de llave foránea (ej. tiene matrículas activas)
        print(f"[ERROR SQL] No se pudo eliminar (verifique si tiene matrículas asociadas): {err}")
    finally:
        cerrar(cursor, conexion)


def menu_principal():
    """Menú interactivo en consola para gestionar operaciones CRUD."""
    while True:
        print("\n==============================================")
        print("   SISTEMA DE GESTIÓN DE ESTUDIANTES (CRUD)   ")
        print("==============================================")
        print("1. Insertar nuevo estudiante (CREATE)")
        print("2. Consultar estudiantes (READ)")
        print("3. Actualizar datos de estudiante (UPDATE)")
        print("4. Eliminar estudiante (DELETE)")
        print("5. Salir")
        print("==============================================")

        opcion = input("Seleccione una opción (1-5): ").strip()

        if opcion == "1":
            insertar_estudiante()
        elif opcion == "2":
            consultar_estudiantes()
        elif opcion == "3":
            actualizar_estudiante()
        elif opcion == "4":
            eliminar_estudiante()
        elif opcion == "5":
            print("[INFO] Saliendo del sistema...")
            break
        else:
            print("[AVISO] Opción inválida. Intente nuevamente.")


if __name__ == "__main__":
    menu_principal()
