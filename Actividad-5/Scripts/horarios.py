"""
Actividad 5 - Interpretación de horarios escritos en texto.

En la tabla Grupo el horario es texto libre, por ejemplo:
    "Martes 8-10 am y jueves 11-1 pm"    "Viernes 5-6 pm"    "Lun-Mie 7:00-9:00"
Este módulo lo convierte en bloques {dia, inicio, fin} (minutos desde la medianoche) para:
  - dibujar el horario semanal,
  - detectar cruces entre materias,
  - sugerir el "horario ideal" (la combinación de cursos sin cruces con más créditos).
"""
import re
import unicodedata
from itertools import combinations

DIAS = {"lunes": 1, "lun": 1, "martes": 2, "mar": 2, "miercoles": 3, "mie": 3, "mier": 3, "jueves": 4, "jue": 4,
        "viernes": 5, "vie": 5, "sabado": 6, "sab": 6, "domingo": 7, "dom": 7}
NOMBRES_DIA = {1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo"}

_TOKEN = re.compile(
    r"(?P<dia>\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mier|mie|jue|vie|sab|dom)\b)"
    r"|(?P<h1>\d{1,2})(?::(?P<m1>\d{2}))?\s*(?P<s1>am|pm|a\.m\.|p\.m\.)?\s*(?:-|a|–)\s*"
    r"(?P<h2>\d{1,2})(?::(?P<m2>\d{2}))?\s*(?P<s2>am|pm|a\.m\.|p\.m\.)?"
)


def _sin_tildes(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def _a_24(hora, sufijo):
    if sufijo is None:
        return hora
    if sufijo.startswith("p"):
        return hora if hora == 12 else hora + 12
    return 0 if hora == 12 else hora


def bloques(texto):
    """'Martes 8-10 am y jueves 11-1 pm' -> [{dia:2, inicio:480, fin:600}, {dia:4, inicio:660, fin:780}]"""
    if not texto:
        return []
    salida, pendientes = [], []
    for t in _TOKEN.finditer(_sin_tildes(texto)):
        if t.group("dia"):
            pendientes.append(DIAS[t.group("dia")])
            continue
        if not pendientes:
            continue
        h1, h2 = int(t.group("h1")), int(t.group("h2"))
        m1, m2 = int(t.group("m1") or 0), int(t.group("m2") or 0)
        s1, s2 = t.group("s1"), t.group("s2")
        fin = _a_24(h2, s2) * 60 + m2
        if s1:
            inicio = _a_24(h1, s1) * 60 + m1
        elif s2 and s2.startswith("p"):
            # "2-4 pm" -> 14:00 ; "11-1 pm" -> 11:00 (si sumar 12 pasa del final, era de mañana)
            candidata = _a_24(h1, "pm") * 60 + m1
            inicio = candidata if candidata < fin else h1 * 60 + m1
        else:
            inicio = _a_24(h1, s2) * 60 + m1
        if fin <= inicio or not 0 <= inicio < 24 * 60:
            pendientes = []
            continue
        for dia in pendientes:
            salida.append({"dia": dia, "inicio": inicio, "fin": fin})
        pendientes = []
    return salida


def se_cruzan(a, b):
    return any(x["dia"] == y["dia"] and x["inicio"] < y["fin"] and y["inicio"] < x["fin"] for x in a for y in b)


def horario_ideal(inscritas, disponibles, maximo=6):
    """Mejor combinación de cursos disponibles (máx. créditos) sin cruces entre sí ni con lo inscrito.
    inscritas / disponibles: listas de dicts con 'Bloques', 'CreditosMateria', 'IdGrupo', 'IdMateria'.
    Retorna (ids sugeridos, {IdGrupo: [nombres de materias con las que se cruza]}).

    Búsqueda en profundidad con poda (branch and bound): los candidatos se ordenan por créditos y
    una rama se descarta si ni sumando los mejores restantes puede superar a la mejor encontrada.
    Así funciona rápido aunque la oferta tenga decenas de cursos."""
    ocupado = [b for m in inscritas for b in m["Bloques"]]
    ya_inscritas = {m["IdMateria"] for m in inscritas}
    cruces = {}
    candidatos = []
    for g in disponibles:
        if g["IdMateria"] in ya_inscritas:
            continue
        choques = [m["NombreMateria"] for m in inscritas if se_cruzan(g["Bloques"], m["Bloques"])]
        if choques:
            cruces[g["IdGrupo"]] = choques
        elif g["Bloques"] and not se_cruzan(g["Bloques"], ocupado):
            candidatos.append(g)
    candidatos.sort(key=lambda g: -(g["CreditosMateria"] or 0))
    creditos = [g["CreditosMateria"] or 0 for g in candidatos]
    mejor = {"ids": [], "creditos": -1}
    pasos = [0]

    def buscar(i, elegidos, materias, suma):
        pasos[0] += 1
        if (suma, len(elegidos)) > (mejor["creditos"], len(mejor["ids"])):
            mejor["ids"], mejor["creditos"] = [g["IdGrupo"] for g in elegidos], suma
        faltan = maximo - len(elegidos)
        if faltan == 0 or i >= len(candidatos) or pasos[0] > 40_000:
            return
        if suma + sum(creditos[i:i + faltan]) < mejor["creditos"]:
            return  # poda: esta rama no puede mejorar
        g = candidatos[i]
        if g["IdMateria"] not in materias and not any(se_cruzan(g["Bloques"], e["Bloques"]) for e in elegidos):
            buscar(i + 1, elegidos + [g], materias | {g["IdMateria"]}, suma + creditos[i])
        buscar(i + 1, elegidos, materias, suma)

    if maximo > 0:
        buscar(0, [], set(), 0)
    return mejor["ids"], cruces


if __name__ == "__main__":
    for t in ("Martes 8-10 am y jueves 11-1 pm", "Viernes 5-6 pm", "Martes 12-2 pm", "Miercoles 2-4 pm",
              "Jueves 9-11 am", "Lun-Mie 7:00-9:00", "Sábado 8:30-11:30 am"):
        print(f"{t:36} -> {[(NOMBRES_DIA[b['dia']], f'{b['inicio']//60:02}:{b['inicio']%60:02}', f'{b['fin']//60:02}:{b['fin']%60:02}') for b in bloques(t)]}")
