# -*- coding: utf-8 -*-
"""Barrage du Seuil de Djenné : chaussée surélevée qui traverse le Bani pour que le pick-up passe sans se noyer.
À lancer dans Blender APRÈS avoir importé la ville (assets/models/djenne-ville-leger.glb) :
    exec(open(r'...\\blender\\gen_barrage.py', encoding='utf-8').read())
Repère Blender (Z haut) = glTF du jeu (Y haut) tourné : x_blender = x_jeu, y_blender = -z_jeu.
Le gué du jeu (assets/data/routes-djenne-voiture.json) traverse le fleuve entre (582, 120) et (669, 73) m réels (est, nord) :
conversion K = 0,84 -> jeu x = nord/K + 12, z = est/K - 5,2.
Noms Bat_Barrage_* : le jeu les prend pour des colliders (même règle que Bat_* de la ville). Aucune image : couleurs de sommets seulement.
"""
import bpy, bmesh, math, random
from mathutils import Vector

random.seed(5)
K = 0.84
def to_blender(e, n): return Vector((n / K + 12.0, -(e / K - 5.2)))
A = to_blender(582, 120); B = to_blender(669, 73)          # rive ouest -> rive est (extrémités de la partie « gué » du réseau routier)
_M = globals().get('BARRAGE_MATRIX')                        # emplacement choisi dans Blender (barrage déplacé à la main) : matrice monde de la chaussée -> le barrage est refait à cet endroit
if _M is not None:
    A = Vector(((_M @ Vector((A.x, A.y, 0.0))).x, (_M @ Vector((A.x, A.y, 0.0))).y)); B = Vector(((_M @ Vector((B.x, B.y, 0.0))).x, (_M @ Vector((B.x, B.y, 0.0))).y))
axis = (B - A).normalized(); nrm = Vector((-axis.y, axis.x))

# ---------------------------------------------------------------- relevés du terrain et de l'eau
sol = [o for o in bpy.data.objects if o.name.startswith('Sol_Ville')][0]
eau = [o for o in bpy.data.objects if o.name.startswith('Fleuve_Eau')][0]
def ray(o, x, y):
    mw = o.matrix_world; inv = mw.inverted()
    ok, loc, n, i = o.ray_cast(inv @ Vector((x, y, 500)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized())
    return (mw @ loc).z if ok else None
def ground(s, t=0.0):
    p = A + axis * s + nrm * t; return ray(sol, p.x, p.y)
WATER = max(z for z in (ray(eau, *(A + axis * s)) for s in range(10, 60, 2)) if z is not None)
BED = min(z for z in (ground(s) for s in range(14, 56, 2)) if z is not None)
D = WATER + 1.25                                           # dessus de la chaussée : 1,25 m au-dessus de l'eau
print('eau', round(WATER, 2), 'lit', round(BED, 2), 'chaussée', round(D, 2))
# début côté ouest : là où la berge (qui descend vers l'est) passe sous le niveau de la chaussée
s_w = 0.0
while s_w < 30 and (ground(s_w) or -99) > D + 0.05: s_w += 0.5
BRIDGE0, BRIDGE1 = 12.5, 51.5                               # partie pont sur piles
gz_e = ground(70) or BED; RAMP = (D - gz_e) / 0.12          # rampe est : 12 % maximum (~7°)
s_e = BRIDGE1 + RAMP
print('chaussée de s =', round(s_w, 1), 'à', round(s_e, 1), '(m le long du gué), longueur', round(s_e - s_w, 1))
HALF = 3.4                                                  # demi-largeur du tablier
KERB = 0.4; DECK_HALF = HALF - KERB                         # largeur roulable 6 m
BASE = BED - 0.6                                            # pied des remblais (sous le terrain)

def P(s, t, z): p = A + axis * s + nrm * t; return Vector((p.x, p.y, z))

# ---------------------------------------------------------------- matériaux (couleurs de sommets, aucune texture)
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
def vmat(name, rough=0.95):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for n in [n for n in nt.nodes if n.type == 'VERTEX_COLOR']: nt.nodes.remove(n)
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Couleur'; nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough; m.diffuse_color = (0.6, 0.5, 0.4, 1); return m
MAT = {k: vmat('Barrage_' + k) for k in ('Beton', 'Terre', 'Route', 'Pierre', 'Acier', 'Bois')}
PAL = {
    'Beton': [lin('#c9bba3'), lin('#bfb09a'), lin('#d3c5ad')], 'Terre': [lin('#c8a27a'), lin('#bd9770'), lin('#d1ad86')],
    'Route': [lin('#9a8466'), lin('#8e7a5e'), lin('#a38d6d')], 'Pierre': [lin('#8a7e6e'), lin('#7a7060'), lin('#968a78')],
    'Acier': [lin('#5d6166')], 'Bois': [lin('#8a5a2b'), lin('#7d4f26')],
}
MUD = lin('#6f6150')                                        # laisse de l'eau : base plus sombre
bms = {k: bmesh.new() for k in MAT}
def solid(kind, pts):
    """Solide convexe fermé (enveloppe convexe des points) -> faces colorées avec variations discrètes."""
    bm = bms[kind]; vs = [bm.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs, use_existing_faces=False)
    bmesh.ops.delete(bm, geom=res['geom_interior'], context='VERTS') if res.get('geom_interior') else None
    return [f for f in res['geom'] if isinstance(f, bmesh.types.BMFace)]
def box_pts(s0, s1, t0, t1, z0, z1): return [P(s, t, z) for s in (s0, s1) for t in (t0, t1) for z in (z0, z1)]

# ---------------------------------------------------------------- remblais (trapèzes) et tablier
def embankment(s0, s1, z0top, z1top, half=HALF):
    """Remblai de terre : dessus plat ou en pente, talus 1:1,5 jusqu'au pied."""
    run0 = (z0top - BASE) * 1.5; run1 = (z1top - BASE) * 1.5
    pts = [P(s0, -half, z0top), P(s0, half, z0top), P(s1, -half, z1top), P(s1, half, z1top),
           P(s0, -half - run0, BASE), P(s0, half + run0, BASE), P(s1, -half - run1, BASE), P(s1, half + run1, BASE)]
    solid('Terre', pts)
embankment(s_w - 1.0, BRIDGE0 - 0.3, D - 0.05, D - 0.05)            # remblai ouest
embankment(BRIDGE1 + 0.3, s_e, D - 0.05, gz_e - 0.02)               # remblai est en rampe
# tablier béton de la partie pont + poutres + piles
solid('Beton', box_pts(BRIDGE0, BRIDGE1, -HALF, HALF, D - 0.55, D - 0.05))
for t in (-2.4, 0.0, 2.4): solid('Beton', box_pts(BRIDGE0, BRIDGE1, t - 0.22, t + 0.22, D - 1.05, D - 0.55))
solid('Beton', box_pts(BRIDGE0 - 0.6, BRIDGE0 + 0.4, -HALF - 0.2, HALF + 0.2, BASE, D - 0.05))     # culée ouest
solid('Beton', box_pts(BRIDGE1 - 0.4, BRIDGE1 + 0.6, -HALF - 0.2, HALF + 0.2, BASE, D - 0.05))     # culée est
npile = 5
for k in range(1, npile + 1):
    s = BRIDGE0 + (BRIDGE1 - BRIDGE0) * k / (npile + 1)
    solid('Beton', box_pts(s - 0.35, s + 0.35, -HALF + 0.2, HALF - 0.2, D - 1.45, D - 1.05))       # chevêtre
    for t in (-2.6, -0.87, 0.87, 2.6): solid('Beton', box_pts(s - 0.3, s + 0.3, t - 0.3, t + 0.3, BED - 0.5, D - 1.45))   # 4 piles carrées

# ---------------------------------------------------------------- chaussée (dessus), bordures (parapets), garde-corps
def road_strip(s0, s1, z0, z1):
    solid('Route', [P(s0, -DECK_HALF, z0 - 0.0), P(s0, DECK_HALF, z0), P(s1, -DECK_HALF, z1), P(s1, DECK_HALF, z1),
                    P(s0, -DECK_HALF, z0 - 0.12), P(s0, DECK_HALF, z0 - 0.12), P(s1, -DECK_HALF, z1 - 0.12), P(s1, DECK_HALF, z1 - 0.12)])
road_strip(s_w - 0.5, BRIDGE1, D, D)
road_strip(BRIDGE1, s_e, D, gz_e)
def profile_z(s): return D if s <= BRIDGE1 else D + (gz_e - D) * (s - BRIDGE1) / (s_e - BRIDGE1)
step = 2.0
s = s_w - 0.5
while s < s_e - 0.01:
    s2 = min(s + step, s_e)
    for side in (-1, 1):                                                   # parapets pleins de 1 m (le pick-up détecte les obstacles à 0,75 m : il ne peut ni les franchir ni tomber à l'eau)
        t0, t1 = (DECK_HALF, HALF) if side > 0 else (-HALF, -DECK_HALF)
        solid('Beton', [P(s, t0, profile_z(s) - 0.05), P(s, t1, profile_z(s) - 0.05), P(s2, t0, profile_z(s2) - 0.05), P(s2, t1, profile_z(s2) - 0.05),
                        P(s, t0, profile_z(s) + 1.0), P(s, t1, profile_z(s) + 1.0), P(s2, t0, profile_z(s2) + 1.0), P(s2, t1, profile_z(s2) + 1.0)])
    s = s2
# garde-corps en acier au-dessus des parapets (partie pont)
def rail(pa, pb, r):
    d = pb - pa; L = d.length; m = (pa + pb) / 2; n = 5
    for i in range(n):
        a = i / n * 2 * math.pi; b = (i + 1) / n * 2 * math.pi
    # tube à 5 pans sans bouchons : on construit les quads à la main
    q = d.to_track_quat('Z', 'Y'); ring = [Vector((math.cos(i / n * 2 * math.pi) * r, math.sin(i / n * 2 * math.pi) * r, 0)) for i in range(n)]
    bm = bms['Acier']; lo = [bm.verts.new(pa + q @ v) for v in ring]; hi = [bm.verts.new(pb + q @ v) for v in ring]
    return [bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i])) for i in range(n)]
for side in (-1, 1):
    t = side * (HALF - KERB / 2)
    for h in (1.3, 1.6): rail(P(BRIDGE0 - 0.5, t, D + h), P(BRIDGE1 + 0.5, t, D + h), 0.035)
    s = BRIDGE0 - 0.5
    while s <= BRIDGE1 + 0.51: rail(P(s, t, D + 1.0), P(s, t, D + 1.65), 0.03); s += 2.0

# ---------------------------------------------------------------- enrochements (blocs de pierre bas-poly) au pied des remblais
def boulder(s, t, z, r):
    bm = bms['Pierre']; geom = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)['verts']
    rot = Vector((random.uniform(0, 6.28), random.uniform(0, 6.28), 0))
    for v in geom:
        v.co = Vector((v.co.x * random.uniform(0.9, 1.2), v.co.y * random.uniform(0.9, 1.2), v.co.z * 0.65)); v.co.rotate(__import__('mathutils').Euler(rot)); v.co += P(s, t, z)
    return geom
for (a0, a1) in ((s_w, BRIDGE0 + 0.5), (BRIDGE1 - 0.5, BRIDGE1 + 12.0)):
    s = a0
    while s < a1:
        for side in (-1, 1):
            zt = D if s < BRIDGE0 + 1 else profile_z(s)
            run = (zt - BASE) * 1.5 + HALF
            g = ground(s, side * (run - 0.6)) or BED
            boulder(s + random.uniform(-0.3, 0.3), side * (run - random.uniform(0.2, 1.2)), g + 0.15, random.uniform(0.28, 0.55))
        s += 1.1

# ---------------------------------------------------------------- création des objets (couleurs par face)
def colorize(kind, bm):
    cl = bm.loops.layers.color.get('Couleur') or bm.loops.layers.color.new('Couleur'); pal = PAL[kind]
    for f in bm.faces:
        n = f.normal; c = f.calc_center_median()
        k = 1.0 + random.uniform(-0.07, 0.07) + math.sin(c.x * 0.7 + c.y * 0.9) * 0.04
        col = list(pal[int(abs(c.x * 3 + c.y * 5 + c.z * 7)) % len(pal)])
        if kind in ('Terre', 'Pierre', 'Beton'):
            low = max(0.0, min(1.0, (WATER + 0.7 - c.z) / 0.9))                              # laisse de l'eau : plus sombre juste au-dessus et sous la surface
            col = [col[i] * (1 - low * 0.5) + MUD[i] * low * 0.5 for i in range(3)]
        col = [min(1.0, v * k) for v in col]
        for l in f.loops: l[cl] = (*col, 1.0)
col = bpy.data.collections.get('Barrage') or bpy.data.collections.new('Barrage')
if col.name not in [c.name for c in bpy.context.scene.collection.children]: bpy.context.scene.collection.children.link(col)
for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
tot = 0
for kind, bm in bms.items():
    if not bm.faces: continue
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if kind != 'Acier': bm.normal_update()
    colorize(kind, bm)
    me = bpy.data.meshes.new('Bat_Barrage_' + kind); bm.to_mesh(me); bm.free()
    me.materials.append(MAT[kind]); ob = bpy.data.objects.new('Bat_Barrage_' + kind, me); col.objects.link(ob)
    t = sum(len(p.vertices) - 2 for p in me.polygons); tot += t; print(ob.name, t, 'triangles')
# poteaux électriques le long du côté sud (décor, non collisionnable)
def pole(s, t):
    base = ground(s, t) or BED
    cy = bpy.data.meshes.new('Poteau'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=0.12, radius2=0.09, depth=6.0); bm.to_mesh(me := cy); bm.free()
    o = bpy.data.objects.new('Deco_Barrage_Poteau', cy); o.location = P(s, t, base + 3.0); cy.materials.append(MAT['Bois']); col.objects.link(o)
    arm = bpy.data.meshes.new('Bras'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * 1.8, v.co.y * 0.08, v.co.z * 0.08))
    bm.to_mesh(arm); bm.free(); oa = bpy.data.objects.new('Deco_Barrage_Bras', arm); oa.location = P(s, t, base + 5.6); oa.rotation_euler = (0, 0, math.atan2(axis.y, axis.x) + math.pi / 2)
    arm.materials.append(MAT['Bois']); col.objects.link(oa)
for k, s in enumerate((-6.0, 18.0, 42.0, 66.0, 88.0)): pole(s, 7.5)
print('barrage : ', round(tot), 'triangles au total')
