import collections
import json
import math
import os
import re
import sys
import unicodedata

ORIGEN = sys.argv[1] if len(sys.argv) > 1 else "osm-bogota.json"
DESTINO = "assets/data/cruces-bogota.json"

RE_VIA = re.compile(r"^(?:avenida\s+)?(calle|carrera|diagonal|transversal)\s+(\d+)\s*([a-z])?\s*(bis)?\s*([a-z])?\s*(sur|este)?\b", re.I)
FAMILIA = {"calle": "C", "diagonal": "C", "carrera": "K", "transversal": "K"}


def sin_tildes(texto):
    texto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def claves(tags):
    salida = set()
    for campo in ("name", "alt_name", "official_name", "old_name"):
        for nombre in (tags.get(campo) or "").split(";"):
            m = RE_VIA.match(sin_tildes(nombre.strip()))
            if not m:
                continue
            letra = (m.group(3) or m.group(5) or "").upper()
            sufijo = (m.group(6) or "").lower()
            salida.add(f"{FAMILIA[m.group(1).lower()]}{int(m.group(2))}{letra}{'b' if m.group(4) else ''}{'s' if sufijo == 'sur' else ''}{'e' if sufijo == 'este' else ''}")
    return salida


def grupos(puntos):
    puntos = list(puntos)
    salida = []
    while puntos:
        p = puntos.pop(0)
        grupo, resto = [p], []
        for q in puntos:
            (grupo if abs(q[0] - p[0]) < .006 and abs(q[1] - p[1]) < .006 else resto).append(q)
        puntos = resto
        salida.append((sum(q[0] for q in grupo) / len(grupo), sum(q[1] for q in grupo) / len(grupo), len(grupo)))
    return salida


def numeros(clave):
    m = re.match(r"C(\d+)([A-Z]?)(b?)([se]?)\|K(\d+)([A-Z]?)(b?)([se]?)$", clave)
    calle = int(m.group(1)) * (-1 if m.group(4) == "s" else 1)
    carrera = int(m.group(5)) * (-1 if m.group(8) == "e" else 1)
    return calle, carrera


def minimos_cuadrados(filas, valores):
    n = len(filas[0])
    a = [[sum(f[i] * f[j] for f in filas) for j in range(n)] for i in range(n)]
    b = [sum(f[i] * v for f, v in zip(filas, valores)) for i in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            factor = a[j][i] / a[i][i]
            for k in range(i, n):
                a[j][k] -= factor * a[i][k]
            b[j] -= factor * b[i]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (b[i] - sum(a[i][j] * x[j] for j in range(i + 1, n))) / a[i][i]
    return x


def main():
    datos = json.load(open(ORIGEN, encoding="utf-8"))
    nodos = {e["id"]: (e["lat"], e["lon"]) for e in datos["elements"] if e["type"] == "node"}
    vias = [e for e in datos["elements"] if e["type"] == "way"]

    nodos_por_via = collections.defaultdict(set)
    vias_por_nodo = collections.defaultdict(set)
    for via in vias:
        ks = claves(via.get("tags", {}))
        for n in via["nodes"]:
            for k in ks:
                nodos_por_via[k].add(n)
            vias_por_nodo[n] |= ks

    candidatos = collections.defaultdict(lambda: {"comun": [], "cerca": []})
    for n, ks in vias_por_nodo.items():
        for c in (k for k in ks if k[0] == "C"):
            for k in (x for x in ks if x[0] == "K"):
                candidatos[f"{c}|{k}"]["comun"].append(nodos[n])

    rejilla = collections.defaultdict(list)
    for k, ns in nodos_por_via.items():
        if k[0] != "K":
            continue
        for n in ns:
            la, lo = nodos[n]
            rejilla[(int(la / 0.001), int(lo / 0.001))].append((k, la, lo))
    for c, ns in nodos_por_via.items():
        if c[0] != "C":
            continue
        for n in ns:
            la, lo = nodos[n]
            gx, gy = int(la / 0.001), int(lo / 0.001)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for k, la2, lo2 in rejilla.get((gx + dx, gy + dy), ()):
                        if abs(la - la2) < .0007 and abs(lo - lo2) < .0007:
                            candidatos[f"{c}|{k}"]["cerca"].append(((la + la2) / 2, (lo + lo2) / 2))

    filas, lats, lons = [], [], []
    for clave, v in candidatos.items():
        g = grupos(v["comun"])
        if len(g) == 1:
            calle, carrera = numeros(clave)
            filas.append((1, calle, carrera))
            lats.append(g[0][0])
            lons.append(g[0][1])
    modelo_lat = minimos_cuadrados(filas, lats)
    modelo_lon = minimos_cuadrados(filas, lons)

    cruces = {}
    for clave, v in candidatos.items():
        calle, carrera = numeros(clave)
        esperado_lat = modelo_lat[0] + modelo_lat[1] * calle + modelo_lat[2] * carrera
        esperado_lon = modelo_lon[0] + modelo_lon[1] * calle + modelo_lon[2] * carrera
        opciones = grupos(v["comun"]) + grupos(v["cerca"])
        mejor = min(opciones, key=lambda q: math.hypot(q[0] - esperado_lat, q[1] - esperado_lon) - 0.0005 * min(q[2], 10))
        cruces[clave] = [round((mejor[0] - 4.4) * 1e5), round((mejor[1] + 74.3) * 1e5)]

    json.dump({"m": [modelo_lat, modelo_lon], "x": cruces}, open(DESTINO, "w"), separators=(",", ":"))
    print(len(vias), "vias", len(cruces), "cruces", os.path.getsize(DESTINO) // 1024, "KB")


if __name__ == "__main__":
    main()
