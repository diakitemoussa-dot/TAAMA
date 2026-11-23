# -*- coding: utf-8 -*-
"""Génère le bâtiment en terre et bambou (toit papillon végétalisé, colonnes-entonnoirs, tour à vent) AVEC intérieurs.
Usage dans Blender : exec(open(r'...\\blender\\gen_batiment_bambou.py', encoding='utf-8').read())
Repère : façade avant vers -Y, x = largeur, z = hauteur (m). Niveaux : RDC 0,3 -> 4,0 · étage 1 4,4 -> 7,6 · étage 2 7,85 -> 11,0.
"""
import bpy, bmesh, math, random
from mathutils import Vector

random.seed(7)
# ---------------------------------------------------------------- remise à zéro
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for m in list(bpy.data.meshes):
    if m.users == 0: bpy.data.meshes.remove(m)

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def mat(name, hexc, rough=0.8, metal=0.0, alpha=1.0, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    rgb = srgb(hexc)
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    if emit > 0:
        for key in ('Emission Color', 'Emission'):
            if key in b.inputs: b.inputs[key].default_value = (*rgb, 1); break
        b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*rgb, alpha)
    return m

M = {
    'earth': mat('Terre_pisee', '#c98d52', 0.95), 'earth2': mat('Terre_claire', '#d9a46a', 0.95),
    'plaster': mat('Enduit_interieur', '#e8d3ad', 0.9), 'slab': mat('Dalle', '#d8bf98', 0.9),
    'floor': mat('Parquet_bambou', '#b9833f', 0.55), 'tile': mat('Sol_terre_cuite', '#b0643c', 0.8),
    'wood': mat('Bambou', '#c98f3c', 0.6), 'wood_dk': mat('Bois_sombre', '#7d4f26', 0.7),
    'glass': mat('Verre', '#3b4c55', 0.05, 0.2, 0.35), 'green': mat('Toit_vegetal', '#7c9444', 0.95),
    'leaf': mat('Feuillage', '#3f7a2f', 0.85), 'leaf2': mat('Feuillage_clair', '#6e9a3a', 0.85),
    'water': mat('Eau', '#3e5d50', 0.05, 0.1), 'path': mat('Allee', '#b8865a', 0.95), 'grass': mat('Herbe', '#5c7f34', 0.95),
    'solar': mat('Panneau_solaire', '#1e2c4a', 0.15, 0.6), 'metal': mat('Metal', '#5e5e5e', 0.4, 0.8),
    'dark': mat('Perforation', '#3a2414', 0.9), 'lamp': mat('Lampe', '#ffd59a', 0.5, 0, 1, 6.0),
    'fabric': mat('Tissu_terracotta', '#a5503a', 0.9), 'fabric2': mat('Tissu_creme', '#eadfc6', 0.9),
    'fabric3': mat('Tissu_indigo', '#2f4a6b', 0.9), 'rug': mat('Tapis_bogolan', '#8a5a33', 0.95),
    'white': mat('Blanc', '#efe7d8', 0.6), 'book1': mat('Livres_rouges', '#8e3b2e', 0.8), 'book2': mat('Livres_verts', '#4c6b3a', 0.8),
    'book3': mat('Livres_ocre', '#c9a043', 0.8), 'screen': mat('Ecran', '#151a20', 0.2), 'pot': mat('Pot_terre', '#a45c34', 0.9),
}
col = bpy.data.collections.new('Batiment_Bambou'); bpy.context.scene.collection.children.link(col)

def _obj(name, me, m, loc=(0, 0, 0), rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, me); o.location = loc; o.rotation_euler = rot
    me.materials.append(M[m]); col.objects.link(o); return o

def box(name, size, loc, m, rot=(0, 0, 0)):
    if min(size) <= 0.001: return None
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me); bm.free(); return _obj(name, me, m, loc, rot)

def boxr(name, x0, x1, y0, y1, z0, z1, m):
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), m)

def cyl(name, r, h, loc, m, verts=8, rot=(0, 0, 0), r2=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=(r if r2 is None else r2), depth=h)
    bm.to_mesh(me); bm.free(); return _obj(name, me, m, loc, rot)

def stick(name, a, b, r, m, verts=6):
    a, b = Vector(a), Vector(b); d = b - a
    o = cyl(name, r, d.length, (a + b) / 2, m, verts)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); return o

def blob(name, loc, r, m, sc=(1, 1, 1)):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    bm.to_mesh(me); bm.free(); o = _obj(name, me, m, loc); o.scale = sc; return o

def torus(name, R, r, loc, m):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=max(12, int(R * 14)), minor_segments=5, location=loc)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(M[m])
    for c in o.users_collection: c.objects.unlink(o)
    col.objects.link(o); return o

# ---------------------------------------------------------------- murs avec de vraies ouvertures
def wall(name, axis, fixed, a0, a1, z0, z1, th, openings, m):
    """axis 'x' : mur le long de x (façade avant/arrière, à y = fixed) ; 'y' : mur le long de y (pignon, à x = fixed).
    openings : [(centre, largeur, z_centre, hauteur)]. Le mur est découpé en morceaux autour des ouvertures."""
    br = {a0, a1}
    for (c, w, zc, h) in openings: br |= {max(a0, c - w / 2), min(a1, c + w / 2)}
    br = sorted(br); k = 0
    for i in range(len(br) - 1):
        a, b = br[i], br[i + 1]; mid = (a + b) / 2
        holes = sorted([(zc - h / 2, zc + h / 2) for (c, w, zc, h) in openings if abs(mid - c) < w / 2])
        spans, z = [], z0
        for (h0, h1) in holes:
            if h0 > z: spans.append((z, h0))
            z = max(z, h1)
        if z < z1: spans.append((z, z1))
        for (s0, s1) in spans:
            if axis == 'x': boxr(f'{name}_{k}', a, b, fixed - th / 2, fixed + th / 2, s0, s1, m)
            else: boxr(f'{name}_{k}', fixed - th / 2, fixed + th / 2, a, b, s0, s1, m)
            k += 1

def window(name, axis, fixed, c, zc, w, h, sill=True):
    """Vitre + cadre + meneaux posés dans l'ouverture (au milieu de l'épaisseur du mur)."""
    t = 0.1; n = max(1, round(w / 0.9))
    if axis == 'x':
        box(name + '_vitre', (w, 0.04, h), (c, fixed, zc), 'glass')
        for zz in (zc - h / 2, zc + h / 2): box(f'{name}_t{zz:.1f}', (w, 0.16, t), (c, fixed, zz), 'wood_dk')
        for i in range(n + 1): box(f'{name}_m{i}', (t * 0.8, 0.14, h), (c - w / 2 + i * w / n, fixed, zc), 'wood_dk')
        if sill: box(name + '_appui', (w + 0.2, 0.55, 0.06), (c, fixed, zc - h / 2 - 0.04), 'slab')
    else:
        box(name + '_vitre', (0.04, w, h), (fixed, c, zc), 'glass')
        for zz in (zc - h / 2, zc + h / 2): box(f'{name}_t{zz:.1f}', (0.16, w, t), (fixed, c, zz), 'wood_dk')
        for i in range(n + 1): box(f'{name}_m{i}', (0.14, t * 0.8, h), (fixed, c - w / 2 + i * w / n, zc), 'wood_dk')
        if sill: box(name + '_appui', (0.55, w + 0.2, 0.06), (fixed, c, zc - h / 2 - 0.04), 'slab')

def shutter(name, axis, fixed, c, zc, w, h, out):
    """Persienne en lames de bambou devant l'ouverture (out = décalage vers l'extérieur, signé)."""
    n = int(h / 0.13)
    if axis == 'x':
        y = fixed + out
        for x in (c - w / 2, c + w / 2, c): box(f'{name}_mont{x:.1f}', (0.09, 0.1, h), (x, y, zc), 'wood')
        for i in range(n): box(f'{name}_l{i}', (w, 0.03, 0.08), (c, y, zc - h / 2 + 0.08 + i * (h - 0.16) / (n - 1)), 'wood', (0.5, 0, 0))
    else:
        x = fixed + out
        for y in (c - w / 2, c + w / 2, c): box(f'{name}_mont{y:.1f}', (0.1, 0.09, h), (x, y, zc), 'wood')
        for i in range(n): box(f'{name}_l{i}', (0.03, w, 0.08), (x, c, zc - h / 2 + 0.08 + i * (h - 0.16) / (n - 1)), 'wood', (0, 0.5, 0))

def curtain(name, axis, fixed, a0, a1, z0, z1, step=1.2):
    """Mur-rideau vitré (meneaux bambou)."""
    w = a1 - a0; n = max(1, round(w / step)); c = (a0 + a1) / 2; h = z1 - z0
    if axis == 'x':
        box(name + '_vitre', (w, 0.04, h), (c, fixed, (z0 + z1) / 2), 'glass')
        for i in range(n + 1): box(f'{name}_m{i}', (0.09, 0.16, h), (a0 + i * w / n, fixed, (z0 + z1) / 2), 'wood_dk')
        for zz in (z0 + 0.05, z1 - 0.05, z0 + h * 0.62): box(f'{name}_t{zz:.1f}', (w, 0.16, 0.09), (c, fixed, zz), 'wood_dk')
    else:
        box(name + '_vitre', (0.04, w, h), (fixed, c, (z0 + z1) / 2), 'glass')
        for i in range(n + 1): box(f'{name}_m{i}', (0.16, 0.09, h), (fixed, a0 + i * w / n, (z0 + z1) / 2), 'wood_dk')
        for zz in (z0 + 0.05, z1 - 0.05, z0 + h * 0.62): box(f'{name}_t{zz:.1f}', (0.16, w, 0.09), (fixed, c, zz), 'wood_dk')

def slab(name, x0, x1, y0, y1, z0, z1, m, hole=None):
    """Dalle, avec une trémie rectangulaire éventuelle (hx0, hx1, hy0, hy1)."""
    if not hole: boxr(name, x0, x1, y0, y1, z0, z1, m); return
    hx0, hx1, hy0, hy1 = hole
    boxr(name + '_a', x0, hx0, y0, y1, z0, z1, m); boxr(name + '_b', hx1, x1, y0, y1, z0, z1, m)
    boxr(name + '_c', hx0, hx1, y0, hy0, z0, z1, m); boxr(name + '_d', hx0, hx1, hy1, y1, z0, z1, m)

def railing(name, pts, z, h=1.0, gap=0.12, m='wood_dk'):
    """Garde-corps : main courante + barreaux le long d'une polyligne horizontale."""
    for i in range(len(pts) - 1):
        a, b = Vector((*pts[i], z)), Vector((*pts[i + 1], z))
        stick(f'{name}_mc{i}', a + Vector((0, 0, h)), b + Vector((0, 0, h)), 0.035, m, 6)
        stick(f'{name}_lisse{i}', a + Vector((0, 0, 0.12)), b + Vector((0, 0, 0.12)), 0.025, m, 5)
        n = max(1, int((b - a).length / gap))
        for k in range(n + 1):
            p = a + (b - a) * (k / n); stick(f'{name}_b{i}_{k}', p, p + Vector((0, 0, h)), 0.016, m, 4)

# ---------------------------------------------------------------- escaliers (limons, marches, contremarches, rampes)
def stairs(name, x0, x1, y_start, z_start, z_end, direction=1, going=0.28, open_risers=True, rail=(True, True), stringer_m='wood_dk'):
    """Volée droite le long de y. direction = +1 (monte vers +y) ou -1. Renvoie la position y de l'arrivée."""
    rise_total = z_end - z_start; n = max(2, round(rise_total / 0.18)); r = rise_total / n
    w = x1 - x0; xc = (x0 + x1) / 2
    for i in range(n):
        zt = z_start + (i + 1) * r; yc = y_start + direction * (i * going + going / 2)
        if i < n - 1 or True:
            box(f'{name}_marche{i}', (w, going + 0.03, 0.05), (xc, yc, zt - 0.025), 'wood')
            box(f'{name}_nez{i}', (w, 0.04, 0.07), (xc, yc + direction * (going / 2), zt - 0.035), 'wood_dk')
            if not open_risers: box(f'{name}_cm{i}', (w, 0.03, r), (xc, yc - direction * going / 2, zt - r / 2), 'wood')
    y_end = y_start + direction * n * going
    for x, side in ((x0 + 0.06, 0), (x1 - 0.06, 1)):
        stick(f'{name}_limon{side}', (x, y_start, z_start + 0.05), (x, y_end, z_end - 0.05), 0.09, stringer_m, 6)
        stick(f'{name}_limon{side}b', (x, y_start, z_start - 0.12), (x, y_end, z_end - 0.22), 0.07, stringer_m, 6)
        if rail[side]:
            stick(f'{name}_rampe{side}', (x, y_start, z_start + 0.95), (x, y_end, z_end + 0.95), 0.035, 'wood_dk', 6)
            for k in range(0, n + 1, 2):
                yy = y_start + direction * k * going; zz = z_start + k * r
                stick(f'{name}_balustre{side}_{k}', (x, yy, zz), (x, yy, zz + 0.95), 0.02, 'wood_dk', 4)
    return y_end

# ---------------------------------------------------------------- mobilier
def table(name, x, y, l=1.6, w=0.9, z=0.0, h=0.75, chairs=True, top='wood'):
    box(name + '_plateau', (l, w, 0.05), (x, y, z + h), top)
    for dx in (-l / 2 + 0.08, l / 2 - 0.08):
        for dy in (-w / 2 + 0.08, w / 2 - 0.08): box(f'{name}_pied{dx:.1f}{dy:.1f}', (0.05, 0.05, h), (x + dx, y + dy, z + h / 2), 'wood_dk')
    if chairs:
        nc = max(1, int(l / 0.7))
        for i in range(nc):
            cx = x - l / 2 + (i + 0.5) * l / nc
            for sy in (-1, 1): chair(f'{name}_ch{i}{sy}', cx, y + sy * (w / 2 + 0.3), z, rot=(0 if sy < 0 else math.pi))

def chair(name, x, y, z=0.0, rot=0.0, m='wood'):
    c, s = math.cos(rot), math.sin(rot)
    box(name + '_assise', (0.44, 0.44, 0.05), (x, y, z + 0.46), m, (0, 0, rot))
    bx, by = x - s * 0.0 + (-s) * 0.0, y
    box(name + '_dos', (0.44, 0.05, 0.45), (x + s * 0.2, y - c * 0.2, z + 0.7), m, (0, 0, rot))
    for dx in (-0.18, 0.18):
        for dy in (-0.18, 0.18): box(f'{name}_p{dx}{dy}', (0.04, 0.04, 0.46), (x + dx * c - dy * s, y + dx * s + dy * c, z + 0.23), 'wood_dk')

def sofa(name, x, y, z, l=2.2, rot=0.0, m='fabric'):
    c, s = math.cos(rot), math.sin(rot)
    def at(dx, dy): return (x + dx * c - dy * s, y + dx * s + dy * c)
    box(name + '_base', (l, 0.9, 0.42), (*at(0, 0), z + 0.21), m, (0, 0, rot))
    box(name + '_dos', (l, 0.22, 0.5), (*at(0, 0.34), z + 0.62), m, (0, 0, rot))
    for sx in (-1, 1): box(f'{name}_acc{sx}', (0.2, 0.9, 0.62), (*at(sx * (l / 2 - 0.1), 0), z + 0.31), m, (0, 0, rot))
    for i in range(int(l / 0.7)): box(f'{name}_cous{i}', (0.6, 0.65, 0.14), (*at(-l / 2 + 0.45 + i * 0.68, -0.05), z + 0.49), 'fabric2', (0, 0, rot))

def bookcase(name, x, y, z, l=2.0, h=2.2, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    def at(dx, dy): return (x + dx * c - dy * s, y + dx * s + dy * c)
    for sx in (-1, 1): box(f'{name}_cote{sx}', (0.04, 0.38, h), (*at(sx * l / 2, 0), z + h / 2), 'wood', (0, 0, rot))
    box(name + '_fond', (l, 0.03, h), (*at(0, 0.18), z + h / 2), 'wood_dk', (0, 0, rot))
    for k in range(6):
        zz = z + 0.05 + k * (h - 0.1) / 5
        box(f'{name}_etag{k}', (l, 0.38, 0.03), (*at(0, 0), zz), 'wood', (0, 0, rot))
        if k < 5:
            dx = -l / 2 + 0.05
            while dx < l / 2 - 0.12:
                bw = random.uniform(0.04, 0.08); bh = random.uniform(0.22, 0.32)
                box(f'{name}_liv{k}_{dx:.2f}', (bw, 0.24, bh), (*at(dx + bw / 2, 0.02), zz + 0.015 + bh / 2), random.choice(['book1', 'book2', 'book3', 'fabric2']), (0, 0, rot))
                dx += bw + 0.005

def bed(name, x, y, z, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    def at(dx, dy): return (x + dx * c - dy * s, y + dx * s + dy * c)
    box(name + '_cadre', (1.7, 2.1, 0.32), (*at(0, 0), z + 0.16), 'wood', (0, 0, rot))
    box(name + '_matelas', (1.6, 2.0, 0.22), (*at(0, 0), z + 0.43), 'white', (0, 0, rot))
    box(name + '_couverture', (1.64, 1.25, 0.06), (*at(0, -0.35), z + 0.56), 'fabric3', (0, 0, rot))
    for sx in (-0.4, 0.4): box(f'{name}_oreiller{sx}', (0.62, 0.38, 0.14), (*at(sx, 0.75), z + 0.6), 'fabric2', (0, 0, rot))
    box(name + '_tete', (1.8, 0.08, 1.1), (*at(0, 1.08), z + 0.55), 'wood_dk', (0, 0, rot))
    for sx in (-1.2, 1.2):
        box(f'{name}_chevet{sx}', (0.45, 0.4, 0.5), (*at(sx, 0.85), z + 0.25), 'wood', (0, 0, rot))
        cyl(f'{name}_lampe{sx}', 0.1, 0.18, (*at(sx, 0.85), z + 0.6), 'lamp', 10)

def plant(name, x, y, z, h=1.2):
    cyl(name + '_pot', 0.24, 0.42, (x, y, z + 0.21), 'pot', 10, r2=0.3)
    for j in range(3): blob(f'{name}_f{j}', (x + random.uniform(-.15, .15), y + random.uniform(-.15, .15), z + 0.55 + j * h / 3.5), 0.3 + 0.1 * (2 - j), random.choice(['leaf', 'leaf2']))

def pendant(name, x, y, zc, drop=0.9):
    stick(name + '_fil', (x, y, zc), (x, y, zc - drop), 0.006, 'metal', 4)
    cyl(name + '_abat', 0.26, 0.28, (x, y, zc - drop - 0.12), 'wood', 12, r2=0.08)
    blob(name + '_ampoule', (x, y, zc - drop - 0.25), 0.08, 'lamp')

def rug(name, x, y, z, l, w): box(name, (l, w, 0.02), (x, y, z + 0.01), 'rug')

def light(name, x, y, z, energy=250, color=(1.0, 0.8, 0.55)):
    d = bpy.data.lights.new(name, 'POINT'); d.energy = energy; d.color = color; d.shadow_soft_size = 0.4
    o = bpy.data.objects.new(name, d); o.location = (x, y, z); col.objects.link(o)

# ================================================================= STRUCTURE
Z0, Z1a, Z1, Z2a, Z2, ZT = 0.3, 4.0, 4.4, 7.6, 7.85, 11.0
boxr('Sol_herbe', -35, 35, -30, 30, -0.2, 0.0, 'grass')
boxr('Socle', -12.75, 12.75, -6.75, 6.75, 0.0, Z0, 'slab')

# ---- RDC : salle (restaurant) fermée x -8..8, y -4..5, terrasse couverte autour
slab('Sol_RDC', -7.85, 7.85, -3.85, 4.85, Z0, Z0 + 0.03, 'tile')
wall('RDC_mur_G', 'y', -8.0, -4.0, 5.0, Z0, Z1a, 0.35, [(0.5, 6.0, 2.1, 2.4)], 'earth')
wall('RDC_mur_D', 'y', 8.0, -4.0, 5.0, Z0, Z1a, 0.35, [(0.5, 6.0, 2.1, 2.4)], 'earth')
window('RDC_fen_G', 'y', -8.0, 0.5, 2.1, 6.0, 2.4); window('RDC_fen_D', 'y', 8.0, 0.5, 2.1, 6.0, 2.4)
curtain('RDC_vitrage_av_g', 'x', -4.0, -8.0, -1.1, Z0, Z1a); curtain('RDC_vitrage_av_d', 'x', -4.0, 1.1, 8.0, Z0, Z1a)
boxr('RDC_porte_linteau', -1.1, 1.1, -4.1, -3.9, 2.8, Z1a, 'wood_dk')
for i, sx in enumerate((-1, 1)):                                    # porte d'entrée à deux battants, entrouverte
    o = box(f'RDC_porte_{i}', (1.05, 0.06, 2.45), (sx * 0.55, -4.0, Z0 + 1.23), 'wood_dk')
    for k in range(6): box(f'RDC_porte_{i}_lame{k}', (0.9, 0.08, 0.04), (sx * 0.55, -4.03, Z0 + 0.4 + k * 0.35), 'wood')
curtain('RDC_vitrage_ar', 'x', 5.0, -8.0, 8.0, Z0, Z1a)
for i, x in enumerate([-12, -8.5, -5, 5, 8.5, 12]):
    for y in (-6.3, 6.3): boxr(f'Pilier_{i}_{y > 0}', x - 0.35, x + 0.35, y - 0.35, y + 0.35, Z0, Z1a, 'earth2')
# trémie de l'escalier intérieur A (RDC -> étage 1) : x 1.0..2.6, y -0.4..2.6
slab('Dalle_etage1', -13.25, 13.25, -7.1, 7.1, Z1a, Z1, 'slab', hole=(1.0, 2.6, -0.4, 2.6))
slab('Sol_etage1', -11.8, 11.8, -5.3, 5.3, Z1, Z1 + 0.02, 'floor', hole=(1.0, 2.6, -0.4, 2.6))

# ---- jardinières du balcon (ouvertes à l'arrivée de l'escalier extérieur, x -1.15..1.15)
for (xa, xb) in ((-13.3, -1.15), (1.15, 13.3)):
    boxr(f'Jardiniere_av_{xa:.0f}', xa, xb, -7.3, -6.7, Z1, Z1 + 0.55, 'earth2')
boxr('Jardiniere_ar', -13.3, 13.3, 6.7, 7.3, Z1, Z1 + 0.55, 'earth2')
for x in (-13.0, 13.0): boxr(f'Jardiniere_cote_{x > 0}', x - 0.3, x + 0.3, -6.7, 6.7, Z1, Z1 + 0.55, 'earth2')

# ---- étages 1 et 2 : enveloppe creuse x -12..12, y -5.5..5.5, corps central vitré en retrait (y ±4.7)
TH = 0.4
def wing_openings(z1c, z2c):
    ops = []
    for zc in (z1c, z2c):
        for xs in (-1, 1): ops += [(xs * 10.0, 2.6, zc, 2.2), (xs * 6.3, 3.0, zc, 2.2)]
    return ops
LV = [(Z1, Z2a, 6.3), (Z2, ZT, 9.7)]
ops = wing_openings(6.3, 9.7)
for side, sg in (('av', -1), ('ar', 1)):
    wall(f'Mur_{side}_G', 'x', sg * 5.5, -12.0, -3.6, Z1, ZT, TH, [o for o in ops if o[0] < 0], 'earth')
    wall(f'Mur_{side}_D', 'x', sg * 5.5, 3.6, 12.0, Z1, ZT, TH, [o for o in ops if o[0] > 0], 'earth')
    for sx in (-1, 1): boxr(f'Retour_{side}_{sx}', sx * 3.6 - 0.2, sx * 3.6 + 0.2, min(sg * 5.5, sg * 4.7), max(sg * 5.5, sg * 4.7), Z1, ZT, 'earth')
    for (c, w, zc, h) in ops:
        window(f'Fen_{side}_{c:.1f}_{zc:.0f}', 'x', sg * 5.5, c, zc, w, h)
        if abs(c) > 6 and abs(c) < 7: shutter(f'Pers_{side}_{c:.1f}_{zc:.0f}', 'x', sg * 5.5, c, zc, 3.4, 2.6, sg * 0.32)
    for (za, zb) in ((Z1, Z2a), (Z2, ZT)): curtain(f'Vitrage_centre_{side}_{za:.0f}', 'x', sg * 4.7, -3.6, 3.6, za, zb)
    boxr(f'Bandeau_{side}', -12.2, 12.2, sg * 5.5 - 0.25, sg * 5.5 + 0.25, Z2a, Z2, 'slab')
side_ops = [(y, 2.2, zc, 2.2) for zc in (6.3, 9.7) for y in (-3.2, 0.0, 3.2)]
for sx in (-1, 1):
    wall(f'Pignon_{sx}', 'y', sx * 12.0, -5.5, 5.5, Z1, ZT, TH, side_ops, 'earth')
    for (c, w, zc, h) in side_ops:
        window(f'Fen_pignon{sx}_{c:.1f}_{zc:.0f}', 'y', sx * 12.0, c, zc, w, h)
        if c != 0.0: shutter(f'Pers_pignon{sx}_{c:.1f}_{zc:.0f}', 'y', sx * 12.0, c, zc, 2.6, 2.6, sx * 0.32)
# enduit intérieur (fines plaques sur la face intérieure des murs des ailes)
for side, sg in (('av', -1), ('ar', 1)):
    for (xa, xb) in ((-11.8, -3.8), (3.8, 11.8)):
        pass
# trémie de l'escalier intérieur B (étage 1 -> étage 2) : x -2.6..-1.0, y -2.4..-0.4
slab('Dalle_etage2', -11.8, 11.8, -5.3, 5.3, Z2a, Z2, 'slab', hole=(-2.6, -1.0, -2.4, -0.4))
slab('Sol_etage2', -11.8, 11.8, -5.3, 5.3, Z2, Z2 + 0.02, 'floor', hole=(-2.6, -1.0, -2.4, -0.4))
boxr('Plafond_etage2', -12.2, 12.2, -5.7, 5.7, ZT, ZT + 0.2, 'slab')
# strates de la terre pisée (lignes horizontales sur les façades)
k = 0; z = Z1 + 0.5
while z < ZT - 0.2:
    for sg in (-1, 1):
        for (xa, xb) in ((-12.0, -3.6), (3.6, 12.0)):
            boxr(f'Strate_{k}', xa, xb, sg * 5.5 + sg * 0.2, sg * 5.5 + sg * 0.215, z, z + 0.04, 'earth2'); k += 1
    z += 0.55

# ================================================================= ESCALIERS
# A : intérieur RDC -> étage 1, x 1.0..2.6, monte vers +y depuis y -3.4
yA = stairs('Esc_A', 1.05, 2.55, -3.4, Z0, Z1, +1, rail=(True, False))
railing('Tremie_A', [(1.0, -0.4), (0.95, -0.4), (0.95, 2.6), (1.0, 2.6)], Z1)
railing('Tremie_A2', [(2.6, -0.4), (2.65, -0.4), (2.65, 2.6)], Z1)
# B : intérieur étage 1 -> étage 2, x -2.6..-1.0, monte vers -y depuis y 2.6
yB = stairs('Esc_B', -2.55, -1.05, 2.6, Z1, Z2, -1, rail=(False, True))
railing('Tremie_B', [(-2.65, -0.4), (-2.65, -2.45), (-0.95, -2.45), (-0.95, -0.4)], Z2)
# C : escalier extérieur monumental (devant), deux volées + palier, x -1.0..1.0
Y0 = -14.62
y1 = stairs('Esc_ext_v1', -1.0, 1.0, Y0, 0.0, 2.2, +1, going=0.28)
boxr('Esc_ext_palier', -1.0, 1.0, y1, y1 + 1.3, 2.12, 2.2, 'wood')
for x in (-0.94, 0.94):
    stick(f'Esc_ext_palier_poutre{x}', (x, y1, 2.05), (x, y1 + 1.3, 2.05), 0.09, 'wood_dk', 6)
    for yy in (y1 + 0.1, y1 + 1.2):
        for dx in (-0.08, 0.0, 0.08): stick(f'Esc_ext_poteau{x}{yy:.1f}{dx}', (x + dx, yy, 0.0), (x + dx, yy, 2.12), 0.05, 'wood', 6)
    stick(f'Esc_ext_palier_mc{x}', (x, y1, 3.15), (x, y1 + 1.3, 3.15), 0.035, 'wood_dk', 6)
    for k in range(4): stick(f'Esc_ext_palier_bal{x}_{k}', (x, y1 + k * 0.43, 2.2), (x, y1 + k * 0.43, 3.15), 0.02, 'wood_dk', 4)
y2 = stairs('Esc_ext_v2', -1.0, 1.0, y1 + 1.3, 2.2, Z1, +1, going=0.28)
for x in (-0.94, 0.94):                                            # poteaux de pied
    stick(f'Esc_ext_pied{x}', (x, Y0, 0.0), (x, Y0, 1.1), 0.06, 'wood_dk', 6)
print('escalier ext arrive en y =', round(y2, 2))

# ---- garde-corps du balcon (ouvert à l'arrivée de l'escalier)
railing('GC_av_g', [(-13.2, -6.85), (-1.1, -6.85)], Z1); railing('GC_av_d', [(1.1, -6.85), (13.2, -6.85)], Z1)
railing('GC_ar', [(-13.2, 6.85), (13.2, 6.85)], Z1, gap=0.25)

# ================================================================= INTÉRIEURS
# --- RDC : restaurant (tables, bar, cuisine ouverte, plantes, suspensions)
for i, (x, y) in enumerate([(-6.3, -2.4), (-6.3, 0.2), (-6.3, 2.8), (-3.8, -2.4), (-3.8, 0.2), (4.8, -2.4), (4.8, 0.6), (6.6, 3.4)]):
    table(f'Resto_t{i}', x, y, 1.4, 0.85, Z0)
boxr('Bar_comptoir', -6.8, -1.6, 3.9, 4.5, Z0, Z0 + 1.05, 'wood')
boxr('Bar_plateau', -6.9, -1.5, 3.85, 4.55, Z0 + 1.05, Z0 + 1.1, 'wood_dk')
for i in range(5): cyl(f'Bar_tabouret{i}', 0.18, 0.05, (-6.3 + i * 1.1, 3.5, Z0 + 0.75), 'fabric', 10); stick(f'Bar_tab_pied{i}', (-6.3 + i * 1.1, 3.5, Z0), (-6.3 + i * 1.1, 3.5, Z0 + 0.72), 0.03, 'metal', 6)
for i in range(8): cyl(f'Bar_jarre{i}', 0.12, 0.3, (-6.6 + i * 0.6, 4.75, Z0 + 1.25), 'pot', 10, r2=0.07)
for i, (x, y) in enumerate([(-7.5, -3.5), (7.5, -3.5), (7.5, 4.5), (-0.2, 4.4)]): plant(f'Resto_plante{i}', x, y, Z0)
for i, (x, y) in enumerate([(-6.3, -2.4), (-6.3, 0.2), (-6.3, 2.8), (-3.8, -2.4), (-3.8, 0.2), (4.8, -2.4), (4.8, 0.6), (6.6, 3.4), (-4.2, 4.2)]):
    pendant(f'Resto_susp{i}', x, y, Z1a, 1.0)
light('Lum_RDC_1', -5, 0.5, 3.2); light('Lum_RDC_2', 5, 0.5, 3.2); light('Lum_RDC_3', 0, 3.5, 3.2, 180)

# --- Étage 1 : bibliothèque / espace de travail
F1 = Z1 + 0.02
rug('Biblio_tapis', -8.6, 2.2, F1, 4.0, 2.6)
sofa('Biblio_canape', -8.6, 3.7, F1, 2.4, 0.0)
sofa('Biblio_canape2', -10.6, 2.0, F1, 1.6, math.pi / 2, 'fabric3')
table('Biblio_table_basse', -8.4, 2.0, 1.2, 0.6, F1, 0.4, chairs=False)
for i, y in enumerate((-4.6, )):
    pass
bookcase('Biblio_rayon1', -8.0, -4.95, F1, 3.0, 2.4, math.pi)
bookcase('Biblio_rayon2', -4.6, -1.0, F1, 2.4, 2.0, math.pi / 2)
bookcase('Biblio_rayon3', 4.4, 0.0, F1, 2.6, 2.0, -math.pi / 2)
table('Biblio_lecture', -8.4, -1.8, 2.2, 1.0, F1)
table('Cowork_1', 7.6, -2.6, 3.0, 1.0, F1); table('Cowork_2', 7.6, 1.2, 3.0, 1.0, F1)
for i, x in enumerate((6.6, 7.6, 8.6)):
    for y in (-2.6, 1.2): cyl(f'Cowork_lampe{i}{y}', 0.08, 0.3, (x, y, F1 + 0.95), 'lamp', 8)
for i, (x, y) in enumerate([(-11.3, -4.8), (11.3, -4.8), (11.3, 4.8), (-3.2, 4.2), (3.2, -4.2)]): plant(f'Et1_plante{i}', x, y, F1, 1.5)
for i, (x, y) in enumerate([(-8.6, 2.2), (-8.4, -1.8), (7.6, -2.6), (7.6, 1.2), (0.0, 0.0)]): pendant(f'Et1_susp{i}', x, y, Z2a, 0.8)
light('Lum_E1_1', -8, 0, 7.0); light('Lum_E1_2', 8, 0, 7.0); light('Lum_E1_3', 0, 3.0, 7.0, 160)

# --- Étage 2 : chambre (aile gauche), salle de réunion (aile droite), salon central
F2 = Z2 + 0.02
rug('Ch_tapis', -8.0, 0.6, F2, 3.2, 2.4)
bed('Ch_lit', -8.0, 2.0, F2, 0.0)
boxr('Ch_armoire', -11.75, -11.15, -4.6, -2.4, F2, F2 + 2.3, 'wood')
for k in range(3): boxr(f'Ch_armoire_porte{k}', -11.16, -11.12, -4.55 + k * 0.72, -3.9 + k * 0.72, F2 + 0.1, F2 + 2.2, 'wood_dk')
table('Ch_bureau', -6.0, -4.6, 1.4, 0.6, F2, chairs=False); chair('Ch_chaise', -6.0, -4.0, F2, math.pi)
boxr('Cloison_chambre', -4.4, -4.25, -5.3, 5.3, F2, ZT, 'plaster')
boxr('Cloison_reunion', 4.25, 4.4, -5.3, 5.3, F2, ZT, 'plaster')
boxr('Cloison_porte_g', -4.45, -4.2, -0.6, 0.6, F2, F2 + 2.2, 'wood_dk'); boxr('Cloison_porte_d', 4.2, 4.45, 1.4, 2.6, F2, F2 + 2.2, 'wood_dk')
table('Reunion_table', 8.0, 0.0, 4.0, 1.4, F2)
boxr('Reunion_ecran', 11.7, 11.78, -1.2, 1.2, F2 + 1.1, F2 + 2.4, 'screen')
for i, (x, y) in enumerate([(11.2, -4.7), (5.0, 4.7), (-11.2, 4.7)]): plant(f'Et2_plante{i}', x, y, F2, 1.4)
rug('Salon_tapis', 1.4, 2.6, F2, 2.6, 2.0)
for i, (x, y) in enumerate([(0.6, 3.4), (2.2, 3.4), (1.4, 1.9)]): cyl(f'Salon_pouf{i}', 0.32, 0.38, (x, y, F2 + 0.19), random.choice(['fabric', 'fabric3', 'fabric2']), 12)
for i, (x, y) in enumerate([(-8.0, 0.8), (8.0, 0.0), (1.4, 2.6)]): pendant(f'Et2_susp{i}', x, y, ZT, 0.9)
light('Lum_E2_1', -8, 0, 10.3); light('Lum_E2_2', 8, 0, 10.3); light('Lum_E2_3', 1, 2.5, 10.3, 150)

# --- détails intérieurs : solives en bambou au plafond, tentures bogolan, bardage en lattes, buffet
for (zc, x0, x1, y0, y1, nm, hole) in ((Z1a, -7.8, 7.8, -3.8, 4.8, 'RDC', (1.0, 2.6)), (Z2a, -11.8, 11.8, -5.3, 5.3, 'E1', (-2.6, -1.0)), (ZT, -11.8, 11.8, -5.3, 5.3, 'E2', None)):
    x = x0 + 0.6
    while x < x1:
        if not (hole and hole[0] - 0.1 < x < hole[1] + 0.1):
            stick(f'Solive_{nm}_{x:.1f}', (x, y0, zc - 0.09), (x, y1, zc - 0.09), 0.07, 'wood', 6)
        x += 1.2
    for y in (y0 + 0.3, (y0 + y1) / 2, y1 - 0.3):
        stick(f'Poutre_{nm}_{y:.1f}', (x0, y, zc - 0.2), (x1, y, zc - 0.2), 0.11, 'wood_dk', 6)
def bogolan(name, x, y, z, w, h, axis):
    """Tenture en bogolan : fond terre + motifs géométriques sombres et clairs."""
    if axis == 'x': box(name, (w, 0.03, h), (x, y, z), 'rug')
    else: box(name, (0.03, w, h), (x, y, z), 'rug')
    for i in range(5):
        for j in range(4):
            px = -w / 2 + (i + 0.5) * w / 5; pz = -h / 2 + (j + 0.5) * h / 4; m = 'dark' if (i + j) % 2 else 'fabric2'
            if axis == 'x': box(f'{name}_mot{i}{j}', (w / 9, 0.04, h / 9), (x + px, y, z + pz), m, (0, math.pi / 4, 0))
            else: box(f'{name}_mot{i}{j}', (0.04, w / 9, h / 9), (x, y + px, z + pz), m, (math.pi / 4, 0, 0))
bogolan('Bogolan_chambre', -4.47, 2.5, F2 + 1.6, 2.0, 1.4, 'y')
bogolan('Bogolan_reunion', 4.47, -2.4, F2 + 1.5, 2.4, 1.5, 'y')
bogolan('Bogolan_resto', -7.8, -2.0, Z0 + 2.4, 1.6, 1.1, 'y')
for k in range(24):                                                # bardage en lattes de bambou côté réunion
    y = -5.2 + k * 0.45
    if 1.3 < y < 2.7: continue
    box(f'Latte_reunion_{k}', (0.05, 0.08, ZT - F2 - 0.1), (4.47, y, F2 + (ZT - F2) / 2), 'wood')
boxr('Reunion_buffet', 5.0, 7.4, 4.75, 5.25, F2, F2 + 0.85, 'wood_dk')
for i in range(3): cyl(f'Reunion_jarre{i}', 0.14, 0.32, (5.5 + i * 0.7, 5.0, F2 + 1.0), 'pot', 10, r2=0.08)
bookcase('Biblio_rayon2b', -4.2, -1.0, F1, 2.4, 2.0, -math.pi / 2)        # bibliothèque double face

# ================================================================= TOIT, COLONNES, TOUR À VENT
def roofz(x, y): return 11.6 + 2.6 * (abs(x) / 14.0) ** 1.7 + 0.45 * (abs(y) / 8.0) ** 2
def surf(name, x0, x1, y0, y1, nx, ny, dz, m, thick):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [[bm.verts.new((x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny, roofz(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny) + dz)) for j in range(ny + 1)] for i in range(nx + 1)]
    for i in range(nx):
        for j in range(ny): bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    bm.to_mesh(me); bm.free(); o = _obj(name, me, m)
    md = o.modifiers.new('epaisseur', 'SOLIDIFY'); md.thickness = thick; md.offset = -1; return o
surf('Toit_structure', -14.5, 14.5, -8.2, 8.2, 58, 32, 0.0, 'wood', 0.45)
surf('Toit_vegetal', -14.0, 14.0, -7.7, 7.7, 56, 30, 0.08, 'green', 0.12)
for k in range(30):
    x = -14.5 + k
    stick(f'Chevron_{k}', (x, -8.2, roofz(x, -8.2) - 0.5), (x, 8.2, roofz(x, 8.2) - 0.5), 0.07, 'wood', 5)
for y in (-8.1, 8.1):
    for k in range(29):
        xa, xb = -14.5 + k, -13.5 + k
        stick(f'Rive_{y > 0}_{k}', (xa, y, roofz(xa, y) - 0.25), (xb, y, roofz(xb, y) - 0.25), 0.16, 'wood_dk', 6)
n = 0
for sx in (-1, 1):
    for i in range(4):
        x = sx * (5.0 + i * 1.7); dzdx = (roofz(x + 0.05, 0) - roofz(x - 0.05, 0)) / 0.1
        for j in range(5):
            y = -4.4 + j * 2.2
            box(f'Solaire_{n}', (1.6, 2.0, 0.06), (x, y, roofz(x, y) + 0.32), 'solar', (0, -math.atan(dzdx), 0)); n += 1
# claustras vitrés entre le haut des murs et le toit
def infill(name, pts, fixed, axis):
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; mid = (a + b) / 2
        top = (roofz(mid, fixed) if axis == 'x' else roofz(fixed, mid)) - 0.5; h = top - (ZT + 0.2)
        if h < 0.15: continue
        if axis == 'x':
            box(f'{name}_v{i}', (b - a, 0.04, h), (mid, fixed, ZT + 0.2 + h / 2), 'glass')
            stick(f'{name}_m{i}', (a, fixed, ZT + 0.2), (a, fixed, top + 0.05), 0.06, 'wood', 5)
        else:
            box(f'{name}_v{i}', (0.04, b - a, h), (fixed, mid, ZT + 0.2 + h / 2), 'glass')
            stick(f'{name}_m{i}', (fixed, a, ZT + 0.2), (fixed, a, top + 0.05), 0.06, 'wood', 5)
xs = [x * 0.6 for x in range(-20, 21)]; ys = [y * 0.6 for y in range(-9, 10)]
infill('Claustra_av', xs, -5.5, 'x'); infill('Claustra_ar', xs, 5.5, 'x'); infill('Claustra_g', ys, -12.0, 'y'); infill('Claustra_d', ys, 12.0, 'y')
def funnel(name, cx, cy):
    z0, z1 = Z0, roofz(cx, cy) - 0.45; N, S = 30, 10
    rad = lambda t: 0.45 + 2.6 * t ** 2.3
    for s in range(N):
        a0 = 2 * math.pi * s / N; pts = []
        for k in range(S + 1):
            t = k / S; a = a0 + 0.35 * t; r = rad(t); pts.append((cx + r * math.cos(a), cy + r * math.sin(a), z0 + (z1 - z0) * t))
        for k in range(S): stick(f'{name}_b{s}_{k}', pts[k], pts[k + 1], 0.06, 'wood', 5)
    for k, t in enumerate((0.0, 0.25, 0.45, 0.62, 0.76, 0.88, 1.0)): torus(f'{name}_anneau{k}', rad(t), 0.05, (cx, cy, z0 + (z1 - z0) * t), 'wood')
for i, (cx, cy) in enumerate([(-2.6, -6.6), (2.6, -6.6), (-2.6, 6.6), (2.6, 6.6)]): funnel(f'Colonne{i}', cx, cy)
me = bpy.data.meshes.new('Tour_vent'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=1.6, radius2=0.95, depth=5.2); bm.to_mesh(me); bm.free()
_obj('Tour_vent', me, 'earth2', (0, 0, roofz(0, 0) + 2.3), (0, 0, math.pi / 4))
box('Tour_vent_chapeau', (1.5, 1.5, 0.25), (0, 0, roofz(0, 0) + 5.0), 'earth')
for sg in (-1, 1):
    for r_ in range(4):
        for c_ in range(3 - (r_ % 2)):
            x = (c_ - (2 - (r_ % 2)) / 2) * 0.32
            box(f'Perfo_{sg}_{r_}_{c_}', (0.16, 0.05, 0.22), (x, sg * (1.05 - r_ * 0.05), roofz(0, 0) + 3.6 + r_ * 0.32), 'dark')

# ================================================================= VÉGÉTATION DU BALCON
for y in (-7.0, 7.0):
    for x in [i * 0.9 - 12.6 for i in range(29)]:
        if y < 0 and abs(x) < 1.3: continue
        if random.random() < 0.85: blob(f'Plante_jard_{x:.1f}_{y}', (x + random.uniform(-.2, .2), y, Z1 + 0.65), random.uniform(0.35, 0.55), random.choice(['leaf', 'leaf2']))
        if random.random() < 0.45: blob(f'Liane_{x:.1f}_{y}', (x, y + (0.35 if y > 0 else -0.35), Z1a - random.uniform(0.3, 1.2)), 0.25, 'leaf', (0.6, 0.6, random.uniform(1.6, 3.0)))

# ================================================================= ABORDS
boxr('Allee_avant', -1.3, 1.3, -30, -14.6, 0.0, 0.06, 'path'); boxr('Allee_tour', -17, 17, -12.3, -10.1, 0.0, 0.06, 'path')
boxr('Allee_gauche', -18.1, -15.9, -13, 13, 0.0, 0.06, 'path'); boxr('Allee_droite', 15.9, 18.1, -13, 13, 0.0, 0.06, 'path')
def pond(name, x0, x1, y0, y1):
    boxr(name + '_eau', x0, x1, y0, y1, 0.04, 0.09, 'water')
    for (a, b, c, d) in ((x0 - .2, x1 + .2, y0 - .3, y0), (x0 - .2, x1 + .2, y1, y1 + .3), (x0 - .3, x0, y0, y1), (x1, x1 + .3, y0, y1)): boxr(f'{name}_bord{a:.0f}{c:.0f}', a, b, c, d, 0.0, 0.25, 'slab')
    for k in range(int((x1 - x0) * (y1 - y0) / 3)): cyl(f'{name}_nen{k}', random.uniform(0.25, 0.5), 0.03, (random.uniform(x0 + .5, x1 - .5), random.uniform(y0 + .5, y1 - .5), 0.1), random.choice(['leaf', 'leaf2']), 9)
    for k in range(int((x1 - x0) * 1.2)):
        x = random.uniform(x0 + .4, x1 - .4); y = random.choice([y0 + .6, y1 - .6])
        for j in range(5): stick(f'{name}_ros{k}_{j}', (x, y, 0.1), (x + random.uniform(-.3, .3), y + random.uniform(-.3, .3), random.uniform(0.9, 1.6)), 0.025, 'leaf2', 4)
pond('Bassin_avant', -12.5, -2.2, -9.9, -7.6); pond('Bassin_arriere', -12.0, 6.0, 7.6, 14.0)
L = 9.0; ang = math.radians(-35); xa, ya = -3.0, 7.4; xb, yb = xa - L * math.sin(ang), ya + L * math.cos(ang)
for k in range(int(L / 0.25)):
    t = k * 0.25; box(f'Passerelle_lame{k}', (1.6, 0.2, 0.06), (xa - t * math.sin(ang), ya + t * math.cos(ang), 0.45), 'wood', (0, 0, ang))
for s in (-0.8, 0.8):
    ox, oy = s * math.cos(ang), s * math.sin(ang)
    stick(f'Passerelle_main{s}', (xa + ox, ya + oy, 1.45), (xb + ox, yb + oy, 1.45), 0.035, 'metal', 5)
    stick(f'Passerelle_lisse{s}', (xa + ox, ya + oy, 0.95), (xb + ox, yb + oy, 0.95), 0.025, 'metal', 5)
    stick(f'Passerelle_poutre{s}', (xa + ox, ya + oy, 0.38), (xb + ox, yb + oy, 0.38), 0.08, 'wood_dk', 6)
    for k in range(10):
        t = k / 9; px, py = xa + (xb - xa) * t + ox, ya + (yb - ya) * t + oy
        stick(f'Passerelle_pot{s}_{k}', (px, py, 0.4), (px, py, 1.45), 0.03, 'metal', 5)
for side in (-1, 1):
    for r in range(4):
        y = -16.0 - r * 2.2; boxr(f'Plate_bande_{side}_{r}', side * 2.4, side * 10.9, y - 0.6, y + 0.6, 0.0, 0.2, 'path')
        for c in range(9): blob(f'Plant_{side}_{r}_{c}', (side * (2.9 + c * 0.9), y, 0.45), random.uniform(0.3, 0.45), random.choice(['leaf', 'leaf2']), (1, 1, 0.8))
def tree(name, x, y, h=6.0, r=2.2):
    cyl(name + '_tronc', 0.22, h * 0.6, (x, y, h * 0.3), 'wood_dk', 7, r2=0.15)
    for j in range(4): blob(f'{name}_cime{j}', (x + random.uniform(-.8, .8), y + random.uniform(-.8, .8), h * 0.65 + random.uniform(0, 1.4)), r * random.uniform(0.6, 0.9), random.choice(['leaf', 'leaf2']))
for i, (x, y) in enumerate([(-22, -14), (22, -14), (-24, 2), (24, 4), (-21, 16), (21, 17), (-8, -26), (8, -26), (0, 20), (-28, -6), (28, -8), (12, 18), (-14, -22), (14, -22)]):
    tree(f'Arbre{i}', x, y, random.uniform(5, 8), random.uniform(1.8, 2.8))
for i in range(40):
    a = random.uniform(0, 2 * math.pi); x = 15.5 * math.cos(a); y = 10.5 * math.sin(a)
    if abs(x) < 2.5 and y < 0: continue
    blob(f'Buisson{i}', (x, y, 0.5), random.uniform(0.5, 0.9), random.choice(['leaf', 'leaf2']), (1, 1, 0.85))
for i, (x, y) in enumerate([(-1.8, -16), (1.8, -16), (-1.8, -22), (1.8, -22), (-1.8, -28), (1.8, -28)]):
    cyl(f'Borne_{i}', 0.07, 0.7, (x, y, 0.35), 'metal', 8); cyl(f'Borne_lum_{i}', 0.1, 0.12, (x, y, 0.76), 'lamp', 8)

# ================================================================= LUMIÈRE, CAMÉRA
sc = bpy.context.scene
sd = bpy.data.lights.new('Soleil_soir', 'SUN'); sd.energy = 4.0; sd.color = (1.0, 0.86, 0.66); sd.angle = 0.05
so = bpy.data.objects.new('Soleil_soir', sd); so.rotation_euler = (math.radians(58), 0, math.radians(-40)); sc.collection.objects.link(so)
w = sc.world or bpy.data.worlds.new('Monde'); sc.world = w; w.use_nodes = True
bg = next(nd for nd in w.node_tree.nodes if nd.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.62, 0.72, 0.85, 1); bg.inputs[1].default_value = 0.9
cd = bpy.data.cameras.new('Camera'); cd.lens = 30
cam = bpy.data.objects.new('Camera', cd); cam.location = (24, -38, 14); sc.collection.objects.link(cam); sc.camera = cam
tg = bpy.data.objects.new('Cible', None); tg.location = (0, 0, 6); sc.collection.objects.link(tg)
cn = cam.constraints.new('TRACK_TO'); cn.target = tg; cn.track_axis = 'TRACK_NEGATIVE_Z'; cn.up_axis = 'UP_Y'
print('objets :', len(col.objects))
