import * as d3Force3D from "d3-force-3d";
import * as THREE from 'three';
import * as Collections from 'typescript-collections';

type UpdatePosCallback = (positions: Array<{ x: number, y: number, z: number }>) => void;
type Node = {
    index: number,
    x: number, y: number, z: number,
    fx?: number | null | undefined, fy?: number | null | undefined, fz?: number | null | undefined
};

class Simulation {
    update_pos_cb: UpdatePosCallback;
    nodes: Array<Node>;
    ___a: THREE.Vector3;
    ___b: THREE.Vector3;
    THRESH: number;

    adjList: Array<{}>;

    sim: any;

    constructor(geometry: THREE.BufferGeometry, update_pos_cb, thresh = Infinity) {
        this.update_pos_cb = update_pos_cb;
        this.nodes = [];
        this.___a = new THREE.Vector3();
        this.___b = new THREE.Vector3();
        this.THRESH = thresh;
        this.extractEdges(geometry);
    }

    update_pos_spread(idx, delta: THREE.Vector3, spread) {
        if (spread <= 0) { return; }
        if (delta.lengthSq() <= 0) { return; }
        const q = new Collections.Queue<number>();
        const dist = new Map<number, number>();
        const visited = new Set<number>();

        q.enqueue(idx);
        dist.set(idx, 0);

        while (!q.isEmpty()) {
            const u = q.dequeue();
            if (visited.has(u)) { continue; }
            visited.add(u);
            if (dist.get(u) >= spread) { continue; }
            for (const [v0, _] of Object.entries(this.adjList[u])) {
                const v = parseInt(v0);
                dist.set(v, dist.get(u) + 1);
                q.enqueue(v);
            }
        }
    }

    update_pos(idx: number, p: THREE.Vector3, spread = 1) {
        this.___a.set(this.nodes[idx].x, this.nodes[idx].y, this.nodes[idx].z);
        this.nodes[idx].x = p.x;
        this.nodes[idx].y = p.y;
        this.nodes[idx].z = p.z;
        this.___b.subVectors(p, this.___a);
        this.update_pos_spread(idx, this.___b, spread);
    }

    extractEdges(geometry: THREE.BufferGeometry) {
        const N = geometry.getAttribute('position').count;
        const pos = geometry.getAttribute('position');

        this.adjList = [];
        for (let i = 0; i < N; i++) {
            this.adjList.push({});
            this.nodes.push({ index: i, x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) })
        }

        const indices = geometry.index.array;
        for (let i = 0; i < indices.length; i += 3) {
            this.addEdge(indices[i], indices[i + 1]);
            this.addEdge(indices[i + 1], indices[i + 2]);
            this.addEdge(indices[i + 2], indices[i]);
        }
    }

    dispose() {
        this.sim?.stop();
        this.sim = null;
    }

    stop() {
        this.sim?.stop();
    }

    updateSim() {
        const N = this.nodes.length;

        const links = [];
        for (let u = 0; u < N; u++) {
            for (const [v0, w] of Object.entries(this.adjList[u])) {
                const v = parseInt(v0);
                if (v <= u) { continue; }
                links.push({ source: u, target: v });
            }
        }

        this.dispose();
        this.sim = d3Force3D.forceSimulation(this.nodes, 3);

        this.sim.on('tick', () => { this.tick() });

        this.sim.force("center", d3Force3D.forceCenter());
        this.sim.force("charge", d3Force3D.forceManyBody().strength(-0.01));
        this.sim.force("links", d3Force3D.forceLink(links).distance((l) => {
            return this.adjList[l.source.index][l.target.index].dist;
        }).strength(1));
    }

    addEdge(a: number, b: number, repel = false) {
        if (this.adjList[a][b]) {
            return;
        }
        this.___a.set(this.nodes[a].x, this.nodes[a].y, this.nodes[a].z);
        this.___b.set(this.nodes[b].x, this.nodes[b].y, this.nodes[b].z);
        const distSq = this.___a.distanceToSquared(this.___b);
        if (distSq >= this.THRESH) {
            return;
        }
        if (repel) {
        } else {
            const dist = Math.sqrt(distSq);
            this.adjList[a][b] = { dist: dist, repel };
            this.adjList[b][a] = { dist: dist, repel };
        }
    }

    tick() {
        this.update_pos_cb(this.nodes);
    }
};


export default Simulation;
