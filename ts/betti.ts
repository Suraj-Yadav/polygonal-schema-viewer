import * as THREE from 'three';
import UnionFind from './unionfind';

type ArrayLengthMutationKeys = 'splice' | 'push' | 'pop' | 'shift' | 'unshift' | number
type ArrayItems<T extends Array<any>> = T extends Array<infer TItems> ? TItems : never
type FixedLengthArray<T extends any[]> =
    Pick<T, Exclude<keyof T, ArrayLengthMutationKeys>>
    & { [Symbol.iterator]: () => IterableIterator<ArrayItems<T>> }
let foo: FixedLengthArray<[string, string, string]>

type Edge = FixedLengthArray<[number, number]>;
type Face = FixedLengthArray<[number, number, number]>;
type FaceExt = FixedLengthArray<[number, number, number, number]>;

function id<Type extends Face | Edge>(x: Type) {
    x.sort();
    return x;
}

function sign(face: Face): FaceExt {
    let s = 1;
    if (face[0] > face[1]) {
        [face[0], face[1]] = [face[1], face[0]]
        s *= -1;
    }
    if (face[1] > face[2]) {
        [face[1], face[2]] = [face[2], face[1]]
        s *= -1;
    }
    if (face[0] > face[1]) {
        [face[0], face[1]] = [face[1], face[0]]
        s *= -1;
    }
    face = id(face);
    return [face[0], face[1], face[2], s];
}


function compute_betti(geometry: THREE.BufferGeometry) {
    const V = geometry.getAttribute('position').count;
    const pos = geometry.getAttribute('position');

    const coords = Array.from({ length: V }, () => new THREE.Vector3());

    for (let i = 0; i < V; i++) {
        coords[i].set(pos.getX(i), pos.getY(i), pos.getZ(i));
    }

    const faces = new Map<string, Face>();
    const edges = new Map<string, { edge: Edge, p: Array<number> }>();


    const EDGE_ORDER = [0, 1, 2, 0, 1];
    const indices = geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
        const face = id([indices[i], indices[i + 1], indices[i + 2]]);
        faces.set(face.toString(), face);
        for (let k = 2; k < EDGE_ORDER.length; k++) {
            const u = indices[i + EDGE_ORDER[k - 2]];
            const v = indices[i + EDGE_ORDER[k - 1]];
            const w = indices[i + EDGE_ORDER[k - 0]];
            const e = id([u, v]);
            if (edges.has(e.toString())) {
                edges.get(e.toString()).p.push(w);
            } else {
                edges.set(e.toString(), { edge: e, p: [w] });
            }
        }
    }
    {
        const line = new THREE.Vector3();
        const base = new THREE.Vector3();
        const d = new THREE.Vector3();
        const cross = new THREE.Vector3();
        for (const { edge, p } of Array.from(edges.values())) {
            if (p.length <= 2) { continue; }
            line.subVectors(coords[edge[1]], coords[edge[0]]);
            line.normalize();

            base.subVectors(coords[p[0]], coords[edge[0]]);
            base.addScaledVector(line, -line.dot(base));
            base.normalize();

            const values = new Map<number, number>();
            values.set(p[0], 0);
            for (let i = 1; i < p.length; i++) {
                values.set(p[i], 0);
                d.subVectors(coords[p[i]], coords[edge[0]]);
                d.addScaledVector(line, -line.dot(d));
                d.normalize();

                const dy = line.dot(cross.crossVectors(base, d));
                const dx = base.dot(d);
                values.set(p[i], Math.atan2(dy, dx));
            }
            p.sort((a, b) => values.get(a) - values.get(b));
        }
    }


    const faces_ext = new Map<string, FaceExt>();
    for (const [_, f] of Array.from(faces)) {
        faces_ext.set([f[0], f[1], f[2], 1].toString(), [f[0], f[1], f[2], 1]);
        faces_ext.set([f[0], f[1], f[2], -1].toString(), [f[0], f[1], f[2], -1]);
    }

    const v = new UnionFind(Array.from(Array(V).keys()));
    const m = new UnionFind(faces_ext.values());
    const k = new UnionFind(faces.values());

    for (const { edge: e, p: ws } of Array.from(edges.values())) {
        v.union(e[0], e[1]);
        if (ws.length == 1) {
            const a: FaceExt = [e[0], e[1], ws[0], 1];
            const b: FaceExt = [e[0], e[1], ws[0], -1];
            m.union(a, b);
        } else {
            for (let i = 1; i <= ws.length; i++) {
                const w1 = ws[i - 1];
                const w2 = ws[i % ws.length];
                const a: FaceExt = sign([e[0], e[1], w1]);
                const b: FaceExt = sign([e[0], w2, e[1]]);
                m.union(a, b);
                k.union(id([e[0], e[1], w1]), id([e[0], e[1], w2]));
            }
        }
    }


    const E = edges.size;
    const F = faces.size;
    const b0 = v.cc_count();
    const b2 = m.cc_count() - k.cc_count();
    const b1 = E + b0 + b2 - V - F;

    return `${b0}, ${b1}, ${b2}`;
}


export default compute_betti;
