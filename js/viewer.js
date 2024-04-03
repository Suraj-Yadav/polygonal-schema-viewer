import * as THREE from 'three';

import * as d3Force3D from "d3-force-3d";

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import Simulation from './simulation.js';


const GRID_X = 10;
const GRID_Y = 10;

class Viewer {

    /**
     * @param {string} canvasId
     */
    constructor(canvasId) {
        this.reader = new FileReader();

        this.canvas = document.querySelector(`#${canvasId}`);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: this.canvas });

        const fov = 75;
        const aspect = 2; // the canvas default
        const near = 0.1;
        const far = 5;
        this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this.camera.position.x = 2;

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.target.set(0, 0, 5);
        this.controls.update();

        this.controls.addEventListener('change', () => {
            this.render();
        })

        this.scene = new THREE.Scene();

        this.scene.add(new THREE.GridHelper());
        this.scene.add(new THREE.AxesHelper(5));

        this.objLoader = new OBJLoader();

        {

            const skyColor = 0xB1E1FF; // light blue
            const groundColor = 0xB97A20; // brownish orange
            const intensity = 3;
            const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
            this.scene.add(light);

        }

        this.surfaceMaterial = new THREE.MeshPhysicalMaterial({ color: 0x44aa88 });
        this.surfaceMaterial.side = THREE.DoubleSide;

        this.wireMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.wireMaterial.wireframe = true;
        this.wireMaterial.side = THREE.DoubleSide;

        // this.positions = new Float32Array(this.numVertices * positionNumComponents);
        // {
        //     let offset = 0;
        //     for (let i = 0; i <= gridX; i++) {
        //         for (let j = 0; j <= gridY; j++) {
        //             this.positions.set([i / gridX, j / gridY, 0.0], offset);
        //             offset += positionNumComponents;
        //         }
        //     }
        // }
        // this.geometry = new THREE.BufferGeometry();
        // this.positionAttribute = new THREE.BufferAttribute(this.positions, positionNumComponents);
        // this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
        // this.geometry.setAttribute('position', this.positionAttribute);
        // this.geometry.setIndex([0, 1, 2, 1, 3, 2]);
        // this.geometry.computeVertexNormals();

        // this.positionAttribute.array
        this.loadPlane();
    }

    loadPlane(gridX = GRID_X, gridY = GRID_Y) {
        this.load(new THREE.PlaneGeometry(10, 10, gridX, gridY));
    }

    joinSeam(seam) {
        // this.seamStrength = 0.9;
        this.sim.updateSim(document.getElementById('volume').value, seam);
        // this.simulation.force('link').strength((l) => {
        //     const w = this.edges[l.source.index][l.target.index];
        //     if (w) {
        //         return 0.5;
        //     }
        //     return this.seamStrength;
        // });
        // this.simulation.restart();
    }

    /**
     * @param {THREE.BufferGeometry} geometry
     */
    load(geometry) {
        if (this.geometry) {
            this.geometry.dispose();
        }
        this.geometry = geometry;
        this.scene.remove(this.surfaceMesh);
        this.scene.remove(this.wireMesh);
        this.surfaceMesh = new THREE.Mesh(this.geometry, this.surfaceMaterial);
        this.wireMesh = new THREE.Mesh(this.geometry, this.wireMaterial);

        this.scene.add(this.surfaceMesh);
        this.scene.add(this.wireMesh);

        this.seamStrength = 0;

        this.lookAtMesh();

        if (this.sim) { this.sim.sim.stop() };

        this.sim = new Simulation(geometry, GRID_X, GRID_Y, () => { this.render(true); });
        this.resized();
        this.render();
    }

    static extractGeometry(mesh) {
        /**
         * @type {Array<THREE.BufferGeometry>} 
         */
        const geometries = [];
        mesh.traverse((elem) => {
            if (elem instanceof THREE.Mesh) {
                geometries.push(elem.geometry);
            }
        })
        let geo = mergeGeometries(geometries);
        for (const name of Object.keys(geo.attributes)) {
            if (name !== 'position') {
                geo.deleteAttribute(name);
            }
        }
        geo = mergeVertices(geo);
        geo.computeVertexNormals();
        return geo;
    }


    loadUrl(url, path = null) {
        this.objLoader.load(url,
            (mesh) => { this.load(Viewer.extractGeometry(mesh)); },
            null,
            (err) => { alert(`Error while loading ${path || url} file: ${err}`); });
        this.objLoader.parse()
    }

    /**
     * @param {File} file
     */
    loadFile(file) {
        if (!this.reader.onload) {
            this.reader.onload = (e) => {
                if (e.target.readyState != FileReader.DONE) {
                    return;
                }
                this.load(Viewer.extractGeometry(this.objLoader.parse(e.target.result)));
            };
        }
        this.reader.readAsText(file);
    }

    lookAtMesh() {

        const bbox = new THREE.Box3().setFromObject(this.surfaceMesh);

        // console.log(bbox);

        const boxSize = bbox.getSize(new THREE.Vector3()).length();
        const boxCenter = bbox.getCenter(new THREE.Vector3());
        const sizeToFitOnScreen = boxSize * 1.2;

        const halfSizeToFitOnScreen = sizeToFitOnScreen * 0.5;
        const halfFovY = THREE.MathUtils.degToRad(this.camera.fov * .5);
        const distance = halfSizeToFitOnScreen / Math.tan(halfFovY);
        // compute a unit vector that points in the direction the camera is now
        // in the xz plane from the center of the box
        const direction = (new THREE.Vector3())
            .subVectors(this.camera.position, boxCenter)
            // .multiply(new THREE.Vector3(1, 0, 1))
            .normalize();

        // move the camera to a position distance units way from the center
        // in whatever direction the camera was from the center already
        this.camera.position.copy(direction.multiplyScalar(distance).add(boxCenter));

        // pick some near and far values for the frustum that
        // will contain the box.
        this.camera.near = boxSize / 100;
        this.camera.far = boxSize * 100;

        this.camera.updateProjectionMatrix();

        // console.log(boxCenter);

        // point the camera to look at the center of the box
        this.camera.lookAt(boxCenter.x, boxCenter.y, boxCenter.z);

        this.controls.maxDistance = boxSize * 10;
        this.controls.target.copy(boxCenter);
    }

    resized() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();



        // requestAnimationFrame((t) => this.render(t));
        // this.render(0);
    }


    render(posUpdated = false) {
        if (posUpdated) {
            const pos = this.geometry.getAttribute('position');
            const N = pos.count;
            let i = 0;
            for (const node of this.sim.nodes) {
                if (i == 0) {
                    console.log(node);
                }
                pos.setXYZ(i++, node.x, node.y, node.z);
            }
            console.log(i, N);
            pos.needsUpdate = true;
            this.geometry.computeBoundingBox();
            this.lookAtMesh();

            // let k = 0;
            // const pos1 = this.seams.geometry.getAttribute('position');
            // for (let i = 0; i < (GRID_X + 1); i++) {
            //     const j = GRID_X * (GRID_Y + 1) + i;
            //     pos1.setXYZ(k++, pos.getX(i), pos.getY(i), pos.getZ(i));
            //     pos1.setXYZ(k++, pos.getX(j), pos.getY(j), pos.getZ(j));
            // }
            // pos1.needsUpdate = true;
        }



        this.renderer.render(this.scene, this.camera);
    }

};

export default Viewer;
