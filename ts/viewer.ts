import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GUI } from 'lil-gui';

import Simulation from './simulation';
import compute_betti from './betti';
import { Queue } from 'typescript-collections';

import { Vector3 } from 'three';

const GRID_X = 10;
const GRID_Y = 10;
const GRID_SIZE = 10;

const HANDLE_MAT = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const SURFACE_MAT = new THREE.MeshPhysicalMaterial({ color: 0x44aa88 });
const SEAM_MAT = new THREE.MeshBasicMaterial({ color: 0x0000ff });
SEAM_MAT.side = THREE.DoubleSide;
SURFACE_MAT.side = THREE.DoubleSide;
SURFACE_MAT.transparent = true;
SURFACE_MAT.depthTest = true;
SURFACE_MAT.depthWrite = true;
SURFACE_MAT.metalness = 0.5;
SURFACE_MAT.roughness = 0.5;
SURFACE_MAT.clearcoat = 0.5;
SURFACE_MAT.clearcoatRoughness = 0;
const WIRE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
WIRE_MAT.side = THREE.DoubleSide;

class Viewer {
    // IO stuff
    reader: FileReader;
    objLoader: OBJLoader;
    plyLoader: PLYLoader;

    // scene stuff
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    labelRenderer: CSS2DRenderer;
    camera: THREE.PerspectiveCamera;
    orbitControls: OrbitControls;
    scene: THREE.Scene;
    labels: Array<CSS2DObject>;
    handles: Array<THREE.Mesh>;
    sim?: Simulation;
    geometry: THREE.BufferGeometry;
    seamGeometry: THREE.BufferGeometry;
    surfaceMesh: THREE.Mesh;
    wireMesh: THREE.Mesh;
    seamMesh: THREE.Mesh;
    dragControls: DragControls;
    viewHandles: boolean;
    viewIndices: boolean;
    gui: GUI;
    enableClick: boolean;
    seam: Array<number>;


    constructor(canvasId: string) {
        this.reader = new FileReader();

        this.canvas = document.querySelector(`#${canvasId}`);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: this.canvas });
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        document.getElementById('container').appendChild(this.labelRenderer.domElement);

        this.camera = new THREE.PerspectiveCamera(75, 2, 0.1, 5);
        this.camera.position.z = 2;

        this.orbitControls = new OrbitControls(this.camera, this.canvas);
        this.orbitControls.target.set(0, 0, 5);
        this.orbitControls.update();
        this.orbitControls.addEventListener('change', () => { this.render(); })

        this.scene = new THREE.Scene();

        this.handles = [];
        this.labels = [];
        this.viewHandles = false;
        this.viewIndices = false;


        this.scene.add(new THREE.GridHelper());
        this.scene.add(new THREE.AxesHelper(5));

        this.objLoader = new OBJLoader();
        this.plyLoader = new PLYLoader();

        this.gui = new GUI();

        this.seam = [0, 10, 110, 120];

        const guiStuff = {
            'Continue Simulation': () => { this?.sim?.updateSim(); },
            'Load Model': () => { document.getElementById("uploadInput").click(); },
            'Width': GRID_X,
            'Height': GRID_Y,
            'Load Plane': () => { this.loadPlane(guiStuff['Width'], guiStuff['Height']); },
            'Betti Numbers': '',
            'Seam': this.seam.toString(),
            'Compute Betti Numbers': () => {
                guiStuff['Betti Numbers'] = compute_betti(this.geometry);
                for (const c of this.gui.controllersRecursive()) {
                    c.updateDisplay();
                }
            },
            'Add Seam': () => { this.#addSeam(); }
        };

        this.gui.add(guiStuff, 'Continue Simulation');
        this.gui.add(this, 'viewHandles').onChange(() => { this.toggleVisibility(this.viewHandles, this.viewIndices); });
        this.gui.add(this, 'viewIndices').onChange(() => { this.toggleVisibility(this.viewHandles, this.viewIndices); });
        this.gui.add(WIRE_MAT, 'wireframe').onChange(() => { this.render(); });
        this.gui.add(SURFACE_MAT, 'opacity', 0, 1).onChange(() => { this.render(); })
        this.gui.add(guiStuff, 'Load Model');
        let folder = this.gui.addFolder('Plane');
        folder.add(guiStuff, 'Width', 1, 40, 1);
        folder.add(guiStuff, 'Height', 1, 40, 1);
        folder.add(guiStuff, 'Load Plane');
        this.gui.add(guiStuff, 'Betti Numbers').disable();
        this.gui.add(guiStuff, 'Compute Betti Numbers');

        folder = this.gui.addFolder('Seams');

        folder.add(guiStuff, 'Seam').disable();
        folder.add(guiStuff, 'Add Seam');

        {

            const skyColor = 0xB1E1FF; // light blue
            const groundColor = 0xB97A20; // brownish orange
            const intensity = 3;
            const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
            this.scene.add(light);

        }

        window.addEventListener('keydown', (e) => { this.enableClick = e.ctrlKey; })
        window.addEventListener('keyup', (e) => { this.enableClick = e.ctrlKey; })

        this.loadPlane();
    }

    #addSeam() {
        if (this.seam.length < 4) {
            alert('Need to select 4 Handles');
            return;
        }
        const { path1, path2, err } = this.sim?.addSeam(this.seam[0], this.seam[1], this.seam[2], this.seam[3]);
        if (err) {
            alert(err);
            return;
        }
        const indices = [...this.seamGeometry?.index.array];
        // console.log(indices);

        for (let i = 1; i < path1.length; i++) {
            const a = path1[i - 1], b = path1[i];
            const x = path2[i - 1], y = path2[i];
            indices.push(a, b, x);
            indices.push(b, x, y);
        }
        this.seamGeometry.setIndex(indices);
        this.seamGeometry.getIndex().needsUpdate = true;


        this.scene.remove(this.seamMesh);
        this.seamMesh = new THREE.Mesh(this.seamGeometry, SEAM_MAT);
        this.scene.add(this.seamMesh);
    }

    toggleVisibility(showHandles = false, showIndices = false, forceUpdate = false) {
        this.viewHandles = showHandles || showIndices;
        this.viewIndices = showIndices;

        if (!this.viewHandles || forceUpdate) {
            for (const elem of this.handles) { this.scene.remove(elem); }
            this.handles = [];
            if (this.dragControls) { this.dragControls.dispose(); }
        }
        if (!this.viewIndices || forceUpdate) {
            for (const elem of this.labels) { this.scene.remove(elem); }
            this.labels = [];
        }
        if (this.viewHandles) {
            const N = this.geometry.getAttribute('position').count;
            const pos = this.geometry.getAttribute('position');
            const handlesAlreadyPresent = this.handles.length > 0;
            const p = new Vector3();
            for (let i = 0; i < N; i++) {
                p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
                if (!handlesAlreadyPresent) {
                    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 5), HANDLE_MAT);
                    sphere.userData.index = i;
                    sphere.position.copy(p);
                    this.scene.add(sphere);
                    this.handles.push(sphere);
                }

                if (this.viewIndices) {
                    const text = document.createElement('div');
                    text.textContent = i.toString();
                    text.style.color = 'rgb(0,0,255)';
                    const label = new CSS2DObject(text);
                    label.position.copy(p);
                    this.labels.push(label);
                    this.scene.add(label);
                }
            }
            if (!handlesAlreadyPresent) {
                this.dragControls = new DragControls(this.handles, this.camera, this.renderer.domElement);
                this.dragControls.addEventListener('drag', (e) => { this.drag(e); })
                this.dragControls.addEventListener('dragstart', (e) => { this.drag(e); this.orbitControls.enabled = false; })
                this.dragControls.addEventListener('dragend', (e) => { this.drag(e); this.orbitControls.enabled = true; })
                this.scaleHandles();
            }
        }
        this.render();
        for (const c of this.gui.controllersRecursive()) {
            c.updateDisplay();
        }
    }

    loadPlane(width: number = GRID_X, height: number = GRID_Y) {
        this.load(new THREE.PlaneGeometry(width, height, width, height), 2);
        for (const elem of this.gui.foldersRecursive()) {
            if (elem.$title.textContent === 'Seams') {
                elem.open();
            }
        }
    }

    joinSeam() { this.sim.updateSim(); }

    load(geometry: THREE.BufferGeometry, thresh: number = Infinity) {
        {
            const center = new THREE.Vector3();
            const matrix = new THREE.Matrix4();

            geometry.computeBoundingBox();
            geometry.boundingBox.getCenter(center);
            center.multiplyScalar(-1);
            matrix.makeTranslation(center);
            geometry.applyMatrix4(matrix);

            geometry.boundingBox.getSize(center);
            const scale = GRID_SIZE / Math.max(center.x, center.y, center.z);


            matrix.makeScale(scale, scale, scale);
            geometry.applyMatrix4(matrix);

            thresh *= scale * scale;
        }
        this.geometry?.dispose();
        this.geometry = geometry;
        this.geometry.computeVertexNormals();
        this.scene.remove(this.surfaceMesh);
        this.scene.remove(this.wireMesh);
        this.scene.remove(this.seamMesh);
        this.surfaceMesh = new THREE.Mesh(this.geometry, SURFACE_MAT);
        this.wireMesh = new THREE.Mesh(this.geometry, WIRE_MAT);
        this.seamMesh = new THREE.Mesh(this.seamGeometry, SEAM_MAT);

        this.scene.add(this.surfaceMesh);
        this.scene.add(this.wireMesh);
        this.scene.add(this.seamMesh);

        this.lookAtMesh();

        this.sim?.dispose();
        this.sim = new Simulation(geometry, (e) => { this.update_pos_batch(e); this.render(); }, thresh);

        this.seamGeometry?.dispose();
        this.seamGeometry = new THREE.BufferGeometry();
        this.seamGeometry.setAttribute('position', geometry.getAttribute('position'));
        this.seamGeometry.setIndex([]);

        this.resized();
        this.render();

        this.toggleVisibility(this.viewHandles, this.viewIndices, true);
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
        return geo;
    }


    loadUrl(url, path: string) {
        const needToExtractGeometry = path.endsWith('.obj');
        const handler = (r, e) => {
            if (e) {
                alert(`Error while loading ${path || url} file: ${e}`);
            }
            if (needToExtractGeometry) {
                r = Viewer.extractGeometry(r);
            }
            this.load(r);
            for (const elem of this.gui.foldersRecursive()) {
                if (elem.$title.textContent === 'Seams') {
                    elem.close();
                }
            }
        }
        if (path.endsWith('.obj')) {
            this.objLoader.load(url, (e) => handler(e, null), null, (e) => handler(null, e));
        } else if (path.endsWith('.ply')) {
            this.plyLoader.load(url, (e) => handler(e, null), null, (e) => handler(null, e));
        } else {
            alert('Cannot load file ' + path || url);
        }
    }


    loadFile(file: File) {
        if (!this.reader.onload) {
            this.reader.onload = (e) => { this.loadUrl(e.target.result, file.name); };
        }
        this.reader.readAsDataURL(file);
    }

    lookAtMesh() {
        const bbox = new THREE.Box3().setFromObject(this.surfaceMesh);

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

        this.orbitControls.maxDistance = boxSize * 10;
        this.orbitControls.target.copy(boxCenter);
    }

    resized() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;



        this.renderer.setSize(width, height, false);
        this.labelRenderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();


        const rect = this.renderer.domElement.getBoundingClientRect();
        this.labelRenderer.domElement.style.top = `${rect.top}px`;
        this.labelRenderer.domElement.style.left = `${rect.left}px`;

        this.render();
    }

    drag(event) {
        if (this.enableClick) {
            if (event.type === 'dragend') {
                this.seam.push(event.object.userData.index);
                if (this.seam.length > 4) { this.seam.shift(); }
                for (const elem of this.gui.controllersRecursive()) {
                    if (elem.property == 'Seam') {
                        elem.setValue(this.seam.toString());
                    }
                }
            }
            return;
        }
        const idx = event.object.userData.index as number;
        this.update_pos(idx, event.object.position);
        if (this.labels.length > idx) {
            this.labels[idx].position.copy(event.object.position);
        }
        this.render();
        if (event.type == 'dragend') { this?.sim?.updateSim(); }
        if (event.type == 'dragstart') { this.sim?.stop(); }
    }

    update_pos(idx: number, p: THREE.Vector3) {
        const pos = this.geometry.getAttribute('position');
        pos.setXYZ(idx, p.x, p.y, p.z);
        pos.needsUpdate = true;
        this.sim?.update_pos(idx, p);
    }

    scaleHandles() {
        let avgFaceArea = 0;
        const pos = this.geometry.getAttribute('position');
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const indices = this.geometry.index.array;
        let faces = 0;
        for (let i = 0; i < indices.length; i += 3) {
            a.set(pos.getX(indices[i]), pos.getY(indices[i]), pos.getZ(indices[i]));
            b.set(pos.getX(indices[i + 1]), pos.getY(indices[i + 1]), pos.getZ(indices[i + 1]));
            c.set(pos.getX(indices[i + 2]), pos.getY(indices[i + 2]), pos.getZ(indices[i + 2]));
            b.sub(a);
            c.sub(a);
            c.cross(b);
            faces++;
            avgFaceArea += c.length();
        }
        avgFaceArea /= faces;
        avgFaceArea = Math.sqrt(avgFaceArea / 3) / 5;
        const scale = avgFaceArea;
        const mat = new THREE.Matrix4();
        mat.makeScale(scale, scale, scale);
        for (let index = 0; index < this.handles.length; index++) {
            this.handles[index].applyMatrix4(mat);
            this.handles[index].position.set(pos.getX(index), pos.getY(index), pos.getZ(index));
        }
    }


    update_pos_batch(positions: Array<{ x: number, y: number, z: number }>) {
        const pos = this.geometry.getAttribute('position');
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            pos.setXYZ(i, p.x, p.y, p.z);
            if (this.handles.length > i) {
                this.handles[i].position.set(p.x, p.y, p.z);
            }
            if (this.labels.length > i) {
                this.labels[i].position.set(p.x, p.y, p.z);
            }

        }

        pos.needsUpdate = true;
        this.geometry.computeBoundingBox();
        this.lookAtMesh();
    }


    render() {
        this.wireMesh.visible = WIRE_MAT.wireframe;
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

};

export default Viewer;
