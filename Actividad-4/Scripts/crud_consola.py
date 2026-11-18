"""
Actividad 4 - Demostración en consola del CRUD básico con pymongo.

Ejecuta, en orden, las cuatro operaciones que pide la guía sobre la colección
"productos" de MongoDB Atlas y muestra el resultado de cada una:
    insert_one -> find -> update_one -> delete_one

Ejecutar:  python crud_consola.py   (lee MONGO_URI del archivo .env)
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo.errors import PyMongoError

from tienda_dao import ProductoDAO, ValidacionError, conectar

BASE = Path(__file__).resolve().parent
load_dotenv(BASE.parents[1] / ".env")
load_dotenv(BASE / ".env")

LINEA = "=" * 72


def pesos(valor):
    """Formato colombiano: 150000 -> 150.000"""
    return f"{valor:,}".replace(",", ".")


def mostrar(productos):
    print(f"{'ID':<26} | {'NOMBRE':<22} | {'PRECIO':>10} | DESC.")
    print("-" * 72)
    for p in productos:
        print(f"{str(p['_id']):<26} | {p['nombre']:<22} | {pesos(p['precio']):>10} | {p.get('descuento', 0)} %")


def main():
    cliente = None
    try:
        cliente = conectar()
        coleccion = cliente[os.getenv("MONGO_DB", "tienda_ropa")]["productos"]
        dao = ProductoDAO(coleccion)
        print(f"[OK] Conectado a MongoDB (BD: {coleccion.database.name}, colección: productos)")

        # 1. CREATE - insert_one
        print(f"\n{LINEA}\n1. insert_one: crear producto de prueba\n{LINEA}")
        nuevo = dao.crear({
            "nombre": "Camisa Demo CRUD", "genero": "Hombre", "categoria": "Camisas", "prenda": "camisa",
            "descripcion": "Producto temporal creado por crud_consola.py",
            "precio": 150000, "descuento": 0,
            "colores": [{"nombre": "Blanco", "hex": "#f5f5f4"}],
            "tallas": ["M", "L"],
            "especificaciones": {"material": "Algodón", "ajuste": "Regular",
                                 "cuidado": "Lavar en frío", "origen": "Colombia"},
        })
        id_nuevo = str(nuevo["_id"])
        print(f"[OK] Insertado con _id = {id_nuevo}")

        # 2. READ - find
        print(f"\n{LINEA}\n2. find: listar todos los productos\n{LINEA}")
        mostrar(dao.listar())

        # 3. UPDATE - update_one
        print(f"\n{LINEA}\n3. update_one: precio 150.000 -> 120.000 y 25 % de descuento\n{LINEA}")
        actualizado = dao.actualizar(id_nuevo, {"precio": 120000, "descuento": 25})
        mostrar([actualizado])

        # 4. DELETE - delete_one
        print(f"\n{LINEA}\n4. delete_one: eliminar el producto de prueba\n{LINEA}")
        print("[OK] Eliminado" if dao.eliminar(id_nuevo) else "[AVISO] No se encontró")
        print(f"Productos restantes: {len(dao.listar())}")

    except ValidacionError as err:
        print(f"[ERROR DE VALIDACIÓN] {err}")
    except (PyMongoError, RuntimeError) as err:
        print(f"[ERROR MONGODB] {err}")
    finally:
        if cliente is not None:
            cliente.close()
            print("[INFO] Conexión con MongoDB cerrada.")


if __name__ == "__main__":
    main()
