// ---------------------------------------------------------------------------
// Gedeelde cijfers en helpers (ook gebruikt door grafieken.js en spel.js)
// ---------------------------------------------------------------------------

const IDS = Object.keys(STROMEN);
const VOERTUIGTYPES = Object.keys(METING.voertuigen);
const VOERTUIG_AANTAL = Object.values(METING.voertuigen);
const VOERTUIGKLEUREN = ['var(--v1)', 'var(--v2)', 'var(--v3)', 'var(--v4)']; // per thema in style.css

const som = (lijst, f) => lijst.reduce((t, x) => t + f(x), 0);
const bezet = s => s.bezoeken * s.verblijf; // totale tijd dat er een voertuig bij de container stond
const TOTAAL_STOPS = som(IDS, id => STROMEN[id].bezoeken);
const GEM_STOP = som(IDS, id => bezet(STROMEN[id])) / TOTAAL_STOPS;
const OPENINGSTIJD = METING.openingsuren * 3600; // seconden
const ACTIEF = IDS.filter(id => STROMEN[id].bezoeken).sort((a, b) => STROMEN[b].bezoeken - STROMEN[a].bezoeken); // drukste eerst
const STOPS_PER_TYPE = VOERTUIGTYPES.map((_, i) => som(IDS, id => STROMEN[id].voertuigen[i]));

const tijd = sec => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// Onder het uur zonder uren: 38:47, daarboven 1:55:09.
const uren = sec => { const s = Math.round(sec); return s < 3600 ? tijd(s) : `${Math.floor(s / 3600)}:${tijd(s % 3600).padStart(5, '0')}`; };
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
const getal = (x, d) => x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
// Bezetting als deel van een openingsdag (staan er twee tegelijk, dan telt dat dubbel: bij benadering).
const bezetPct = s => pct(bezet(s), OPENINGSTIJD);
// Toetsenbord: een groep knoppen is één Tab-stop. Binnen de groep gaan de pijltjes naar de vorige of
// volgende (na de laatste weer de eerste), Home en End naar de eerste en laatste; Enter of spatie kiest.
const naastInLijst = (lijst, i, dx, dy) => lijst[(i + dx + dy + lijst.length) % lijst.length];
function pijlGroep(groep, selector = 'button', naast = naastInLijst) {
    const knoppen = () => [...groep.querySelectorAll(selector)].filter(k => !k.disabled);
    const zet = huidig => knoppen().forEach(k => { k.tabIndex = k === huidig ? 0 : -1; });
    const standaard = () => knoppen().find(k => k.matches('[aria-pressed="true"], [aria-selected="true"], .actief')) || knoppen()[0];
    // Opnieuw opgebouwd of een knop uitgeschakeld: er blijft precies één Tab-stop over.
    new MutationObserver(() => {
        const lijst = knoppen();
        zet(lijst.includes(document.activeElement) ? document.activeElement : lijst.find(k => k.tabIndex === 0) || standaard());
    }).observe(groep, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    zet(standaard());
    groep.addEventListener('focusin', e => { if (knoppen().includes(e.target)) zet(e.target); });
    groep.addEventListener('keydown', e => {
        const lijst = knoppen(), i = lijst.indexOf(e.target);
        const pijl = { ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1] }[e.key];
        if (i < 0 || !(pijl || e.key === 'Home' || e.key === 'End')) return;
        e.preventDefault();
        (e.key === 'Home' ? lijst[0] : e.key === 'End' ? lijst[lijst.length - 1] : naast(lijst, i, ...pijl)).focus();
    });
}

const kpiHtml = lijst => lijst.map(([waarde, label]) => `<div class="kpi"><b>${waarde}</b><span>${label}</span></div>`).join('');

// Eén rij van een balkjesgrafiek; `tick` (in %) is het streepje voor het gemiddelde.
const balkRij = (label, breedte, waarde, { tick, kleur } = {}) => `
    <div class="bar-row">
        <span>${label}</span>
        <div class="bar"><i style="width:${breedte}%${kleur ? `;background:${kleur}` : ''}"></i>
            ${tick === undefined ? '' : `<em style="left:${tick}%"></em>`}</div>
        <b>${waarde}</b>
    </div>`;

const METRICS = {
    bezoeken: {
        label: 'Drukte', eenheid: 'bezoeken',
        uitleg: 'Aantal bezoeken per container.',
        waarde: s => s.bezoeken, fmt: v => v
    },
    verblijf: {
        label: 'Verblijfstijd', eenheid: 'min',
        uitleg: 'Gemiddelde tijd dat een bezoeker bij de container staat.',
        waarde: s => s.verblijf, fmt: v => v ? tijd(v) : '–'
    },
    bezetting: {
        label: 'Bezetting', eenheid: '',
        uitleg: `Totale tijd dat er een voertuig bij de container stond, op een openingsdag van ${getal(METING.openingsuren, 1)} uur.`,
        waarde: bezet, fmt: uren
    }
};

const state = { metric: 'bezoeken', selectie: null, hover: null };

const gesorteerd = key => [...IDS].sort((a, b) => METRICS[key].waarde(STROMEN[b]) - METRICS[key].waarde(STROMEN[a]));

// Sequentiële blauwe schaal: weinig = licht, veel = donkerblauw. In het donkere thema
// begint hij bij grijs (licht zou daar juist opvallen); vol blijft donkerblauw.
const RAMPEN = {
    light: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5',
        '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
    dark: ['#5a6370', '#5f6f82', '#657d95', '#6b8baa', '#739bc2', '#7aa9d8', '#6699dc',
        '#4f88d8', '#3b78d0', '#2d69c2', '#235cb2', '#1b52a3', '#164893']
};
let rampHex, ramp; // zie zetThema
const ONBEKEND = new THREE.Color();
const VERVAAGD = new THREE.Color();
let donker = false;

function rampKleur(t) {
    const x = THREE.MathUtils.clamp(t, 0, 1) * (ramp.length - 1);
    const i = Math.min(Math.floor(x), ramp.length - 2);
    return ramp[i].clone().lerp(ramp[i + 1], x - i);
}

// ---------------------------------------------------------------------------
// 3D-scène
// ---------------------------------------------------------------------------

const mapEl = document.getElementById('map');
const labelsEl = document.getElementById('labels');

const renderer = new THREE.WebGLRenderer({ antialias: true });
// Zonder bruikbare videokaart tekent de browser 3D met de processor (SwiftShader en dergelijke). Dan eenvoudiger:
// geen schaduwen, geen extra scherpte, en de simulatie loopt niet vanzelf (sim.js).
const glInfo = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
const zonderVideokaart = /swiftshader|llvmpipe|software|basic render/i.test(glInfo ? renderer.getContext().getParameter(glInfo.UNMASKED_RENDERER_WEBGL) : '');
renderer.setPixelRatio(zonderVideokaart ? 1 : Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = !zonderVideokaart;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mapEl.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0, 140, 320);

const camera = new THREE.PerspectiveCamera(35, 1, 1, 1000);
const controls = new THREE.MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.screenSpacePanning = false;
controls.keyPanSpeed = 30;

// De kaart zelf met het toetsenbord: pijltjes schuiven, + en − zoomen (controls.update houdt de afstand binnen de grenzen).
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Kaart: pijltjes schuiven, plus en min zoomen');
controls.listenToKeyEvents(renderer.domElement);
renderer.domElement.addEventListener('keydown', e => {
    const factor = { '+': 0.8, '=': 0.8, '-': 1.25 }[e.key];
    if (factor) {
        camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
        teken();
    }
});

// Alleen een beeld maken als er iets verandert (camera, kleuren, labels, formaat, rijdende voertuigen).
// Verandert er niets, dan vraagt de kaart ook geen beelden aan: stilstaand of op de analyse kost hij niets.
let opnieuw = true, gevraagd = false;
const wakker = () => { if (!gevraagd) { gevraagd = true; requestAnimationFrame(beeld); } }; // wel een volgend beeld, nog niet per se tekenen
const teken = () => { opnieuw = true; wakker(); };
controls.addEventListener('change', teken); // ook tijdens het uitdempen na slepen

scene.add(new THREE.HemisphereLight(0xffffff, 0xd6d4cc, 0.78));
const zon = new THREE.DirectionalLight(0xffffff, 0.3);
zon.position.set(-40, 70, -15);
zon.castShadow = true;
zon.shadow.mapSize.set(2048, 2048);
Object.assign(zon.shadow.camera, { left: -60, right: 60, top: 50, bottom: -50, near: 1, far: 200 });
zon.shadow.camera.updateProjectionMatrix();
zon.shadow.bias = -0.0005;
scene.add(zon);

const mat = (kleur = '#fff') => new THREE.MeshLambertMaterial({ color: kleur }); // zonder kleur: wordt later per thema gezet

// Ondergrond per thema; de containers volgen de blauwe schaal.
const SCENEKLEUREN = {
    light: { lucht: '#e9ede5', gras: '#d3dfc9', verhard: '#f4f3ef', rijbaan: '#e3e2dc', pijl: '#a9a79e', gebouw: '#ffffff', onbekend: '#dcdbd5', vervaagd: '#ecebe6', akker: '#cdbb8e', weide: '#b5d197' },
    dark: { lucht: '#101b24', gras: '#1a2a24', verhard: '#1f2731', rijbaan: '#29333f', pijl: '#55667a', gebouw: '#3b4a5c', onbekend: '#343a41', vervaagd: '#1d242c', akker: '#3a3427', weide: '#20352a' }
};
// Akkers: voren van 4 m (een streepjestextuur over de kleur van het thema), bij een weide dwars.
function voren(draai) {
    const doek = document.createElement('canvas'), g = doek.getContext('2d');
    doek.width = doek.height = 64;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(60,50,30,0.16)';
    g.fillRect(0, 0, 64, 26);
    const t = new THREE.CanvasTexture(doek);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.25, 0.25);
    t.rotation = draai;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy(); // scherp, ook schuin van ver
    return t;
}
const MAT = { gras: mat(), verhard: mat(), rijbaan: mat(), pijl: mat(), gebouw: mat(),
    akker: new THREE.MeshLambertMaterial({ map: voren(0) }), weide: new THREE.MeshLambertMaterial({ map: voren(Math.PI / 2) }) };

// Plat vlak op de grond, gedraaid met `hoek` (radialen, tegen de klok in van bovenaf).
function plat(geo, materiaal, x, z, y, hoek = 0) {
    const m = new THREE.Mesh(geo, materiaal);
    m.rotation.set(-Math.PI / 2, 0, hoek);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
}

function vorm(punten) {
    return new THREE.ShapeGeometry(new THREE.Shape(punten.map(([x, z]) => new THREE.Vector2(x, -z))));
}

// Ondergrond: groen, verhard terrein, toegangsweg.
const [tx1, tz1, tx2, tz2] = PLATTEGROND.terrein;
plat(new THREE.PlaneGeometry(2000, 2000), MAT.gras, 0, 0, 0);
plat(vorm([[tx1, tz1], [tx2, tz1], [tx2, tz2], [tx1, tz2]]), MAT.verhard, 0, 0, 0.01);
plat(vorm(PLATTEGROND.toegangsweg), MAT.verhard, 0, 0, 0.01);
// Akkers en weiden rondom (x1, z1, x2, z2, soort), net buiten de bomen en de straat (omgeving.js).
const AKKERS = [[-290, -110, -190, 20, 'akker'], [-180, -110, -85, 20, 'weide'], [-290, 30, -190, 170, 'weide'], [-180, 30, -85, 170, 'akker'],
    [80, -110, 200, 20, 'weide'], [210, -110, 350, 20, 'akker'], [80, 30, 200, 170, 'akker'], [210, 30, 350, 170, 'weide']];
for (const [x1, z1, x2, z2, soort] of AKKERS) plat(vorm([[x1, z1], [x2, z1], [x2, z2], [x1, z2]]), MAT[soort], 0, 0, 0.03);

// Rijroute met pijlen.
const RIJBAAN = 4.5;
const pijlGeo = vorm([[1, 0], [-0.7, -0.9], [-0.25, 0], [-0.7, 0.9]]);

function tekenRoute(punten) {
    let volgende = 4, afgelegd = 0;
    for (let i = 0; i < punten.length - 1; i++) {
        const [x1, z1] = punten[i], [x2, z2] = punten[i + 1];
        const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), hoek = -Math.atan2(dz, dx);
        plat(new THREE.PlaneGeometry(len, RIJBAAN), MAT.rijbaan, (x1 + x2) / 2, (z1 + z2) / 2, 0.02, hoek);
        plat(new THREE.CircleGeometry(RIJBAAN / 2, 20), MAT.rijbaan, x2, z2, 0.02);
        for (; volgende <= afgelegd + len; volgende += 8) {
            const t = (volgende - afgelegd) / len;
            plat(pijlGeo, MAT.pijl, x1 + dx * t, z1 + dz * t, 0.03, hoek);
        }
        afgelegd += len;
    }
}
tekenRoute(PLATTEGROND.route);
tekenRoute(PLATTEGROND.binnendoor);

// Kantoorgebouw.
const [gx, gz, gb, gd] = PLATTEGROND.gebouw;
const gebouw = new THREE.Mesh(new THREE.BoxGeometry(gb, 3, gd), MAT.gebouw);
gebouw.position.set(gx, 1.5, gz);
gebouw.castShadow = gebouw.receiveShadow = true;
scene.add(gebouw);

// Containers.
const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const alleBoxen = [];
const klikbaar = [];
const boxenPerStroom = {};

for (const [id, x, z, lengte, breedte, hoek, hoogte = 2.2] of PLATTEGROND.containers) {
    const box = new THREE.Mesh(boxGeo, mat()); // eigen materiaal: de kleur per container volgt in update
    box.scale.set(lengte, hoogte, breedte);
    box.position.set(x, 0, z);
    box.rotation.y = -hoek * Math.PI / 180;
    box.castShadow = box.receiveShadow = true;
    box.userData.id = id;
    scene.add(box);
    alleBoxen.push(box);
    if (id) {
        klikbaar.push(box);
        (boxenPerStroom[id] = boxenPerStroom[id] || []).push(box);
    }
}

// Slagboom.
const [sx, sz] = PLATTEGROND.slagboom;
const slagboom = new THREE.Group();
const paal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat('#3a3a38'));
paal.position.y = 0.6;
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 5), mat('#d03b3b'));
arm.position.set(0, 0, 2.6);
const scharnier = new THREE.Group(); // sim.js tilt de arm op als er een voertuig door mag
scharnier.position.y = 1.05;
scharnier.add(arm);
slagboom.add(paal, scharnier);
slagboom.position.set(sx, 0, sz);
slagboom.traverse(m => { m.castShadow = true; m.userData.id = 'slagboom'; });
scene.add(slagboom);
klikbaar.push(paal, arm);

// Voertuig in de kleur van zijn type uit de analyse. Voorkant = +x. Een aanhanger zit in een eigen
// groep die op de trekhaak draait (userData.aanhanger; sim.js laat hem zo apart de bocht om gaan).
const LAK = VOERTUIGTYPES.map(() => mat()); // kleur per thema, zie zetThema
const VOERTUIGSCHAAL = 0.95; // ook voor de Rd4-wagen (spel.js); zo passen er twee naast elkaar op de rijbaan
function maakVoertuig(type) {
    const groep = new THREE.Group(), naam = VOERTUIGTYPES[type], busje = naam.startsWith('Busje');
    const glas = mat('#1d3557'), rubber = mat('#1b1d21'), grijs = mat('#8e99a6');
    let deel = groep; // waar de blokken en wielen bij komen
    const blok = (l, h, b, materiaal, px, py) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, b), materiaal);
        m.position.set(px, py, 0);
        deel.add(m);
    };
    const wielen = (r, zb, ...xs) => {
        for (const wx of xs) for (const wz of [-zb, zb]) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 14), rubber);
            m.position.set(wx, r, wz);
            m.rotation.x = Math.PI / 2;
            deel.add(m);
        }
    };
    if (busje) {
        blok(4.3, 1.9, 2, LAK[type], -0.55, 1.3);   // laadruimte en cabine
        blok(1.1, 0.9, 2, LAK[type], 2.15, 0.8);    // neus
        blok(0.06, 0.8, 1.8, glas, 1.63, 1.75);     // voorruit
        blok(0.9, 0.6, 2.04, glas, 1.05, 1.8);      // zijramen
        wielen(0.4, 0.92, 1.85, -1.75);
    } else {
        blok(4.4, 0.65, 1.8, LAK[type], 0, 0.62);   // carrosserie
        blok(2.2, 0.55, 1.6, glas, -0.3, 1.22);     // ramen
        blok(2, 0.1, 1.7, LAK[type], -0.35, 1.52);  // dak
        wielen(0.34, 0.82, 1.4, -1.4);
    }
    if (naam.includes('aanhanger')) {
        deel = groep.userData.aanhanger = new THREE.Group();
        deel.position.x = busje ? -2.7 : -2.2; // trekhaak
        deel.userData.as = 2.4;                // van trekhaak tot as van de aanhanger
        groep.add(deel);
        blok(1.1, 0.08, 0.12, grijs, -0.55, 0.5);  // dissel
        blok(2.6, 0.5, 1.8, grijs, -2.4, 0.75);    // bak
        wielen(0.3, 0.95, -2.4);
    }
    groep.scale.setScalar(VOERTUIGSCHAAL);
    groep.traverse(m => { m.castShadow = true; m.userData.id = naam; });
    scene.add(groep);
    return groep;
}

// Voor de ingang geparkeerd: van elk voertuigtype één, schuin met de neus naar de weg.
// Klik = waar dat type heen ging. De rijdende voertuigen staan in sim.js.
function parkeer(type, x, z, hoek) {
    const groep = maakVoertuig(type);
    groep.position.set(x, 0, z);
    groep.rotation.y = hoek;
    groep.traverse(m => { if (m.isMesh) klikbaar.push(m); });
}
// Busjes boven de uitrit, auto's onder de inrit; zonder aanhanger het dichtst bij het park.
parkeer(3, -43.8, 3.1, -Math.PI / 4);
parkeer(2, -38.6, 2.6, -Math.PI / 4);
parkeer(1, -43.3, 21.3, Math.PI / 4);
parkeer(0, -37.4, 21.0, Math.PI / 4);

// ---------------------------------------------------------------------------
// Labels (HTML boven de containers)
// ---------------------------------------------------------------------------

const labels = [];

// `los`: alleen zichtbaar bij aanwijzen, toetsenbordfocus of selectie (voertuigen en de Rd4-wagen).
function maakLabel(id, pos, los = false) {
    const el = document.createElement('button');
    el.className = los ? 'label los' : 'label';
    el.addEventListener('click', () => activeer(id)); // toetsenbord; muis en touch gaan via raak()
    labelsEl.append(el);
    labels.push({ id, el, pos, los });
}
const labelBoven = object => object.position.clone().setY(new THREE.Box3().setFromObject(object).max.y + 0.4);

maakLabel('slagboom', new THREE.Vector3(sx, 1.8, sz)); // eerst: met Tab begin je bij de ingang
for (const [id, boxen] of Object.entries(boxenPerStroom)) {
    const pos = new THREE.Vector3();
    boxen.forEach(b => pos.add(b.position));
    pos.divideScalar(boxen.length);
    pos.y = Math.max(...boxen.map(b => b.scale.y)) + 0.4;
    maakLabel(id, pos);
}
for (const naam of VOERTUIGTYPES) maakLabel(naam, labelBoven(klikbaar.find(m => m.userData.id === naam).parent), true);

// Pijltjes op de kaart: naar het dichtstbijzijnde label in die richting; is er niets meer, dan rond naar de overkant.
function naastOpKaart(lijst, i, dx, dy) {
    const midden = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const [x0, y0] = midden(lijst[i]);
    let beste, laagste = Infinity;
    for (const el of lijst) {
        if (el === lijst[i]) continue;
        const [x, y] = midden(el);
        const vooruit = (x - x0) * dx + (y - y0) * dy, opzij = Math.abs((x - x0) * dy - (y - y0) * dx);
        const dieKant = vooruit > 0 && opzij < vooruit * 1.5; // binnen zo'n 55° van de pijlrichting
        const score = (dieKant ? vooruit : 1e6 + vooruit) + 2 * opzij;
        if (score < laagste) { laagste = score; beste = el; }
    }
    return beste;
}
pijlGroep(labelsEl, '.label', naastOpKaart);

// Labels staan op volgorde van belangrijkheid (zie update). Elk label neemt de eerste
// vrije plek rond zijn container; staat het er niet recht boven, dan wijst een lijntje
// naar de container. Is er nergens plek, dan de plek met de minste overlap.
const PLEKKEN = [[0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [0, -2], [0, 2], [2, 0], [-2, 0]];
const leaderPad = document.querySelector('#leaders path');
const knoppenOpKaart = document.querySelectorAll('.map-tools, #sim, #volscherm');
const projectie = new THREE.Vector3();

function plaatsLabels() {
    if (labelsEl.hidden) return;
    const m = mapEl.getBoundingClientRect(), w = m.width, h = m.height;
    const bezette = [...knoppenOpKaart].map(el => { // knoppen niet bedekken
        const k = el.getBoundingClientRect();
        return [k.left - m.left, k.top - m.top, k.right - m.left, k.bottom - m.top];
    });
    const overlap = r => {
        let o = r[0] < 0 || r[1] < 0 || r[2] > w || r[3] > h ? 1e6 : 0;
        for (const b of bezette) {
            o += Math.max(0, Math.min(r[2], b[2]) - Math.max(r[0], b[0])) * Math.max(0, Math.min(r[3], b[3]) - Math.max(r[1], b[1]));
        }
        return o;
    };
    let lijnen = '';
    for (const l of labels) {
        projectie.copy(l.pos).project(camera);
        const ax = (projectie.x + 1) / 2 * w, ay = (1 - projectie.y) / 2 * h;
        if (l.los && !l.el.matches('.actief, .hover, :focus-visible')) { // onzichtbaar: neemt geen plek in, vangt geen klik
            l.rect = null;
            l.el.style.transform = `translate(${ax}px, ${ay}px) translate(-50%, -50%)`;
            continue;
        }
        const hw = l.w / 2 + 2, hh = l.h / 2 + 2;
        let beste, minst = Infinity;
        for (const i of [0, l.plek || 0, ...PLEKKEN.keys()]) { // eerst recht erboven, dan de vorige plek (tegen verspringen)
            const cx = ax + PLEKKEN[i][0] * (hw + 6), cy = ay + PLEKKEN[i][1] * (hh + 4);
            const r = [cx - hw, cy - hh, cx + hw, cy + hh], o = overlap(r);
            if (o < minst) { minst = o; beste = { i, cx, cy, r }; }
            if (!o) break;
        }
        l.plek = beste.i;
        l.rect = beste.r;
        bezette.push(beste.r);
        l.el.style.transform = `translate(${beste.cx}px, ${beste.cy}px) translate(-50%, -50%)`;
        if (beste.i) {
            const [x1, y1, x2, y2] = beste.r;
            lijnen += `M${ax},${ay}L${THREE.MathUtils.clamp(ax, x1 + 4, x2 - 4)},${THREE.MathUtils.clamp(ay, y1 + 2, y2 - 2)}`;
        }
    }
    leaderPad.setAttribute('d', lijnen);
}

// ---------------------------------------------------------------------------
// Interactie
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const muis = new THREE.Vector2();

// Welk label of welke container zit onder de muis/vinger? Labels eerst, die liggen bovenop.
// (Labels vangen zelf geen aanrakingen af: landt een tweede vinger op een label, dan
// mist de kaart die vinger en springt hij naar het midden tussen beide vingers.)
function raak(e) {
    if (tikBijSportwagen(e)) return 'sportwagen'; // sim.js
    const r = renderer.domElement.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const label = !labelsEl.hidden && labels.find(l => l.rect && x > l.rect[0] && x < l.rect[2] && y > l.rect[1] && y < l.rect[3]);
    if (label) return label.id;
    muis.set(x / r.width * 2 - 1, -y / r.height * 2 + 1);
    raycaster.setFromCamera(muis, camera);
    const hit = raycaster.intersectObjects(klikbaar).find(h => h.object.parent.visible); // wat weg is telt niet
    return hit ? hit.object.userData.id : null;
}

// Klik = loslaten zonder te slepen.
let neer = null;
renderer.domElement.addEventListener('pointerdown', e => { neer = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
    if (neer && Math.hypot(e.clientX - neer[0], e.clientY - neer[1]) < 5) activeer(raak(e));
    neer = null;
});
renderer.domElement.addEventListener('pointermove', e => { if (!e.buttons) zetHover(raak(e)); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !spelEl.open) selecteer(null); });

// Toetsenbord (Tab door de labels): oplichten zoals bij aanwijzen; valt het buiten beeld, dan schuift de kaart erheen.
labelsEl.addEventListener('focusin', e => {
    const l = labels.find(l => l.el === e.target);
    zetHover(l.id);
    projectie.copy(l.pos).project(camera);
    if (Math.max(Math.abs(projectie.x), Math.abs(projectie.y)) < 0.9) return;
    const d = l.pos.clone().sub(controls.target).setY(0);
    controls.target.add(d);
    camera.position.add(d);
});
labelsEl.addEventListener('focusout', () => zetHover(null));

function activeer(id) {
    if (id === 'truck') spelOpen(); // spel.js
    else if (id === 'sportwagen') stuur(); // sim.js
    else selecteer(id);
}

function zetHover(id) {
    if (state.hover === id) return;
    state.hover = id;
    hoverSinds = performance.now();
    renderer.domElement.style.cursor = id ? 'pointer' : '';
    update();
}

// Het aangewezen ding knippert langzaam: containers golven tussen licht- en donkerblauw,
// voertuigen, wagen en slagboom lichten op en uit. Eén golf duurt twee seconden.
const PULS_LICHT = new THREE.Color('#b7d3f6'), PULS_DONKER = new THREE.Color('#0d366b');
let hoverSinds = 0;
function knipper(nu) {
    if (!state.hover) return;
    const t = (1 - Math.cos((nu - hoverSinds) / 1000 * Math.PI)) / 2; // 0 → 1 → 0, zacht in en uit
    const boxen = boxenPerStroom[state.hover];
    if (boxen) boxen.forEach(b => b.material.color.copy(PULS_LICHT).lerp(PULS_DONKER, t));
    else klikbaar.forEach(o => { if (o.userData.id === state.hover) o.material.emissive.setScalar(0.3 * (1 - t)); });
    teken();
}

function selecteer(id) {
    state.selectie = id;
    update();
    zetHash();
}

// Camerastandpunt dat het hele terrein in beeld brengt: schuin (3D) of recht van boven.
// Boven kan niet kantelen en gebruikt een smalle lens van ver weg, zodat het een vlakke
// kaart blijft bij zoomen. Zoomen gaat van 10% tot 150% van dit standpunt.
let view = 'schuin';
function zetView(naam) {
    view = naam;
    const boven = naam === 'boven';
    const kanteling = boven ? 0.001 : 0.75;
    camera.fov = boven ? 12 : 35;
    const tan = Math.tan(camera.fov * Math.PI / 360);
    const afstand = Math.max((tz2 - tz1) / 2 / tan, (tx2 - tx1) / 2 / (tan * camera.aspect)) * 1.1;
    // Near/far meeschalen met de afstand, anders flikkeren de platte lagen (gras/verharding) van ver weg.
    camera.near = boven ? afstand * 0.05 : 1;
    camera.far = afstand * 4;
    camera.updateProjectionMatrix();
    controls.maxPolarAngle = boven ? 0 : 1.2;
    controls.minDistance = afstand * 0.1;
    controls.maxDistance = afstand * 1.5;
    // 3D: knijpen zoomt en draait/kantelt. Boven: knijpen zoomt en schuift, draaien gaat met de vingers draaien (zie onder).
    controls.touches.TWO = boven ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE;
    scene.fog.near = afstand * 1.2;
    scene.fog.far = afstand * 2.8;
    camera.position.set(0, afstand * Math.cos(kanteling), afstand * Math.sin(kanteling));
    controls.target.set(0, 0, 0);
    controls.update();
    document.querySelectorAll('#view-toggle button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === naam));
}
document.getElementById('view-toggle').addEventListener('click', e => { if (e.target.dataset.view) zetView(e.target.dataset.view); });

const Y_AS = new THREE.Vector3(0, 1, 0);
const draaiCamera = hoek => {
    camera.position.sub(controls.target).applyAxisAngle(Y_AS, hoek).add(controls.target);
    teken();
};

// Draaiknoppen (makkelijker dan gebaren op oude touchscreens) en kompas.
// De draai wordt in de animatielus in stapjes uitgevoerd.
let draaiRest = 0;
const kompasSvg = document.querySelector('#kompas svg');
document.getElementById('draai').addEventListener('click', e => {
    const knop = e.target.closest('button');
    if (!knop) return;
    draaiRest = knop.id === 'kompas' ? -controls.getAzimuthalAngle() : draaiRest + knop.dataset.draai * Math.PI / 180;
    teken();
});

function draaiStap() {
    if (Math.abs(draaiRest) > 0.001) {
        const stap = draaiRest * 0.2;
        draaiRest -= stap;
        draaiCamera(stap);
    }
}

// Volledig scherm. Op een telefoon vult de kaart het scherm (ook op een iPhone, waar een pagina niet echt volledig
// scherm kan); waar het kan ook zonder de balken van de browser. Erin of eruit: de kaart past zich opnieuw aan.
const volKnop = document.getElementById('volscherm'), telefoon = matchMedia('(max-width: 760px), (pointer: coarse)');
const echtVol = () => document.fullscreenElement || document.webkitFullscreenElement;
const kanVol = document.fullscreenEnabled || document.webkitFullscreenEnabled;
volKnop.hidden = !kanVol && !telefoon.matches;
function zetVolledig(aan) {
    const d = document, e = d.documentElement;
    e.classList.toggle('kaart-vol', aan && telefoon.matches);
    if (kanVol && aan !== !!echtVol()) (aan ? e.requestFullscreen || e.webkitRequestFullscreen : d.exitFullscreen || d.webkitExitFullscreen).call(aan ? e : d)?.catch?.(() => { });
    naVolledig();
}
function naVolledig() {
    const aan = !!echtVol() || document.documentElement.classList.contains('kaart-vol');
    volKnop.setAttribute('aria-pressed', aan);
    volKnop.setAttribute('aria-label', aan ? 'Volledig scherm sluiten' : 'Volledig scherm');
    kaartOpnieuw();
}
volKnop.addEventListener('click', () => zetVolledig(volKnop.getAttribute('aria-pressed') !== 'true'));
const bijWissel = () => {
    if (!echtVol()) document.documentElement.classList.remove('kaart-vol'); // met Esc of de terugknop eruit
    naVolledig();
};
document.addEventListener('fullscreenchange', bijWissel);
document.addEventListener('webkitfullscreenchange', bijWissel);
// Andere maat van de kaart (volledig scherm, zijbalk weg): het hele terrein weer in beeld, en wel zodra de nieuwe
// maat er echt is (de browser past hem soms pas later of in stapjes aan; zie resize). Niet tijdens het rijden.
let herschikTot = 0;
const kaartOpnieuw = () => {
    herschikTot = performance.now() + 1500;
    setTimeout(() => { if (controls.enablePan) zetView(view); }, 400);
};

// Zijbalk in- en uitklappen, voor meer kaart (niet op een telefoon: daar staat hij onder de kaart).
const zijbalkKnop = document.getElementById('zijbalk');
function wisselZijbalk() {
    const weg = document.documentElement.classList.toggle('zonder-zijbalk');
    zijbalkKnop.setAttribute('aria-pressed', weg);
    zijbalkKnop.setAttribute('aria-label', weg ? 'Zijbalk tonen' : 'Zijbalk verbergen');
    kaartOpnieuw();
}
zijbalkKnop.addEventListener('click', wisselZijbalk);

// iOS negeert user-scalable=no: knijpen buiten de kaart zou de hele pagina inzoomen.
document.addEventListener('gesturestart', e => e.preventDefault());

// Bovenaanzicht: draaien door twee vingers te draaien (zoals Google Maps). Pas na ~10°
// draaien, zodat gewoon knijpen of schuiven de kaart niet per ongeluk laat draaien.
let twist = null;
const vingerHoek = t => Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX);
renderer.domElement.addEventListener('touchstart', e => {
    twist = view === 'boven' && e.touches.length === 2 ? { hoek: vingerHoek(e.touches), totaal: 0 } : null;
});
renderer.domElement.addEventListener('touchmove', e => {
    if (!twist || e.touches.length !== 2) return;
    const hoek = vingerHoek(e.touches);
    const d = Math.atan2(Math.sin(hoek - twist.hoek), Math.cos(hoek - twist.hoek));
    twist.hoek = hoek;
    twist.totaal += d;
    if (Math.abs(twist.totaal) > 0.18) draaiCamera(d);
});

// Oog-knop: namen en getallen op de kaart verbergen, zodat alleen de kleuren overblijven.
const namenKnop = document.getElementById('namen');
namenKnop.addEventListener('click', () => {
    const verbergen = !labelsEl.hidden;
    labelsEl.hidden = verbergen;
    namenKnop.setAttribute('aria-pressed', verbergen);
    namenKnop.setAttribute('aria-label', verbergen ? 'Namen tonen' : 'Namen verbergen');
    if (!verbergen) update(); // labelmaten opnieuw meten
});

// Schuiven kan niet verder dan de rand van het terrein.
function houdBinnenTerrein() {
    if (!controls.enablePan) return; // de kaart volgt de sportwagen (sim.js), ook buiten het terrein
    const t = controls.target;
    const x = THREE.MathUtils.clamp(t.x, tx1, tx2), z = THREE.MathUtils.clamp(t.z, tz1, tz2);
    camera.position.x += x - t.x;
    camera.position.z += z - t.z;
    t.set(x, 0, z);
}

// ---------------------------------------------------------------------------
// Zijbalk
// ---------------------------------------------------------------------------

const detailEl = document.getElementById('detail');
const overzichtEl = document.getElementById('overzicht');
const rankingEl = document.getElementById('ranking');
const metricToggle = document.getElementById('metric-toggle');

document.getElementById('kpis').innerHTML = kpiHtml([
    [METING.bezoekers, 'bezoekers'],
    [tijd(METING.wachttijdSlagboom), 'min wachten bij slagboom'],
    [tijd(GEM_STOP), 'min gem. per stop']
]);

metricToggle.innerHTML = Object.entries(METRICS).map(([key, m]) => `<button data-metric="${key}">${m.label}</button>`).join('');
pijlGroep(metricToggle);
pijlGroep(rankingEl);
pijlGroep(document.getElementById('view-toggle'));
pijlGroep(document.getElementById('draai'));
metricToggle.addEventListener('click', e => {
    if (!e.target.dataset.metric) return;
    state.metric = e.target.dataset.metric;
    update();
});

rankingEl.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) selecteer(b.dataset.id); });
rankingEl.addEventListener('pointerover', e => { const b = e.target.closest('[data-id]'); zetHover(b ? b.dataset.id : null); });
rankingEl.addEventListener('pointerleave', () => zetHover(null));

// Balkjes per voertuigtype; het streepje toont de verdeling over het hele park.
function voertuigBalken(aantallen, totaal, metPark) {
    return `<div class="bars">${VOERTUIGTYPES.map((type, i) => balkRij(type, aantallen[i] / (totaal || 1) * 100, aantallen[i],
        { tick: metPark ? VOERTUIG_AANTAL[i] / METING.bezoekers * 100 : undefined })).join('')}</div>
        ${metPark ? '<p class="note"><em class="tick"></em> verdeling over het hele park</p>' : ''}`;
}

function detailHtml(id) {
    if (id === 'slagboom') {
        return `
            <h2>Slagboom</h2>
            <p class="sub">Ingang</p>
            <div class="tiles">
                <div><b>${tijd(METING.wachttijdSlagboom)}</b><span>min gemiddelde wachttijd</span></div>
                <div><b>${METING.bezoekers}</b><span>voertuigen</span></div>
            </div>
            <h3>Voertuigen</h3>
            ${voertuigBalken(VOERTUIG_AANTAL, METING.bezoekers, false)}`;
    }
    const type = VOERTUIGTYPES.indexOf(id);
    if (type >= 0) {
        const n = VOERTUIG_AANTAL[type], stops = STOPS_PER_TYPE[type];
        const waarheen = ACTIEF.filter(x => STROMEN[x].voertuigen[type]).sort((a, b) => STROMEN[b].voertuigen[type] - STROMEN[a].voertuigen[type]);
        return `
            <h2>${id}</h2>
            <p class="sub">Voertuigtype</p>
            <div class="tiles">
                <div><b>${n}</b><span>voertuigen · ${pct(n, METING.bezoekers)} van alle bezoekers</span></div>
                <div><b>${getal(stops / n, 1)}</b><span>containers per bezoek</span></div>
            </div>
            <h3>Waar gaan ze heen</h3>
            <div class="bars">${waarheen.map(x => balkRij(STROMEN[x].naam, STROMEN[x].voertuigen[type] / stops * 100, STROMEN[x].voertuigen[type],
                { tick: STROMEN[x].bezoeken / TOTAAL_STOPS * 100, kleur: VOERTUIGKLEUREN[type] })).join('')}</div>
            <p class="note"><em class="tick"></em> verdeling over het hele park</p>`;
    }
    const s = STROMEN[id];
    const rang = 1 + IDS.filter(x => STROMEN[x].bezoeken > s.bezoeken).length;
    const verschil = Math.round(s.verblijf - GEM_STOP);
    const vergelijk = s.bezoeken ? ` · ${verschil >= 0 ? '+' : '−'}${Math.abs(verschil)} s t.o.v. gemiddeld` : '';
    return `
        <h2>${s.naam}</h2>
        <p class="sub">#${rang} van ${IDS.length} in drukte</p>
        <div class="tiles">
            <div><b>${s.bezoeken}</b><span>bezoeken · ${pct(s.bezoeken, METING.bezoekers)} van alle bezoekers</span></div>
            <div><b>${METRICS.verblijf.fmt(s.verblijf)}</b><span>min gem. verblijf${vergelijk}</span></div>
            <div><b>${uren(bezet(s))}</b><span>totale bezetting · ≈ ${bezetPct(s)} van de openingstijd</span></div>
        </div>
        <h3>Voertuigen</h3>
        ${voertuigBalken(s.voertuigen, s.bezoeken, true)}`;
}

let getoondeDetail, getoondeRanglijst;
function update() {
    teken(); // kleuren, hover of labels veranderen
    const m = METRICS[state.metric];
    const rij = gesorteerd(state.metric);
    const max = m.waarde(STROMEN[rij[0]]) || 1;

    // Kaartkleuren. Bij een gekozen voertuigtype vervagen de containers waar dat type niet kwam.
    const type = VOERTUIGTYPES.indexOf(state.selectie);
    const vervaag = id => !!state.selectie && (type < 0 ? id !== state.selectie : !STROMEN[id]?.voertuigen[type]);
    for (const box of alleBoxen) {
        const id = box.userData.id;
        const kleur = id ? rampKleur(m.waarde(STROMEN[id]) / max) : ONBEKEND.clone();
        if (vervaag(id)) kleur.lerp(VERVAAGD, 0.7);
        box.material.color.copy(kleur);
    }
    for (const o of klikbaar) o.material.emissive.setHex(0); // oplichten bij aanwijzen: zie knipper

    // Labels, op volgorde van belangrijkheid
    for (const l of labels) {
        const { id, el } = l, s = STROMEN[id];
        el.innerHTML = id === 'slagboom' ? `Slagboom <b>${tijd(METING.wachttijdSlagboom)}</b>`
            : id === 'truck' ? 'Speel <b>Lossen maar</b>'
            : s ? `${s.naam} <b>${m.fmt(m.waarde(s))}</b>`
            : `${id} <b>${METING.voertuigen[id]}</b>`;
        el.classList.toggle('actief', id === state.selectie);
        el.classList.toggle('hover', id === state.hover);
        el.classList.toggle('gedimd', vervaag(id));
        l.w = el.offsetWidth;
        l.h = el.offsetHeight;
    }
    // Hover telt hier bewust niet mee: dan springt het label onder de muis weg en weer terug.
    // Voertuigen en wagen als laatste: verschijnen ze, dan schuiven de andere niet op.
    const prio = id => id === state.selectie ? 0 : id === 'slagboom' ? 1 : rij.includes(id) ? 2 + rij.indexOf(id) : 99;
    labels.sort((a, b) => prio(a.id) - prio(b.id));

    // Zijbalk
    metricToggle.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.metric === state.metric));
    document.getElementById('metric-uitleg').textContent = m.uitleg;
    document.getElementById('legend').innerHTML = `
        <div class="ramp" style="background:linear-gradient(90deg,${rampHex.join(',')})"></div>
        <div class="ramp-labels"><span>0</span><span>${m.fmt(max)} ${m.eenheid}</span></div>`;
    // Ranglijst alleen opnieuw opbouwen bij een andere maatstaf: bij aanwijzen de knoppen vervangen
    // laat de klik erop verloren gaan (indrukken op de oude knop, loslaten op de nieuwe).
    if (state.metric !== getoondeRanglijst) {
        getoondeRanglijst = state.metric;
        rankingEl.innerHTML = rij.map(id => {
            const w = m.waarde(STROMEN[id]);
            return `<li><button data-id="${id}">
                <span>${STROMEN[id].naam}</span>
                <div class="bar"><i style="width:${w / max * 100}%"></i></div>
                <b>${m.fmt(w)}</b>
            </button></li>`;
        }).join('');
    }
    for (const knop of rankingEl.querySelectorAll('button')) {
        knop.classList.toggle('actief', knop.dataset.id === state.selectie);
        knop.classList.toggle('hover', knop.dataset.id === state.hover);
    }

    // Detail vervangt de ranglijst (alleen opnieuw opbouwen als de selectie verandert)
    // Kwam je met het toetsenbord uit de lijst, dan gaat de focus mee naar het detail en weer terug.
    if (state.selectie !== getoondeDetail) {
        const vanuitLijst = overzichtEl.contains(document.activeElement);
        const vorige = getoondeDetail;
        getoondeDetail = state.selectie;
        overzichtEl.hidden = !!state.selectie;
        detailEl.hidden = !state.selectie;
        if (state.selectie) {
            detailEl.innerHTML = `<button class="terug">← Alle containers</button>${detailHtml(state.selectie)}`;
            const terug = detailEl.querySelector('.terug');
            terug.addEventListener('click', () => selecteer(null));
            if (vanuitLijst) terug.focus();
            detailEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (detailEl.contains(document.activeElement)) {
            (rankingEl.querySelector(`[data-id="${vorige}"]`) || rankingEl.querySelector('button')).focus();
        }
    }
}

// ---------------------------------------------------------------------------
// Tabs en start
// ---------------------------------------------------------------------------

const kaartEl = document.getElementById('tab-kaart');
const spelEl = document.getElementById('spel'); // het spel zelf staat in spel.js
function toonTab(tab) {
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    kaartEl.hidden = tab !== 'kaart';
    document.getElementById('tab-analyse').hidden = tab !== 'analyse';
    if (tab === 'analyse') tekenAnalyse(); // staat in grafieken.js
    else teken();
    zetHash();
}
document.querySelector('.tabs').addEventListener('click', e => { if (e.target.dataset.tab) toonTab(e.target.dataset.tab); });
pijlGroep(document.querySelector('.tabs'));

// Deelbare link: #rest opent de kaart bij die container (of voertuig, #slagboom), #analyse de analyse.
function zetHash() {
    const h = kaartEl.hidden ? 'analyse' : state.selectie;
    history.replaceState(null, '', h ? '#' + encodeURIComponent(h) : location.pathname + location.search);
}
function leesHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    toonTab(h === 'analyse' ? 'analyse' : 'kaart');
    if (h !== 'analyse') selecteer(IDS.includes(h) || VOERTUIGTYPES.includes(h) || h === 'slagboom' ? h : null);
}
addEventListener('hashchange', leesHash);
addEventListener('DOMContentLoaded', () => { if (location.hash) leesHash(); }); // pas als ook grafieken.js geladen is

function resize() {
    const w = mapEl.clientWidth, h = mapEl.clientHeight;
    if (!w || !h) return; // kaart-tab verborgen
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (performance.now() < herschikTot && controls.enablePan) zetView(view); // net volledig scherm of zijbalk gewisseld
    renderer.render(scene, camera); // meteen: een ander formaat maakt het canvas leeg (zwart) tot de volgende frame
    teken(); // labels opnieuw plaatsen
}
new ResizeObserver(resize).observe(mapEl);

// Licht/donker volgt de browser. Met de knop kies je zelf (wordt onthouden); kies je weer
// hetzelfde als de browser, dan volgt de site de browser weer.
const themaKnop = document.getElementById('thema');
const browserDonker = matchMedia('(prefers-color-scheme: dark)');

function zetThema(thema) {
    const k = SCENEKLEUREN[thema];
    document.documentElement.dataset.theme = thema;
    donker = thema === 'dark';
    rampHex = RAMPEN[thema];
    ramp = rampHex.map(c => new THREE.Color(c));
    themaKnop.setAttribute('aria-pressed', donker);
    scene.background.set(k.lucht);
    scene.fog.color.set(k.lucht);
    for (const naam in MAT) MAT[naam].color.set(k[naam]);
    ONBEKEND.set(k.onbekend);
    VERVAAGD.set(k.vervaagd);
    const css = getComputedStyle(document.documentElement);
    LAK.forEach((m, i) => m.color.set(css.getPropertyValue(`--v${i + 1}`).trim()));
    update();
}
// Bij wisselen ook de grafieken opnieuw tekenen: de tabel kleurt mee (grafieken.js).
const wisselThema = thema => { zetThema(thema); tekenAnalyse(); };

themaKnop.addEventListener('click', () => {
    const thema = donker ? 'light' : 'dark';
    try {
        if (thema === (browserDonker.matches ? 'dark' : 'light')) localStorage.removeItem('rd4-thema');
        else localStorage.setItem('rd4-thema', thema);
    } catch { }
    wisselThema(thema);
});
browserDonker.onchange = e => {
    let eigen;
    try { eigen = localStorage.getItem('rd4-thema'); } catch { }
    if (!eigen) wisselThema(e.matches ? 'dark' : 'light');
};

// Zonder wifi op het park: zie offline.js (niet vanaf file://, daar kan het niet).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('offline.js').catch(() => { });

resize();
zetView('schuin');
zetThema(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

document.fonts.ready.then(update); // labels opnieuw meten in het echte lettertype

let simStap = () => { }; // sim.js vult dit in; tot die geladen is gebeurt er niets
function beeld(nu) {
    gevraagd = false;
    if (kaartEl.hidden || spelEl.open) return; // terug naar de kaart of het spel dicht: dan wordt er weer getekend
    draaiStap();
    knipper(nu);
    simStap(nu);
    if (controls.enabled) controls.update(); // meldt 'change' (teken) zolang de camera beweegt; uit als de camera in de sportwagen zit
    if (!opnieuw) return;
    opnieuw = false;
    houdBinnenTerrein();
    kompasSvg.style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
    renderer.render(scene, camera);
    plaatsLabels();
}
