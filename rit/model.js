import { binnenkant } from './auto.js';

// Mooiere auto: het model van een Ferrari 458 Italia uit de voorbeelden van three.js (van vicent091036 op
// Sketchfab), pas geladen als je instapt. Tot hij binnen is, en als het niet lukt, blijft de eigen sportwagen.
const NPM = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/', MODEL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/ferrari.glb';
export const BRON = 'Auto: Ferrari 458 Italia, model van vicent091036';

const script = src => new Promise((klaar, fout) => document.head.append(Object.assign(document.createElement('script'), { src, onload: klaar, onerror: fout })));
let bezig = null;
export function laadModel() {
    return bezig ||= (async () => {
        if (!THREE.GLTFLoader) await script(NPM + 'loaders/GLTFLoader.js');
        if (!THREE.DRACOLoader) await script(NPM + 'loaders/DRACOLoader.js');
        const draco = new THREE.DRACOLoader(), laden = new THREE.GLTFLoader();
        draco.setDecoderPath(NPM + 'libs/draco/gltf/');
        laden.setDRACOLoader(draco);
        const gltf = await new Promise((klaar, fout) => laden.load(MODEL, klaar, undefined, fout));
        return zetIn(gltf.scene.children[0]);
    })().catch(() => null);
}

// In de sportwagen zetten: de eigen vormen verbergen (het klikvlak blijft), het model even groot maken als de eigen
// wagen, met de voorkant naar +x en de wielen op de grond. Het model heeft een eigen interieur met een stuur.
function zetIn(model) {
    const lak = new THREE.MeshPhongMaterial({ color: '#c8101a', shininess: 110, specular: 0x999999 });
    const metaal = new THREE.MeshPhongMaterial({ color: '#c9ced6', shininess: 80, specular: 0xcccccc });
    const glas = new THREE.MeshPhongMaterial({ color: '#141a22', shininess: 120, specular: 0xaaaaaa, transparent: true, opacity: 0.75 });
    const zet = (naam, materiaal) => { const d = model.getObjectByName(naam); if (d) d.material = materiaal; };
    zet('body', lak);
    for (const naam of ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim']) zet(naam, metaal);
    zet('glass', glas);
    model.rotation.y = -Math.PI / 2; // de neus van het model wijst naar −z
    const doos = new THREE.Box3().setFromObject(model);
    const schaal = 4.3 / Math.max(doos.max.x - doos.min.x, doos.max.z - doos.min.z) / VOERTUIGSCHAAL;
    model.scale.setScalar(schaal);
    const hoek = new THREE.Box3().setFromObject(model);
    model.position.y = -hoek.min.y;
    model.position.x = -(hoek.min.x + hoek.max.x) / 2;
    model.traverse(m => {
        if (!m.isMesh) return;
        m.castShadow = true;
        m.userData.id = 'sportwagen';
    });
    const wielen = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map(n => model.getObjectByName(n)).filter(Boolean);
    wielen.forEach(w => { w.rotation.order = 'YXZ'; }); // eerst sturen, dan rollen
    for (const kind of sportwagen.children) if (kind.isMesh && kind.material.visible !== false) kind.visible = false; // de eigen vormen
    binnenkant.children.forEach(d => { d.visible = false; }); // de eigen binnenkant (zie rit.js) niet meer
    const stuur = model.getObjectByName('steering_wheel');
    if (stuur) sportwagen.userData.stuur = { deel: stuur, basis: stuur.quaternion.clone() };
    sportwagen.add(model);
    sportwagen.userData.voorwielen = wielen.slice(0, 2);
    sportwagen.userData.wielen = wielen;
    return model;
}
