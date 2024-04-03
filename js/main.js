import WebGL from 'three/addons/capabilities/WebGL.js';
import Viewer from './viewer.js';

if (!WebGL.isWebGLAvailable()) {
    // Initiate function or other initializations here 
    const warning = WebGL.getWebGLErrorMessage();
    alert(warning.textContent);
}

const viewer = new Viewer('c');

window.onresize = () => {
    viewer.resized();
};

const uploadInput = document.getElementById("uploadInput");
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

document.getElementById('loadPlane').onclick = () => { viewer.loadPlane(); }
document.getElementById('magnetize').onclick = () => { viewer.joinSeam(true); }
document.getElementById('volume').onchange = () => { viewer.joinSeam(false); }
