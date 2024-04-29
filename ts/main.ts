import WebGL from 'three/addons/capabilities/WebGL.js';
import Viewer from './viewer';
import UnionFind from './unionfind'

if (!WebGL.isWebGLAvailable()) {
    // Initiate function or other initializations here 
    const warning = WebGL.getWebGLErrorMessage();
    alert(warning.textContent);
}


const viewer = new Viewer('c');

window.onresize = () => { viewer.resized(); };

const uploadInput = document.getElementById("uploadInput") as HTMLInputElement;
uploadInput.addEventListener(
    "change",
    () => {
        if (uploadInput.files.length == 0) {
            return;
        }
        const file = uploadInput.files[0];
        viewer.loadFile(file);
    },
    false,
);
