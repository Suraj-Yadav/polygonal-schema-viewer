import * as d3Force3D from "d3-force-3d";
import * as THREE from 'three';

class Simulation {
    /**
     * @param {THREE.BufferGeometry} geometry
     */
    constructor(geometry, GRID_X, GRID_Y, cb) {
        this.GRID_X = GRID_X;
        this.GRID_Y = GRID_Y;
        this.cb = cb;
        this.geometry = geometry; this.baseEdges(geometry);
    }

    baseEdges(geometry) {
        const N = geometry.getAttribute('position').count;
        const pos = geometry.getAttribute('position');

        this.adjList = [];
        for (let i = 0; i < N; i++) {
            this.adjList.push({});
        }

        let a, b, c;
        let va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();

        const indices = geometry.index.array;

        // let delta = null;

        for (let i = 0; i < indices.length; i += 3) {
            a = indices[i];
            b = indices[i + 1];
            c = indices[i + 2];
            va.set(pos.getX(a), pos.getY(a), pos.getZ(a));
            vb.set(pos.getX(b), pos.getY(b), pos.getZ(b));
            vc.set(pos.getX(c), pos.getY(c), pos.getZ(c));

            this.addEdge(a, b, va, vb);
            this.addEdge(b, c, vb, vc);
            this.addEdge(c, a, vc, va);
        }
        console.log(this.adjList);
    }

    updateSim(s, enableSeams = false) {
        console.log("called");
        const N = this.geometry.getAttribute('position').count;
        const pos = this.geometry.getAttribute('position');

        const links = [];
        for (let u = 0; u < N; u++) {
            for (const [v0, w] of Object.entries(this.adjList[u])) {
                const v = parseInt(v0);
                if (v <= u) { continue; }
                links.push({ source: u, target: v });
            }
        }
        const seams = [];
        for (let u = 0; u <= this.GRID_X; u++) {
            const v = u + (this.GRID_X + 1) * this.GRID_Y;
            seams.push({ source: u, target: v });
        }
        this.nodes = Array.from({ length: N }, (_, i) => {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            return { index: i, x, y, z };
        });
        this.sim = d3Force3D.forceSimulation(this.nodes, 3);

        this.sim.on('tick', () => { /* console.log(Date.now()); */ this.cb(); });

        if (enableSeams) {
            // this.sim.force("center", d3Force3D.forceCenter(0, 0, 0));
        }
        // this.sim.force("rad", d3Force3D.forceRadial(1).strength(0.01));
        this.sim.force("charge", d3Force3D.forceManyBody().strength(-1));
        this.sim.force("links", d3Force3D.forceLink(links).distance((l) => {
            return this.adjList[l.source.index][l.target.index].dist;
        }).strength(1));
        this.sim.force("seams", d3Force3D.forceLink(seams).distance((l) => {
            return 0;
        }).strength(1));
    }

    /**
     * @param {number} a
     * @param {number} b
     * @param {THREE.Vector3} va
     * @param {THREE.Vector3} vb
     */
    addEdge(a, b, va, vb, repel = false) {
        if (this.adjList[a][b]) {
            return;
        }
        const thresh = 100 / (this.GRID_X * this.GRID_X) + 100 / (this.GRID_Y * this.GRID_Y);
        if (va.distanceToSquared(vb) >= thresh) {
            console.log(va.distanceToSquared(vb), thresh);
            return;
        }
        if (repel) {
            // this.repelAdjList[a][b] = { dist: 2 * va.distanceTo(vb), repel };
            // this.repelAdjList[b][a] = { dist: 2 * va.distanceTo(vb), repel };
        } else {
            this.adjList[a][b] = { dist: va.distanceTo(vb), repel };
            this.adjList[b][a] = { dist: va.distanceTo(vb), repel };
        }
    }
};


export default Simulation;
