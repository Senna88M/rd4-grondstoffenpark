// De wereld van het rijspel, ten noorden van het park: een driftpark, een bedrijfsterrein en een stad met een
// ringweg, een rotonde, lanen, straten en een viaduct over de stad, waar de straat vanaf het park op uitkomt. Eerst de wegen;
// gebouwen, stoepen, strepen, lantaarns, bomen en geparkeerde auto's volgen de wegen en blijven van kruisingen en
// van elkaar af. Alles waar je tegenaan botst is ook te zien (zie de controle in de test).
// x = oost, z = zuid: noord (−z) is boven op de kaart. Globals van de site: THREE, scene, MAT, SCENEKLEUREN, ...
import { klem, lokaal, doek, textuur, ruis, veel, Bouwer, schuinBlok, Raster, glad } from './hulp.js';

const PAD = [-130, -335, 135, -155];      // driftpark: x1, z1 (noord), x2, z2
const WERF = [215, -240, 275, -160];      // bedrijfsterrein
const CENTRUM = [20, -555];               // rotonde
export const GRENS = [-300, 360, -800, tz2 + 150]; // verder kun je niet
export const BAAN = { x1: -40, x2: 80, z: -290, r: 26, start: -20 }; // rondbaan: startstreep op x −20 van het zuidelijke rechte stuk
const GARAGE = [-80, -665, -14, -568], TANKSTATION = [105, -598, 140, -572];
const DOORRIT = [134, -205, 216, -180];           // van het driftpark over de hoofdweg naar het bedrijfsterrein
const INRITTEN = [DOORRIT, [-62, -569, -44, -553], [108, -582, 137, -556]]; // en naar de parkeergarage en het tankstation
export const binnen = ([x1, z1, x2, z2], x, z, marge = 0) => x > x1 - marge && x < x2 + marge && z > z1 - marge && z < z2 + marge;

// ---------------------------------------------------------------------------
// Botsen en grond
// ---------------------------------------------------------------------------

// Obstakel: midden, richting (hoek), halve lengte en breedte, en van bodem tot bovenkant (h0 → h1 in de lengte).
// Alles heeft zijn echte hoogte: wat onder een viaduct staat, zit je op het dek niet in de weg. Rijbare blokken
// (hellingen, containers, het dek, het garagedak) zijn ook grond: van de lage kant rijd je erop, is de rand hoger
// dan een stoeprand dan is het een muur, en onder een viaduct door kan gewoon.
const obstakels = new Raster(16);
export function obstakel(o) {
    obstakels.voeg(o, o.x, o.z, o.hx + o.hz);
    return o;
}
export const obstakelsRond = (x, z, straal, doe) => obstakels.rond(x, z, straal, doe);
export function bovenkant(o, x, z) {
    const lx = klem((x - o.x) * Math.cos(o.hoek) + (z - o.z) * Math.sin(o.hoek), -o.hx, o.hx);
    return o.h0 + (o.h1 - o.h0) * (lx + o.hx) / (2 * o.hx);
}
export const botstMet = (o, x, z, y) => o.h0 === undefined || (bovenkant(o, x, z) > y + 0.5 && o.bodem < y + 1.2);
// De hoogste grond onder (x, z) waar je vanaf hoogte y op kunt komen.
export function grondOnder(x, z, y) {
    let g = 0;
    obstakels.rond(x, z, 0, o => {
        if (!o.rijbaar) return;
        const c = Math.cos(o.hoek), s = Math.sin(o.hoek), dx = x - o.x, dz = z - o.z;
        if (Math.abs(dx * c + dz * s) > o.hx || Math.abs(-dx * s + dz * c) > o.hz) return;
        const top = bovenkant(o, x, z);
        if (top <= y + 0.5 && top > g) g = top;
    });
    return g;
}
// Blok (zie boven) met een doos erbij om te zien; draai = rotation.y, lengte langs zijn x.
function blok(x, z, draai, lengte, breedte, h0, h1 = h0, { bodem = 0, materiaal = MAT.beton, zichtbaar = true } = {}) {
    obstakel({ x, z, hoek: -draai, hx: lengte / 2, hz: breedte / 2, h0, h1, bodem, rijbaar: true });
    if (!zichtbaar) return;
    const m = new THREE.Mesh(schuinBlok(lengte, breedte, h0, h1, bodem), materiaal);
    m.position.set(x, 0, z);
    m.rotation.y = draai;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
}
const muur = (o, hoog, bodem = 0) => obstakel({ ...o, h0: hoog, h1: hoog, bodem }); // iets waar je niet op rijdt
const paal = (x, z, half, hoog) => muur({ x, z, hoek: 0, hx: half, hz: half }, hoog);

// ---------------------------------------------------------------------------
// Materialen en vormen
// ---------------------------------------------------------------------------

let M;
function materialen() {
    Object.assign(SCENEKLEUREN.light, { beton: '#d2cdc4', gevel: '#ffffff', gazon: '#a9c98f', heuvel: '#b3cc9f' });
    Object.assign(SCENEKLEUREN.dark, { beton: '#474d55', gevel: '#8c95a1', gazon: '#233a2c', heuvel: '#1d3127' });
    const k = SCENEKLEUREN[donker ? 'dark' : 'light'];
    MAT.beton = new THREE.MeshLambertMaterial({ map: ruis(6000, 0.2), color: k.beton, side: THREE.DoubleSide }); // ook wanden die maar één kant op wijzen
    MAT.gazon = new THREE.MeshLambertMaterial({ map: ruis(4000, 0.3), color: k.gazon });
    MAT.heuvel = new THREE.MeshLambertMaterial({ color: k.heuvel });
    // Gevels: ramen per 3 m; 's avonds (donker thema) branden er een paar (zie ramenAan).
    const r = zaad(31), raam = (g, i, j) => g.fillRect(i * 32 + 7, j * 32 + 9, 18, 16);
    MAT.gevel = new THREE.MeshLambertMaterial({
        vertexColors: true, color: k.gevel,
        map: textuur(doek(256, 256, g => {
            g.fillStyle = '#fff';
            g.fillRect(0, 0, 256, 256);
            g.fillStyle = '#56687c';
            for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) raam(g, i, j);
        }), 1 / 24),
        emissiveMap: textuur(doek(256, 256, g => {
            g.fillStyle = '#000';
            g.fillRect(0, 0, 256, 256);
            g.fillStyle = '#fff';
            for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (r() < 0.35) raam(g, i, j);
        }), 1 / 24)
    });
    const golf = doek(64, 64, g => { // golfplaat
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let i = 0; i < 64; i += 8) g.fillRect(i, 0, 3, 64);
    });
    M = {
        zwart: mat('#1b1d21'), donker: mat('#2b2e33'), grijs: mat('#8a9199'), hout: mat('#b48a55'), geel: mat('#f2b705'),
        lamp: new THREE.MeshBasicMaterial({ color: '#fff2c7' }), rood: new THREE.MeshBasicMaterial({ color: '#ff3b30' }), groen: new THREE.MeshBasicMaterial({ color: '#34c759' }),
        container: new THREE.MeshLambertMaterial({ map: textuur(golf) }),
        loods: new THREE.MeshLambertMaterial({ map: textuur(golf, 1 / 3.2), color: '#9fb0c0' }),
        water: new THREE.MeshLambertMaterial({ color: '#6fa8d6' }),
        rand: new THREE.MeshLambertMaterial({ map: textuur(doek(64, 16, g => { // geel-zwart
            g.fillStyle = '#f2c230';
            g.fillRect(0, 0, 64, 16);
            g.fillStyle = '#1b1d21';
            for (let i = -16; i < 64; i += 16) g.fillRect(i, 0, 8, 16);
        })) })
    };
    // Het bouwland: gevels die per vak worden samengevoegd.
    M.gebouwen = new Bouwer(MAT.gevel);
}
export function ramenAan(aan) {
    MAT.gevel.emissive.set(aan ? '#c9a45a' : '#000000');
}

const BAND = new THREE.TorusGeometry(0.38, 0.16, 8, 18).rotateX(Math.PI / 2);
const AUTOKLEUREN = ['#c0392b', '#2c5f9e', '#e8e8e8', '#2b2b2b', '#7f8c8d', '#d4a017', '#1e7d4f', '#8e44ad', '#f0f0f0', '#5d6d7e'];
const GEVELS = ['#d9d4cc', '#c9b8a6', '#b9c4cc', '#e2d7c3', '#a9b3ba', '#d6c2b8', '#c3cbbd', '#98a3ae', '#e4dfd6', '#b8a898'];
const CONTAINERKLEUREN = ['#b83a2e', '#2f6aa8', '#2f8a5a', '#d9822b', '#7d868c', '#d4b429', '#8a4fa0'];
export const AUTO = {
    romp: new THREE.BoxGeometry(4.2, 0.7, 1.8).translate(0, 0.62, 0), kap: new THREE.BoxGeometry(2.1, 0.55, 1.6).translate(-0.2, 1.24, 0),
    wiel: new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateX(Math.PI / 2), wielen: [[-1.35, -0.8], [-1.35, 0.8], [1.35, -0.8], [1.35, 0.8]]
};

// Lantaarns: [x, z, richting naar de weg, hoogte waarop hij staat].
function lantaarns(plekken, groot = 1) {
    const delen = [[new THREE.CylinderGeometry(0.06, 0.09, 6.5, 8).translate(0, 3.25, 0), M.grijs],
        [new THREE.BoxGeometry(1.5, 0.07, 0.07).translate(0.72, 6.42, 0), M.grijs],
        [new THREE.BoxGeometry(0.6, 0.1, 0.26).translate(1.35, 6.36, 0), M.lamp]];
    for (const [geo, materiaal] of delen) veel(geo, materiaal, plekken, (p, [x, z, r, y = 0]) => {
        p.position.set(x, y, z);
        p.rotation.y = -r;
        p.scale.setScalar(groot);
    });
    for (const [x, z, , y = 0] of plekken) {
        if (y) obstakel({ x, z, hoek: 0, hx: 0.15, hz: 0.15, h0: y + 7, h1: y + 7, bodem: y }); // op een viaduct: eronder kun je door
        else paal(x, z, 0.15 * groot, 7 * groot);
    }
}
// Bomen: [x, z, grootte, naaldboom, tint]. Meteen iets om tegen te botsen; getekend worden ze aan het eind allemaal
// tegelijk (plantBomen).
const boomUit = r => (x, z) => [x, z, 0.8 + r() * 0.55, r() < 0.3, 0.8 + r() * 0.3];
const alleBomen = [], kaartRingen = []; // ook voor de minikaart
function bomen(lijst) {
    alleBomen.push(...lijst);
    lijst.forEach(([x, z, g]) => paal(x, z, 0.3, 6 * g));
}
function plantBomen() {
    const lijst = alleBomen;
    veel(new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6).translate(0, 1.2, 0), MAT.stam, lijst, (p, [x, z, g]) => {
        p.position.set(x, 0, z);
        p.scale.setScalar(g);
    });
    const kruin = (geo, soort) => veel(geo, MAT.blad, lijst.filter(b => b[3] === soort), (p, [x, z, g]) => {
        p.position.set(x, 0, z);
        p.rotation.y = x * 7 + z;
        p.scale.setScalar(g);
    }, { kleur: b => new THREE.Color().setScalar(b[4]) });
    kruin(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.3, 0), false);
    kruin(new THREE.ConeGeometry(1.35, 4.2, 7).translate(0, 3.9, 0), true);
}
// Geparkeerde auto's: [x, z, draai, kleur]. Voorkant = +x.
function autos(lijst) {
    const zet = (p, [x, z, d]) => {
        p.position.set(x, 0, z);
        p.rotation.y = d;
    };
    veel(AUTO.romp, mat(), lijst, zet, { kleur: a => new THREE.Color(a[3]) });
    veel(AUTO.kap, mat('#2a3038'), lijst, zet);
    veel(AUTO.wiel, M.zwart, lijst.flatMap(a => AUTO.wielen.map(w => [a, w])), (p, [[x, z, d], [lx, lz]]) => {
        const [wx, wz] = lokaal(x, z, d, lx, lz);
        p.position.set(wx, 0.33, wz);
        p.rotation.y = d;
    });
    lijst.forEach(([x, z, d]) => muur({ x, z, hoek: -d, hx: 2.1, hz: 0.9 }, 1.6));
}
// Strepen (alle in één keer): [x, z, draai, lengte, breedte, hoogte].
function strepen(lijst) {
    veel(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), MAT.streep, lijst, (p, [x, z, d, l, b, y = 0.035]) => {
        p.position.set(x, y, z);
        p.rotation.y = d;
        p.scale.set(l, 1, b);
    }, { schaduw: false });
}
// Containers: [x, z, draai°, hoog, kleur?]. Je kunt erop rijden (via een helling) of erop landen.
function containers(lijst, r) {
    const stuks = [];
    for (const [x, z, draai, hoog, kleur] of lijst) for (let k = 0; k < hoog; k++) stuks.push({ x, z, draai, k, kleur: kleur || CONTAINERKLEUREN[r() * CONTAINERKLEUREN.length | 0] });
    veel(new THREE.BoxGeometry(6.06, 2.59, 2.44).translate(0, 1.295, 0), M.container, stuks, (p, c) => {
        p.position.set(c.x, c.k * 2.6, c.z);
        p.rotation.y = c.draai * Math.PI / 180;
    }, { kleur: c => new THREE.Color(c.kleur) });
    for (const [x, z, draai, hoog] of lijst) blok(x, z, draai * Math.PI / 180, 6.06, 2.44, hoog * 2.6, hoog * 2.6, { zichtbaar: false });
}
function bandenstapels(lijst) { // drie hoog: [x, z]
    veel(BAND, M.zwart, lijst.flatMap(p => [0, 1, 2].map(k => [...p, k])), (p, [x, z, k]) => p.position.set(x, 0.16 + k * 0.32, z));
    lijst.forEach(([x, z]) => paal(x, z, 0.55, 1));
}
// Schans: helling met een geel-zwarte rand bovenaan.
function schans(x, z, draai, lengte, breedte, hoog) {
    blok(x, z, draai, lengte, breedte, 0, hoog);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, breedte), M.rand);
    const [lx, lz] = lokaal(x, z, draai, lengte / 2 - 0.2, 0);
    lip.position.set(lx, hoog + 0.02, lz);
    lip.rotation.set(0, draai, Math.atan2(hoog, lengte));
    scene.add(lip);
}

// Huisjes: [x, z, draai, breedte, diepte, hoogte, muur, dak]. Deur aan de +z-kant (lokaal).
function huisjes(huizen) {
    const kubus = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), dak = new THREE.BufferGeometry();
    const [A, B, C, D, E, F] = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 1, 0], [0.5, 1, 0]]; // nok langs x
    dak.setAttribute('position', new THREE.Float32BufferAttribute([A, E, F, A, F, B, D, C, F, D, F, E, A, D, E, B, F, C].flat(), 3));
    dak.computeVertexNormals();
    const zet = (hoogte, schaal) => (p, h) => {
        p.position.set(h[0], hoogte(h), h[1]);
        p.rotation.y = h[2];
        p.scale.set(...schaal(h));
    };
    veel(kubus, mat(), huizen, zet(() => 0, h => [h[3], h[5], h[4]]), { kleur: h => new THREE.Color(h[6]) });
    veel(dak, mat(), huizen, zet(h => h[5], h => [h[3] + 0.6, Math.min(3, h[3] * 0.3), h[4] + 0.7]), { kleur: h => new THREE.Color(h[7]) });
    veel(kubus, mat('#4a3f38'), huizen, (p, h) => {
        const [x, z] = lokaal(h[0], h[1], h[2], 0, h[4] / 2 + 0.03);
        p.position.set(x, 0, z);
        p.rotation.y = h[2];
        p.scale.set(1, 2.1, 0.08);
    });
    veel(kubus, M.lamp, huizen.flatMap(h => [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([l, voor]) => [h, l, voor])), (p, [h, l, voor]) => {
        const [x, z] = lokaal(h[0], h[1], h[2], l * h[3] / 4, voor * (h[4] / 2 + 0.03));
        p.position.set(x, h[5] * 0.4, z);
        p.rotation.y = h[2];
        p.scale.set(1.2, 1, 0.08);
    });
    huizen.forEach(([x, z, h, b, d, hoog]) => muur({ x, z, hoek: -h, hx: b / 2, hz: d / 2 }, hoog + 2));
}

// Heftruck (voorkant = +x) met een pallet banden op de vork; userData.vork gaat op en neer. De vaste delen worden per
// materiaal één geheel (minder tekenopdrachten).
function heftruck(x, z, draai, groot = 1) {
    const g = new THREE.Group(), vast = new Map();
    const deel = (geo, m, px, py, pz = 0, ouder = g) => {
        if (ouder === g) {
            if (!vast.has(m)) vast.set(m, []);
            vast.get(m).push(geo.clone().translate(px, py, pz));
            return;
        }
        const d = new THREE.Mesh(geo, m);
        d.position.set(px, py, pz);
        d.castShadow = true;
        ouder.add(d);
    };
    deel(new THREE.BoxGeometry(2, 0.9, 1.2), M.geel, 0, 0.75);
    deel(new THREE.BoxGeometry(0.5, 0.95, 1.2), M.donker, -1.15, 0.8);
    for (const px of [-0.55, 0.45]) for (const pz of [-0.52, 0.52]) deel(new THREE.BoxGeometry(0.07, 1.0, 0.07), M.donker, px, 1.7, pz);
    deel(new THREE.BoxGeometry(1.15, 0.06, 1.15), M.donker, -0.05, 2.22);
    deel(new THREE.BoxGeometry(0.45, 0.4, 0.5), M.donker, -0.2, 1.35);
    for (const pz of [-0.38, 0.38]) deel(new THREE.BoxGeometry(0.1, 2.6, 0.1), M.donker, 1.08, 1.45, pz);
    for (const px of [-0.7, 0.7]) for (const pz of [-0.55, 0.55]) deel(AUTO.wiel, M.zwart, px, 0.3, pz);
    const vork = new THREE.Group();
    vork.position.set(1.15, 0.15, 0);
    g.add(vork);
    deel(new THREE.BoxGeometry(0.08, 0.6, 1.0), M.donker, 0.02, 0.3, 0, vork);
    for (const pz of [-0.3, 0.3]) deel(new THREE.BoxGeometry(1.2, 0.05, 0.12), M.donker, 0.65, 0.03, pz, vork);
    deel(new THREE.BoxGeometry(1.2, 0.14, 1.0), M.hout, 0.65, 0.13, 0, vork);
    for (const k of [0, 1, 2]) deel(BAND, M.zwart, 0.65, 0.36 + k * 0.32, 0, vork);
    for (const [m, delen] of vast) {
        const d = new THREE.Mesh(samen(delen), m);
        d.castShadow = true;
        g.add(d);
    }
    g.userData.vork = vork;
    g.position.set(x, 0, z);
    g.rotation.y = draai;
    g.scale.setScalar(groot);
    scene.add(g);
    const [ox, oz] = lokaal(x, z, draai, 0.5 * groot, 0);
    return { groep: g, o: muur({ x: ox, z: oz, hoek: -draai, hx: 1.9 * groot, hz: 0.7 * groot }, 2.4 * groot) };
}
function samen(delen) { // geometrieën (plek en normaal) tot één
    const pos = [], nor = [];
    for (const d of delen) {
        const n = d.index ? d.toNonIndexed() : d;
        pos.push(...n.attributes.position.array);
        nor.push(...n.attributes.normal.array);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return geo;
}

// ---------------------------------------------------------------------------
// Wegen
// ---------------------------------------------------------------------------

const SOORT = {
    ring: { half: 7, stoep: 4, parkeren: false, stroken: [-3.5, 3.5], licht: true, dubbel: true },
    laan: { half: 6, stoep: 4, parkeren: true, stroken: [], licht: true, dubbel: true },
    hoofdweg: { half: 3.75, stoep: 2.45, parkeren: false, stroken: [], kantstreep: true }, // zoals de straat vanaf het park
    straat: { half: 4.5, stoep: 3, parkeren: false, stroken: [] },
    rotonde: { half: 5, stoep: 2.5, parkeren: false, stroken: [] },
    viaduct: { half: 6, stoep: 0, parkeren: false, stroken: [] },
    park: { half: 3.75, stoep: 2.45, parkeren: false, stroken: [] } // de straat vanaf het park (omgeving.js tekent hem)
};
// Wie voorgaat: op een kruising loopt het asfalt (en de strepen) van de belangrijkste weg door.
const VOORRANG = { park: 1, straat: 2, hoofdweg: 3, laan: 3, ring: 4, rotonde: 5 };
export class Weg {
    constructor(naam, soort, punten, { dicht = false, hoogte = null, breed = null } = {}) {
        Object.assign(this, SOORT[soort], { naam, soort, dicht, hoogte: hoogte || (() => 0), voorrang: VOORRANG[soort] || 0 });
        this.breed = breed || (() => this.half); // halve breedte op s meter (s, lengte)
        this.pad = new THREE.CatmullRomCurve3(punten.map(([x, z]) => new THREE.Vector3(x, 0, z)), dicht, 'centripetal');
        this.pad.arcLengthDivisions = 1000;
        this.lengte = this.pad.getLength();
        this.monsters = [];
        for (let s = 0, eind = false; !eind; s += 3) { // om de 3 m, en precies tot het eind
            eind = s > this.lengte - 0.5;
            this.monsters.push({ ...this.op(eind ? this.lengte : s), j: this.monsters.length });
        }
    }
    op(s) { // punt op s meter: plek, richting (tx, tz), naar rechts (rx, rz), halve breedte en hoogte
        const u = this.dicht ? ((s / this.lengte) % 1 + 1) % 1 : klem(s / this.lengte, 0, 1), p = this.pad.getPointAt(u), t = this.pad.getTangentAt(u);
        return { s, x: p.x, z: p.z, tx: t.x, tz: t.z, rx: -t.z, rz: t.x, half: this.breed(s, this.lengte), h: this.hoogte(s), weg: this };
    }
}
const cirkel = ([cx, cz], straal, n) => Array.from({ length: n }, (_, i) => [cx + straal * Math.cos(i / n * 2 * Math.PI), cz + straal * Math.sin(i / n * 2 * Math.PI)]);
const VIADUCT_HOOG = 8, OPRIT = 80;

export const wegen = [];
const wegRaster = new Raster(24);
// Van welke (gewone) weg ligt (x, z) op het asfalt, met `marge` meter extra? (niet: `behalve`)
function opWeg(x, z, marge = 0, behalve = null) {
    let raak = null, best = Infinity;
    wegRaster.rond(x, z, 30, m => {
        if (m.weg === behalve) return;
        const d = Math.hypot(m.x - x, m.z - z) - m.half - marge;
        if (d < 1.5 && d < best) { // monsters liggen 3 m uit elkaar: halve afstand speling
            best = d;
            raak = m;
        }
    });
    return raak;
}
// Hoe ver ligt (x, z) van het asfalt van elke weg in de buurt (negatief: erop)? Precies, tussen de monsters in; een
// weg houdt recht op aan zijn eind.
function langsWegen(x, z) {
    const afstand = new Map();
    wegRaster.rond(x, z, 20, m => {
        const n = m.weg.monsters[m.j + 1];
        if (!n) return;
        const dx = n.x - m.x, dz = n.z - m.z, ruw = ((x - m.x) * dx + (z - m.z) * dz) / (dx * dx + dz * dz || 1), t = klem(ruw, 0, 1);
        if (!m.weg.dicht && (m.j === 0 && ruw < 0 || !m.weg.monsters[n.j + 1] && ruw > 1)) return;
        const d = Math.hypot(m.x + dx * t - x, m.z + dz * t - z) - (m.half + (n.half - m.half) * t);
        if (d < (afstand.get(m.weg) ?? Infinity)) afstand.set(m.weg, d);
    });
    return afstand;
}
// Dichtstbijzijnde punt op een gewone weg (om weer los te komen).
export function dichtsteWeg(x, z) {
    let beste = null, d = Infinity;
    for (const w of wegen) if (w.soort !== 'viaduct') for (const m of w.monsters) {
        const a = Math.hypot(m.x - x, m.z - z);
        if (a < d) {
            d = a;
            beste = m;
        }
    }
    return beste;
}

function maakWegen() {
    const lijst = [
        ['ring', 'ring', [[-40, -352], [60, -350], [160, -356], [232, -392], [272, -460], [284, -550], [264, -650], [202, -722], [100, -758], [-10, -762],
            [-120, -744], [-200, -692], [-242, -600], [-250, -500], [-222, -425], [-150, -372]], { dicht: true }],
        ['rotonde', 'rotonde', cirkel(CENTRUM, 26, 24), { dicht: true }],
        ['zuid', 'laan', [[20, -331], [18, -440], [20, -529]]], // van het driftpark over de ring naar de rotonde
        ['noord', 'laan', [[20, -581], [30, -670], [22, -757]]],
        ['west', 'laan', [[-6, -555], [-90, -548], [-170, -562], [-246, -560]]],
        ['oost', 'laan', [[46, -555], [140, -565], [210, -548], [283, -550]]],
        ['noordoost', 'laan', [[38.4, -573.4], [120, -630], [228, -690]]],
        ['zuidwest', 'laan', [[1.6, -536.6], [-90, -470], [-160, -420], [-200, -405]]],
        ['kromme', 'straat', [[-90, -548], [-130, -610], [-120, -680], [-80, -748]]],
        ['westrand', 'straat', [[-170, -562], [-190, -640], [-203, -694]]],
        ['oostrand', 'straat', [[140, -565], [160, -470], [197, -380]]],
        ['noordrand', 'straat', [[30, -670], [100, -700], [150, -740]]],
        ['oostdwars', 'straat', [[18, -440], [90, -452], [158, -475]]],
        ['westdwars', 'straat', [[18, -440], [-40, -430], [-125, -445]]],
        ['oostnoord', 'straat', [[210, -548], [200, -610], [185, -662]]],
        ['werfweg', 'laan', [[232, -392], [240, -320], [245, -262], [245, -238]]],
        ['afrit', 'straat', [[-202, -448], [-208, -434], [-222, -425]]],
        // De straat vanaf het park loopt door langs het driftpark en wordt breder tot het viaduct.
        ['hoofdweg', 'hoofdweg', [[20, -146], [60, -146], [110, -146], [150, -150], [170, -172], [176, -205], [175, -250]], { breed: (s, l) => 3.75 + 2.25 * glad(klem((s - l + 45) / 35, 0, 1)) }],
        ['park', 'park', STRAAT.points.map(p => [p.x, p.z])] // omgeving.js
    ];
    for (const [naam, soort, punten, opties] of lijst) wegen.push(new Weg(naam, soort, punten, opties));
    // Viaduct: van de hoofdweg omhoog, in een boog over de stad, en aan de westkant weer omlaag.
    const v = [[175, -245], [176, -320], [185, -400], [200, -480], [182, -600], [112, -662], [0, -702], [-110, -684], [-180, -625], [-205, -545], [-202, -445]];
    const lengte = new Weg('', 'viaduct', v).lengte;
    wegen.push(new Weg('viaduct', 'viaduct', v, { hoogte: s => VIADUCT_HOOG * glad(klem(Math.min(s, lengte - s) / OPRIT, 0, 1)) }));
    for (const w of wegen) if (w.soort !== 'viaduct') for (const m of w.monsters) wegRaster.voeg(m, m.x, m.z, 0);
}
export const weg = naam => wegen.find(w => w.naam === naam);

// Asfalt, stoepranden, stoepen, strepen, zebrapaden, verkeerslichten, lantaarns, bomen, bankjes en geparkeerde auto's.
// Het asfalt van elke weg loopt helemaal door; wie voorgaat ligt er net boven, dus een kruising (of de rotonde) is
// één vlak. Stoepen houden precies op waar ander asfalt begint en lopen in de hoeken over elkaar door.
const opTerrein = (x, z, marge = 0) => [PAD, WERF, ...INRITTEN].some(g => binnen(g, x, z, marge));
function tekenWegen(r) {
    const lijnen = [], lampen = [], bomenLijst = [], geparkeerd = [], lichten = [], bankjes = [], bakken = [];
    const asfalt = strook(), stoep = strook(), band = strook();
    wegen.filter(w => w.soort !== 'viaduct' && w.soort !== 'park').forEach((w, i) => {
        const y = 0.03 + w.voorrang * 0.014 + i * 0.0004, stoepY = 0.13 + i * 0.0006, ly = y + 0.012;
        const naast = (m, d) => ({ x: m.x + m.rx * d, z: m.z + m.rz * d });
        const opAnder = (p, marge, min = 0) => { for (const [v, d] of langsWegen(p.x, p.z)) if (v !== w && v.voorrang >= min && d < marge) return v; return null; };
        const bijKruising = (m, extra) => opWeg(m.x, m.z, extra, w);
        lint(asfalt, w.monsters, m => -m.half, m => m.half, y, y);
        for (const kant of [-1, 1]) for (const stuk of stukken(w, m => {
            const buiten = naast(m, kant * (m.half + w.stoep));
            return !opAnder(naast(m, kant * (m.half + 0.1)), 0.3) && !opAnder(buiten, 0.3) && !opTerrein(buiten.x, buiten.z);
        })) {
            lint(band, stuk, m => kant * m.half, m => kant * m.half, y, 0.15); // stoeprand
            lint(band, stuk, m => kant * m.half, m => kant * (m.half + 0.2), 0.15, 0.15);
            lint(stoep, stuk, m => kant * (m.half + 0.2), m => kant * (m.half + w.stoep), stoepY, stoepY);
            lint(stoep, stuk, m => kant * (m.half + w.stoep), m => kant * (m.half + w.stoep), stoepY, 0);
        }
        // Strepen: waar een weg met voorrang ligt houden ze op, de strepen van die weg lopen door.
        const dr = m => -Math.atan2(m.tz, m.tx), streep = (m, zij, l, b = 0.14) => lijnen.push([m.x + m.rx * zij, m.z + m.rz * zij, dr(m), l, b, ly]);
        w.monsters.forEach((m, j) => {
            const dicht = !!bijKruising(m, 6);
            if (!opAnder(m, 6, w.voorrang)) {
                if (w.dubbel) { streep(m, -0.16, 3.05); streep(m, 0.16, 3.05); }
                else if (j % 3 === 0) streep(m, 0, 3);
                for (const zij of w.stroken) if (j % 3 === 0) streep(m, zij, 3);
            }
            if (w.parkeren && !bijKruising(m, 9)) for (const zij of [-1, 1]) streep(m, zij * (m.half - 2.5), 3.05, 0.12);
            if (w.kantstreep) for (const zij of [-1, 1]) if (!opAnder(naast(m, zij * (m.half - 0.33)), 0.3, 2)) streep(m, zij * (m.half - 0.33), 3.05, 0.15);
            // Lantaarns en bomen om de 30 m, hier en daar een bankje of een afvalbak, geparkeerde auto's langs de stoep.
            for (const kant of [-1, 1]) {
                const p = d => [m.x + m.rx * kant * d, m.z + m.rz * kant * d], vrij = d => !dicht && !opTerrein(...p(d), 1);
                if (j % 10 === (kant > 0 ? 0 : 5) && vrij(m.half + 0.8)) lampen.push([...p(m.half + 0.8), Math.atan2(-kant * m.rz, -kant * m.rx)]);
                if (w.stoep >= 3 && j % 10 === (kant > 0 ? 5 : 0) && r() < 0.8 && vrij(m.half + w.stoep - 1.2)) bomenLijst.push(boomUit(r)(...p(m.half + w.stoep - 1.2)));
                if (w.stoep >= 3 && j % 10 === (kant > 0 ? 7 : 2) && r() < 0.4 && vrij(m.half + w.stoep - 0.6)) (r() < 0.6 ? bankjes : bakken).push([...p(m.half + w.stoep - 0.6), Math.atan2(-kant * m.rx, -kant * m.rz)]);
                if (w.parkeren && !bijKruising(m, 9) && !opTerrein(...p(m.half - 1.25), 4) && j % 2 === 0 && r() < 0.22) geparkeerd.push([...p(m.half - 1.25), dr(m) + (kant > 0 ? 0 : Math.PI), AUTOKLEUREN[r() * AUTOKLEUREN.length | 0]]);
            }
        });
        // Zebrapad waar deze weg op een weg met voorrang uitkomt, in het verlengde van de stoep daarvan (bij de rotonde
        // wat verder terug), met een verkeerslicht rechts van wie aankomt.
        if (w.soort === 'rotonde') return;
        const tot = m => { // < 0: voorbij het zebrapad
            let min = Infinity, van = null;
            for (const [v, d] of langsWegen(m.x, m.z)) {
                const a = d - (v.soort === 'rotonde' ? 6 : v.stoep / 2 + 0.5);
                if (v !== w && v.voorrang >= w.voorrang && v.stoep && a < min) [min, van] = [a, v];
            }
            return [min, van];
        };
        let [vorige] = tot(w.monsters[0]);
        for (let j = 1; j < w.monsters.length; j++) {
            const [nu, v] = tot(w.monsters[j]);
            if (vorige < 0 !== nu < 0) {
                let a = w.monsters[j - 1].s, b = w.monsters[j].s;
                for (let k = 0; k < 8; k++) {
                    const s = (a + b) / 2;
                    if (tot(w.op(s))[0] < 0 === vorige < 0) a = s;
                    else b = s;
                }
                const n = w.op((a + b) / 2), kant = nu < 0 ? 1 : -1; // nu < 0: de kruising ligt verderop
                for (let d = -n.half + 1; d <= n.half - 1; d += 1.3) lijnen.push([n.x + n.rx * d, n.z + n.rz * d, dr(n), 3, 0.6, ly]);
                const l = w.op(n.s - kant * 2.5), buren = v || tot(w.monsters[j - 1])[1];
                if (w.licht && buren?.licht) lichten.push([l.x + l.rx * kant * (l.half + 1), l.z + l.rz * kant * (l.half + 1), r() < 0.5]);
            }
            vorige = nu;
        }
    });
    leg(asfalt, MAT.asfalt);
    leg(stoep, MAT.stoep);
    leg(band, MAT.band);
    // Verkeerslichten: paal, kast en één brandend licht.
    veel(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8).translate(0, 1.7, 0), M.donker, lichten, (p, [x, z]) => p.position.set(x, 0, z));
    veel(new THREE.BoxGeometry(0.35, 0.95, 0.35).translate(0, 3.6, 0), M.donker, lichten, (p, [x, z]) => p.position.set(x, 0, z));
    veel(new THREE.BoxGeometry(0.38, 0.22, 0.38).translate(0, 3.85, 0), M.rood, lichten.filter(l => l[2]), (p, [x, z]) => p.position.set(x, 0, z));
    veel(new THREE.BoxGeometry(0.38, 0.22, 0.38).translate(0, 3.35, 0), M.groen, lichten.filter(l => !l[2]), (p, [x, z]) => p.position.set(x, 0, z));
    lichten.forEach(([x, z]) => paal(x, z, 0.2, 4.2));
    // Bankjes (met de rug naar de gevels) en afvalbakken.
    const zet = (p, [x, z, d]) => {
        p.position.set(x, 0.13, z);
        p.rotation.y = d;
    };
    veel(new THREE.BoxGeometry(1.7, 0.08, 0.5).translate(0, 0.45, 0), M.hout, bankjes, zet);
    veel(new THREE.BoxGeometry(1.7, 0.42, 0.07).translate(0, 0.74, -0.24), M.hout, bankjes, zet);
    veel(new THREE.BoxGeometry(1.4, 0.42, 0.06).translate(0, 0.21, 0), M.donker, bankjes, zet);
    veel(new THREE.CylinderGeometry(0.26, 0.23, 0.95, 10).translate(0, 0.475, 0), mat('#3d6b4f'), bakken, zet);
    bankjes.forEach(([x, z, d]) => muur({ x, z, hoek: -d, hx: 0.85, hz: 0.3 }, 1.1));
    bakken.forEach(([x, z]) => paal(x, z, 0.26, 1.1));
    return { lijnen, lampen, bomenLijst, geparkeerd };
}

// Waar test(monster) klopt: stukken van de weg, met aan elk eind een punt precies op de grens (tussen twee monsters in).
function stukken(w, test) {
    const uit = [];
    let stuk = null, vorige = null;
    for (const m of w.monsters) {
        const ok = test(m);
        if (ok && !stuk) uit.push(stuk = vorige ? [grens(w, m.s, vorige.s, test)] : []);
        if (ok) stuk.push(m);
        else if (stuk) {
            stuk.push(grens(w, stuk[stuk.length - 1].s, m.s, test));
            stuk = null;
        }
        vorige = m;
    }
    return uit.filter(s => s.length > 1);
}
function grens(w, goed, fout, test) { // het laatste punt van goed naar fout waar test nog klopt
    for (let k = 0; k < 7; k++) {
        const s = (goed + fout) / 2;
        if (test(w.op(s))) goed = s;
        else fout = s;
    }
    return w.op(goed);
}
// Een strook langs een weg, van `van` tot `tot` meter opzij (getal of functie van het monster), langs de monsters in
// `lijst`; y1/y2 aan beide kanten (ook getal of functie): gelijk is een vlak, verschillend met van = tot een opstaande wand.
const strook = () => ({ pos: [], uv: [], idx: [] });
function lint(d, lijst, van, tot, y1, y2) {
    const eerste = d.pos.length / 3, maat = (v, m) => typeof v === 'function' ? v(m) : v;
    lijst.forEach((m, i) => {
        const a = maat(van, m), b = maat(tot, m);
        d.pos.push(m.x + m.rx * a, maat(y1, m), m.z + m.rz * a, m.x + m.rx * b, maat(y2, m), m.z + m.rz * b);
        d.uv.push(a, m.s, b, m.s);
        if (i) d.idx.push(eerste + 2 * i - 2, eerste + 2 * i - 1, eerste + 2 * i, eerste + 2 * i - 1, eerste + 2 * i + 1, eerste + 2 * i);
    });
}
function leg(d, materiaal, schaduw = false) {
    if (!d.idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    geo.setIndex(d.idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materiaal);
    m.receiveShadow = true;
    m.castShadow = schaduw;
    scene.add(m);
}

// Viaduct: dek met strepen en vangrails, dichte opritten, pijlers (niet op een weg) en lantaarns op het dek.
function tekenViaduct(lijnen, lampen) {
    const w = weg('viaduct'), bodem = m => m.h > 2.5 ? m.h - 0.9 : 0, laatste = w.monsters.length - 1;
    const dek = strook(), zijkant = strook(), rail = strook();
    lint(dek, w.monsters, -w.half, w.half, m => m.h + 0.02, m => m.h + 0.02);
    lint(dek, w.monsters, w.half, -w.half, bodem, bodem); // onderkant
    for (const kant of [-1, 1]) {
        lint(zijkant, w.monsters, kant * w.half, kant * w.half, bodem, m => m.h + 0.02);
        lint(rail, w.monsters, kant * (w.half - 0.15), kant * (w.half - 0.15), m => m.h, m => m.h + 1);
    }
    leg(dek, MAT.asfalt, true);
    leg(zijkant, MAT.beton, true);
    const railMat = new THREE.MeshLambertMaterial({ color: '#9aa1a8', side: THREE.DoubleSide });
    leg(rail, railMat, true);
    const dr = m => -Math.atan2(m.tz, m.tx);
    w.monsters.forEach((m, j) => {
        if (j % 3 === 0) lijnen.push([m.x, m.z, dr(m), 3, 0.15, m.h + 0.035]);
        for (const kant of [-1, 1]) lijnen.push([m.x + m.rx * kant * (w.half - 0.8), m.z + m.rz * kant * (w.half - 0.8), dr(m), 3.05, 0.14, m.h + 0.035]);
        if (j % 12 === 6 && m.h > 1) { const kant = j % 24 === 6 ? 1 : -1; lampen.push([m.x + m.rx * kant * (w.half - 0.4), m.z + m.rz * kant * (w.half - 0.4), Math.atan2(-kant * m.rz, -kant * m.rx), m.h]); }
    });
    // Voor botsen en rijden: stukjes van 3 m, elk een blok dat van de ene hoogte naar de volgende loopt.
    for (let j = 0; j < laatste; j++) {
        const a = w.monsters[j], b = w.monsters[j + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, draai = -Math.atan2(b.z - a.z, b.x - a.x);
        const lengte = Math.hypot(b.x - a.x, b.z - a.z) + 0.4, onder = Math.min(bodem(a), bodem(b));
        blok(mx, mz, draai, lengte, 2 * w.half, a.h, b.h, { bodem: onder, zichtbaar: false });
        for (const kant of [-1, 1]) {
            const rx = (a.rx + b.rx) / 2 * kant * (w.half - 0.15), rz = (a.rz + b.rz) / 2 * kant * (w.half - 0.15);
            blok(mx + rx, mz + rz, draai, lengte, 0.3, a.h + 1, b.h + 1, { bodem: Math.min(a.h, b.h), zichtbaar: false });
        }
    }
    // Pijlers: waar het dek hoog is en er geen weg onder ligt.
    const pijlers = w.monsters.filter((m, j) => j % 8 === 4 && m.h > 5 && !opWeg(m.x, m.z, 2.5));
    veel(new THREE.BoxGeometry(1.6, 1, 1.6).translate(0, 0.5, 0), MAT.beton, pijlers, (p, m) => {
        p.position.set(m.x, 0, m.z);
        p.scale.set(1, m.h - 0.9, 1);
    });
    veel(new THREE.BoxGeometry(1.2, 0.6, 2 * w.half - 1).translate(0, -0.3, 0), MAT.beton, pijlers, (p, m) => {
        p.position.set(m.x, m.h - 0.9, m.z);
        p.rotation.y = -Math.atan2(m.tz, m.tx);
    });
    pijlers.forEach(m => paal(m.x, m.z, 0.8, m.h - 0.9));
}

// ---------------------------------------------------------------------------
// Gebouwen langs de wegen: centrum hoog, stad middelhoog, in de wijken huisjes met een tuintje
// ---------------------------------------------------------------------------

const gebouwRaster = new Raster(30);
function overlapt(a, b, marge) { // twee gedraaide rechthoeken (scheidende assen)
    const assen = [a.hoek, a.hoek + Math.PI / 2, b.hoek, b.hoek + Math.PI / 2];
    for (const h of assen) {
        const c = Math.cos(h), s = Math.sin(h), proj = o => {
            const m = o.x * c + o.z * s, r = Math.abs(o.hx * Math.cos(o.hoek - h)) + Math.abs(o.hz * Math.sin(o.hoek - h));
            return [m - r, m + r];
        };
        const [a0, a1] = proj(a), [b0, b1] = proj(b);
        if (a1 + marge < b0 || b1 + marge < a0) return false;
    }
    return true;
}
const hoeken = o => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([i, j]) => [o.x + i * o.hx * Math.cos(o.hoek) - j * o.hz * Math.sin(o.hoek), o.z + i * o.hx * Math.sin(o.hoek) + j * o.hz * Math.cos(o.hoek)]);
function vrijePlek(o, extra = 0) {
    const viaduct = weg('viaduct');
    for (const [x, z] of hoeken(o)) {
        if (x < GRENS[0] + 10 || x > GRENS[1] - 10 || z < GRENS[2] + 10 || z > -340) return false;
        if (opWeg(x, z, 0)) return false;
        if ([PAD, WERF, GARAGE, TANKSTATION, ...INRITTEN].some(g => binnen(g, x, z, 4 + extra))) return false;
        if (Math.hypot(x - CENTRUM[0], z - CENTRUM[1]) < 38) return false;
        for (const m of viaduct.monsters) if (Math.abs(m.x - x) < 20 && Math.abs(m.z - z) < 20 && Math.hypot(m.x - x, m.z - z) < viaduct.half + 5) return false;
    }
    // Van de stoep af: niemand staat binnen half + stoep van een weg.
    for (const [x, z] of hoeken(o)) {
        const m = opWeg(x, z, 3.5);
        if (m && Math.hypot(m.x - x, m.z - z) < m.half + m.weg.stoep + 0.8) return false;
    }
    let vrij = true;
    gebouwRaster.rond(o.x, o.z, o.hx + o.hz + 30, b => { if (vrij && overlapt(o, b, 1.5)) vrij = false; });
    return vrij;
}
const wijk = (x, z) => {
    const d = Math.hypot(x - CENTRUM[0], z - CENTRUM[1]);
    return d < 150 ? 'centrum' : x < -85 || z < -700 ? 'wijk' : 'stad';
};
const huisVormen = []; // voor de minikaart
function bouwLangsWegen(r) {
    const huizen = [], tuinbomen = [];
    const kantoor = (o, draai, soort) => { // doos met ramen, op het dak een opbouw of een paar kastjes
        const hoog = soort === 'centrum' ? 22 + r() * r() * 55 : 9 + r() * r() * 26, kleur = new THREE.Color(GEVELS[r() * GEVELS.length | 0]);
        gebouwRaster.voeg(o, o.x, o.z, o.hx + o.hz);
        muur(o, hoog);
        M.gebouwen.doos(o.x, o.z, draai, 2 * o.hx, 2 * o.hz, hoog, 0, kleur);
        if (hoog > 28 && r() < 0.6) M.gebouwen.doos(o.x, o.z, draai, o.hx * 1.3, o.hz * 1.3, 4 + r() * 8, hoog, new THREE.Color('#cfd4da'));
        else for (let k = r() * 3 | 0; k > 0; k--) {
            const [kx, kz] = lokaal(o.x, o.z, draai, (r() - 0.5) * o.hx, (r() - 0.5) * o.hz);
            M.gebouwen.doos(kx, kz, draai, 2, 1.6, 1.2, hoog, new THREE.Color('#9aa1a8'), true);
        }
    };
    for (const w of wegen) {
        if (!['ring', 'laan', 'straat'].includes(w.soort)) continue;
        for (const kant of [-1, 1]) for (let s = 4; s < w.lengte - 4;) {
            const m = w.op(s), soort = wijk(m.x, m.z), huis = soort === 'wijk';
            const b = huis ? 10 + r() * 4 : 13 + r() * 13, d = huis ? 9 + r() * 2 : soort === 'centrum' ? 16 + r() * 10 : 13 + r() * 8;
            const midden = w.op(s + b / 2), afstand = w.half + w.stoep + (huis ? 4 + r() * 3 : 1.5) + d / 2, hoek = Math.atan2(midden.tz, midden.tx);
            const op = afstand => ({ x: midden.x + midden.rx * kant * afstand, z: midden.z + midden.rz * kant * afstand, hoek, hx: b / 2 - 0.4, hz: d / 2 });
            const o = op(afstand), draai = -hoek + (kant > 0 ? Math.PI : 0); // voorkant (lokaal +z) naar de weg
            s += b;
            if (r() < 0.06 || !vrijePlek(o, huis ? 1 : 0)) continue;
            if (huis) {
                gebouwRaster.voeg(o, o.x, o.z, o.hx + o.hz);
                huizen.push([o.x, o.z, draai, 2 * o.hx, 2 * o.hz, 3 + r() * 1.5, ['#e8dcc8', '#d9e3ea', '#f0d9d2', '#dfe8d5', '#ece5c9', '#d8cfc4'][r() * 6 | 0], ['#8e3b32', '#5b6470', '#7a4a36', '#3e4a55'][r() * 4 | 0]]);
                huisVormen.push(o);
                if (r() < 0.6) tuinbomen.push(boomUit(r)(...lokaal(o.x, o.z, draai, (r() - 0.5) * b * 0.6, d / 2 + 2.5))); // voortuin
                for (let k = 1 + (r() * 2 | 0); k > 0; k--) tuinbomen.push(boomUit(r)(...lokaal(o.x, o.z, draai, (r() - 0.5) * b * 0.8, -d / 2 - 4 - r() * 8))); // achtertuin
                const d2 = 9 + r() * 2, o2 = { ...op(afstand + d / 2 + 14 + d2 / 2), hz: d2 / 2 }; // een rij erachter, tuinen tegen elkaar
                if (r() < 0.75 && vrijePlek(o2, 1)) {
                    gebouwRaster.voeg(o2, o2.x, o2.z, o2.hx + o2.hz);
                    huizen.push([o2.x, o2.z, draai, 2 * o2.hx, 2 * o2.hz, 3 + r() * 1.5, ['#e8dcc8', '#d9e3ea', '#f0d9d2', '#dfe8d5', '#ece5c9', '#d8cfc4'][r() * 6 | 0], ['#8e3b32', '#5b6470', '#7a4a36', '#3e4a55'][r() * 4 | 0]]);
                    huisVormen.push(o2);
                }
                continue;
            }
            kantoor(o, draai, soort);
            // Rijen erachter, tot het blok vol is: een steeg van 4 m ertussen.
            let verder = afstand, diepte = d;
            for (let rij = 1; rij < 4; rij++) {
                const d2 = 13 + r() * 10, o2 = { ...op(verder + diepte / 2 + 4 + d2 / 2), hz: d2 / 2 };
                if (!vrijePlek(o2)) break;
                kantoor(o2, draai, soort);
                verder += diepte / 2 + 4 + d2 / 2;
                diepte = d2;
            }
        }
    }
    huisjes(huizen);
    bomen(tuinbomen.filter(([x, z]) => { // niet op een weg of in een ander huis
        if (opWeg(x, z, 2)) return false;
        let vrij = true;
        gebouwRaster.rond(x, z, 30, o => { if (vrij && Math.abs((x - o.x) * Math.cos(o.hoek) + (z - o.z) * Math.sin(o.hoek)) < o.hx + 1 && Math.abs(-(x - o.x) * Math.sin(o.hoek) + (z - o.z) * Math.cos(o.hoek)) < o.hz + 1) vrij = false; });
        return vrij;
    }));
}

// ---------------------------------------------------------------------------
// Bijzondere plekken in de stad: rotonde, parkeerterrein met garage, tankstation
// ---------------------------------------------------------------------------

function rotondeMidden(r) {
    const [cx, cz] = CENTRUM;
    plat(new THREE.CircleGeometry(20.5, 48), MAT.gazon, cx, cz, 0.05);
    const bak = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.2, 0.7, 40), MAT.beton), water = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.1, 40), M.water);
    const zuil = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 16), MAT.beton), schaal = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.9, 0.4, 24), MAT.beton);
    bak.position.set(cx, 0.35, cz);
    water.position.set(cx, 0.62, cz);
    zuil.position.set(cx, 1.3, cz);
    schaal.position.set(cx, 2.7, cz);
    for (const m of [bak, water, zuil, schaal]) {
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
    }
    for (const a of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) muur({ x: cx, z: cz, hoek: a, hx: 5.9, hz: 2.5 }, 3); // rond, ongeveer
    const b = boomUit(r);
    bomen(Array.from({ length: 8 }, (_, i) => b(cx + 14 * Math.cos(i * Math.PI / 4 + 0.4), cz + 14 * Math.sin(i * Math.PI / 4 + 0.4))));
}

const rechthoek = ([x1, z1, x2, z2]) => vorm([[x1, z1], [x2, z1], [x2, z2], [x1, z2]]);
function parkeerGarage(r, lijnen) {
    const [x1, z1, x2, z2] = GARAGE;
    plat(vorm([[x1, z1], [x2, z1], [x2, z2], [x1, z2]]), MAT.asfalt, 0, 0, 0.03);
    plat(rechthoek(INRITTEN[1]), MAT.asfalt, 0, 0, 0.029); // naar de laan
    // Parkeerplaatsen in het zuidelijke deel, dwars; een rij auto's.
    const auto = [];
    for (const rij of [-574, -592]) for (let x = x1 + 4; x < x2 - 3; x += 3) {
        lijnen.push([x - 1.5, rij, Math.PI / 2, 5, 0.12, 0.045]);
        if (r() < 0.55) auto.push([x, rij, Math.PI / 2 + (r() < 0.5 ? 0 : Math.PI), AUTOKLEUREN[r() * AUTOKLEUREN.length | 0]]);
    }
    autos(auto);
    // Garage van 8 m hoog; langs de oostkant een helling naar het dak.
    const gx = -47.5, gz = -630, gb = 45, gd = 50;
    blok(gx, gz, 0, gb, gd, 8);
    for (const y of [2.6, 5.3]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(gb + 0.1, 1.1, gd + 0.1), M.donker);
        band.position.set(gx, y, gz);
        scene.add(band);
    }
    blok(gx + gb / 2 + 3.5, gz + gd / 2 - 22.5, Math.PI / 2, 45, 7, 0, 8); // van zuid naar noord omhoog, tot bij de noordrand
    blok(gx + gb / 2 + 3.5, gz - gd / 2 + 2.5, 0, 7, 5, 8); // bovenaan een stukje plat, dan het dak op
}

function tankstation(r) {
    const [x1, z1, x2, z2] = TANKSTATION, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    plat(vorm([[x1, z1], [x2, z1], [x2, z2], [x1, z2]]), MAT.beton, 0, 0, 0.03);
    plat(rechthoek(INRITTEN[2]), MAT.beton, 0, 0, 0.029); // naar de laan
    const dak = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 12), new THREE.MeshLambertMaterial({ color: '#e8e8e8' }));
    dak.position.set(mx, 5.2, mz + 4);
    const rand = new THREE.Mesh(new THREE.BoxGeometry(22.2, 0.5, 12.2), new THREE.MeshBasicMaterial({ color: '#d4101a' }));
    rand.position.set(mx, 4.7, mz + 4);
    for (const m of [dak, rand]) {
        m.castShadow = true;
        scene.add(m);
    }
    const palen = [[mx - 9, mz], [mx + 9, mz], [mx - 9, mz + 8], [mx + 9, mz + 8]], pompen = [[mx - 4, mz + 4], [mx + 4, mz + 4]];
    veel(new THREE.BoxGeometry(0.5, 4.8, 0.5).translate(0, 2.4, 0), M.grijs, palen, (p, [x, z]) => p.position.set(x, 0, z));
    veel(new THREE.BoxGeometry(1, 1.6, 0.6).translate(0, 0.8, 0), mat('#d4101a'), pompen, (p, [x, z]) => p.position.set(x, 0, z));
    palen.forEach(([x, z]) => paal(x, z, 0.3, 5));
    pompen.forEach(([x, z]) => muur({ x, z, hoek: 0, hx: 0.6, hz: 0.4 }, 1.6));
    M.gebouwen.doos(mx, z1 + 5, 0, 16, 8, 4.2, 0, new THREE.Color('#e4dfd6'));
    muur({ x: mx, z: z1 + 5, hoek: 0, hx: 8, hz: 4 }, 4.2);
}

// ---------------------------------------------------------------------------
// Driftpark en bedrijfsterrein
// ---------------------------------------------------------------------------

let kegels = [];
let kegelDelen = [], heftruckRijdt = null;

function driftpark(r) {
    const [x1, z1, x2, z2] = PAD, boom = boomUit(r);
    plat(vorm([[x1, z1], [x2, z1], [x2, z2], [x1, z2]]), MAT.asfalt, 0, 0, 0.022);
    plat(vorm([[-8, z2 + 1], [12, z2 + 1], [12, -149], [-8, -149]]), MAT.asfalt, 0, 0, 0.019); // van de straat door de poort
    const lijnen = [[(x1 + x2) / 2, z1 + 1, 0, x2 - x1 - 2, 0.25], [(x1 + x2) / 2, z2 - 1, 0, x2 - x1 - 2, 0.25],
        [x1 + 1, (z1 + z2) / 2, Math.PI / 2, z2 - z1 - 2, 0.25], [x2 - 1, (z1 + z2) / 2, Math.PI / 2, z2 - z1 - 2, 0.25]];
    const ring = (x, z, straal) => {
        plat(new THREE.RingGeometry(straal - 0.15, straal + 0.15, 96), MAT.streep, x, z, 0.034);
        kaartRingen.push([x, z, straal]);
    };
    const kegel = (x, z) => kegels.push({ x, z, x0: x, z0: z, vx: 0, vz: 0, kant: 0, richting: 0, valt: false });
    const cirkelVan = (x, z, straal, n, doe) => { for (let i = 0; i < n; i++) doe(x + straal * Math.cos(i / n * 2 * Math.PI), z + straal * Math.sin(i / n * 2 * Math.PI)); };
    const stapels = [];

    // Donuts: om een grote heftruck, om twee stapels banden, en klein om één stapel.
    ring(-95, -205, 18);
    heftruck(-97.6, -205, 0, 2.2);
    cirkelVan(-95, -205, 26, 24, kegel);
    ring(-45, -212, 14);
    stapels.push([-45.6, -212], [-44.4, -212]);
    cirkelVan(-45, -212, 21, 22, kegel);
    ring(-8, -180, 7);
    stapels.push([-8, -180]);
    cirkelVan(-8, -180, 11, 14, kegel);
    // Een grote acht om twee eilandjes.
    for (const x of [42, 94]) {
        ring(x, -198, 26);
        stapels.push([x, -198]);
        cirkelVan(x, -198, 3.5, 7, kegel);
    }
    // Rondbaan met pylonen binnen en buiten, banden in de buitenbochten, een slalom en een geblokte startstreep.
    const recht = BAAN.x2 - BAAN.x1;
    const stadion = (straal, stap, doe) => {
        for (let t = 0; t < 2 * recht + 2 * Math.PI * straal; t += stap) {
            const bocht = (t - recht) / straal, terug = t - recht - Math.PI * straal;
            if (t < recht) doe(BAAN.x1 + t, BAAN.z + straal);
            else if (terug < 0) doe(BAAN.x2 + straal * Math.cos(Math.PI / 2 - bocht), BAAN.z + straal * Math.sin(Math.PI / 2 - bocht));
            else if (terug < recht) doe(BAAN.x2 - terug, BAAN.z - straal);
            else { const a = -Math.PI / 2 - (terug - recht) / straal; doe(BAAN.x1 + straal * Math.cos(a), BAAN.z + straal * Math.sin(a)); }
        }
    };
    stadion(BAAN.r - 7, 6, kegel);
    stadion(BAAN.r + 7, 7, kegel);
    for (let x = 5; x <= 53; x += 12) kegel(x, BAAN.z + BAAN.r);
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) stapels.push([BAAN.x2 + (BAAN.r + 10) * Math.cos(a), BAAN.z + (BAAN.r + 10) * Math.sin(a)], [BAAN.x1 - (BAAN.r + 10) * Math.cos(a), BAAN.z + (BAAN.r + 10) * Math.sin(a)]);
    const blokjes = textuur(doek(64, 512, g => {
        for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
            g.fillStyle = (i + j) % 2 ? '#1b1d21' : '#f4f4f4';
            g.fillRect(j * 32, i * 32, 32, 32);
        }
    }));
    plat(new THREE.PlaneGeometry(1.5, 14), new THREE.MeshLambertMaterial({ map: blokjes }), BAAN.start, BAAN.z + BAAN.r, 0.036);

    // Sprongen op een rij, 12 m breed: een kleine schans, een schans over vier containers met een landing erachter
    // (te langzaam? dan land je op de containers), en een tafel.
    const rij = -241;
    schans(-8, rij, 0, 7, 12, 1.3);
    schans(18, rij, 0, 12, 12, 3);
    containers([[25.22, rij - 3.03, 90, 1, '#2f6aa8'], [27.66, rij - 3.03, 90, 1, '#b83a2e'], [25.22, rij + 3.03, 90, 1, '#d9822b'], [27.66, rij + 3.03, 90, 1, '#2f8a5a']], r);
    blok(35.88, rij, 0, 14, 12, 3, 0);
    blok(66, rij, 0, 8, 12, 0, 1.8);
    blok(76, rij, 0, 12, 12, 1.8);
    blok(86, rij, 0, 8, 12, 1.8, 0);
    // Containerbrug langs de oostkant: drie rijen breed, vier lang, met een helling aan elk eind.
    const brug = [];
    for (const x of [121.78, 124.22, 126.66]) for (const z of [-276.03, -282.09, -288.15, -294.21]) brug.push([x, z, 90, 1]);
    containers(brug, r);
    blok(124.22, -266, Math.PI / 2, 14, 7.32, 0, 2.6); // zuidkant: oplopend naar het noorden
    blok(124.22, -304.24, Math.PI / 2, 14, 7.32, 2.6, 0); // noordkant: weer omlaag
    // Containers langs de randen (in het oosten een opening naar het bedrijfsterrein).
    const rand = [];
    for (const z of [-170, -176.5, -250, -256.5, -300, -306.5, -325]) rand.push([x1 + 3.5, z, 90, r() < 0.35 ? 2 : 1]);
    for (const z of [-165, -171.5, -215, -221.5, -240]) rand.push([x2 - 3.5, z, 90, r() < 0.4 ? 2 : 1]);
    containers(rand, r);
    for (let x = 25; x <= 75; x += 2.2) stapels.push([x, z2 - 3]);
    bandenstapels(stapels);
    strepen(lijnen);

    // Een poort bij de inrit, lichtmasten, bomen en huisjes aan de zuidkant.
    const bord = textuur(doek(512, 96, g => {
        g.fillStyle = '#1b1d21';
        g.fillRect(0, 0, 512, 96);
        for (let i = 0; i < 32; i++) {
            g.fillStyle = i % 2 ? '#f4f4f4' : '#d4101a';
            g.fillRect(i * 16, 0, 16, 10);
            g.fillRect(i * 16, 86, 16, 10);
        }
        g.fillStyle = '#fff';
        g.font = '800 54px Figtree, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('DRIFTPARK', 256, 50);
    }));
    const poort = new THREE.Mesh(new THREE.BoxGeometry(16, 2.4, 0.3), [M.donker, M.donker, M.donker, M.donker, new THREE.MeshBasicMaterial({ map: bord }), new THREE.MeshBasicMaterial({ map: bord })]);
    poort.position.set(2, 6.2, z2 + 1.5);
    scene.add(poort);
    for (const x of [-6.3, 10.3]) {
        const paaltje = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.4, 0.4), M.donker);
        paaltje.position.set(x, 3.7, z2 + 1.5);
        paaltje.castShadow = true;
        scene.add(paaltje);
        paal(x, z2 + 1.5, 0.25, 7.4);
    }
    lantaarns([[x1 + 1.5, z1 + 1.5, Math.PI / 4], [x2 - 1.5, z1 + 1.5, 3 * Math.PI / 4], [x1 + 1.5, z2 - 1.5, -Math.PI / 4],
        [x2 - 1.5, z2 - 1.5, -3 * Math.PI / 4], [x1 + 1.5, -245, 0], [x2 - 1.5, -262, Math.PI]], 1.6);
    const lijst = [];
    for (let z = z1; z < z2; z += 7 + r() * 6) lijst.push(boom(x1 - 8 - r() * 12, z));
    for (let z = WERF[1] - 10; z < WERF[3] + 10; z += 7 + r() * 6) lijst.push(boom(WERF[2] + 8 + r() * 10, z));
    bomen(lijst.filter(([x, z]) => !opWeg(x, z, 4)));
    const huizen = [[46, -127, Math.PI, 8, 6.5, 3.2], [64, -126, Math.PI, 9, 7, 3.4], [82, -127, Math.PI, 7, 6, 3]]; // aan de hoofdweg
    huisjes(huizen.map(h => [...h, ['#e8dcc8', '#d9e3ea', '#f0d9d2'][r() * 3 | 0], ['#8e3b32', '#5b6470', '#7a4a36'][r() * 3 | 0]]));

    // Pylonen: oranje met een witte band, op een zwarte voet. Omver te rijden.
    kegelDelen = [[new THREE.ConeGeometry(0.19, 0.6, 14).translate(0, 0.35, 0), mat('#f07a1a')],
        [new THREE.CylinderGeometry(0.11, 0.135, 0.11, 14).translate(0, 0.33, 0), mat('#ffffff')],
        [new THREE.BoxGeometry(0.44, 0.05, 0.44).translate(0, 0.025, 0), mat('#2b2b2b')]]
        .map(([geo, materiaal]) => veel(geo, materiaal, kegels, (p, k) => p.position.set(k.x, 0, k.z), { beweeglijk: true }));
}

function bedrijfsterrein(r) {
    const [w1, v1, w2, v2] = WERF, [d1, e1, d2, e2] = DOORRIT;
    plat(vorm([[w1, v1], [w2, v1], [w2, v2], [w1, v2]]), MAT.beton, 0, 0, 0.022);
    plat(vorm([[d1, e1], [d2, e1], [d2, e2], [d1, e2]]), MAT.beton, 0, 0, 0.021); // dwars over de hoofdweg naar het driftpark
    blok(261, -212, 0, 28, 36, 10, 10, { materiaal: M.loods });
    for (const z of [-202, -222]) {
        const deur = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.5, 5), M.donker);
        deur.position.set(246.95, 2.25, z);
        scene.add(deur);
    }
    heftruck(230, -172, 0.4);
    heftruck(263, -182, Math.PI);
    heftruck(222, -234, Math.PI / 2);
    heftruckRijdt = { ...heftruck(HEFTRUCK_X, -202, 0), t: 0 };
    const pallets = [];
    for (let x = 220; x <= 238; x += 4.5) for (let z = -214; z >= -230; z -= 4) if (r() < 0.7) pallets.push([x, z, r() * 0.3, 1 + (r() * 3 | 0)]);
    veel(new THREE.BoxGeometry(1.2, 0.14, 1.0).translate(0, 0.07, 0), M.hout, pallets, (p, [x, z, d]) => {
        p.position.set(x, 0, z);
        p.rotation.y = d;
    });
    veel(BAND, M.zwart, pallets.flatMap(p => Array.from({ length: p[3] }, (_, k) => [p, k])), (p, [[x, z], k]) => p.position.set(x, 0.3 + k * 0.32, z));
    pallets.forEach(([x, z, , n]) => paal(x, z, 0.65, 0.2 + n * 0.32));
    containers([[270, -168, 0, 2], [255, -168, 0, 1], [270, -236, 0, 1]], r);
}
const HEFTRUCK_X = 220; // de heftruck die heen en weer rijdt, van hier tot 21 m oostelijker (bij de deur van de loods)

// ---------------------------------------------------------------------------
// Aankleding: houtwallen om de akkers (AKKERS: script.js), parkjes tussen de gebouwen, bos langs de rand en heuvels
// erachter
// ---------------------------------------------------------------------------

function aankleden(r) {
    const boom = boomUit(r), lijst = [];
    const vrij = (x, z) => { // geen weg, terrein, gebouw of ander obstakel in de buurt
        if (opWeg(x, z, 5) || [PAD, WERF, GARAGE, TANKSTATION, ...INRITTEN].some(g => binnen(g, x, z, 5)) || AKKERS.some(a => binnen(a, x, z, 1))) return false;
        if (binnen([tx1, tz1, tx2, tz2], x, z, 70) || Math.hypot(x - CENTRUM[0], z - CENTRUM[1]) < 36) return false;
        let leeg = true;
        obstakelsRond(x, z, 3, o => {
            const c = Math.cos(o.hoek), s = Math.sin(o.hoek), dx = x - o.x, dz = z - o.z;
            if (leeg && Math.abs(dx * c + dz * s) < o.hx + 2.5 && Math.abs(-dx * s + dz * c) < o.hz + 2.5) leeg = false;
        });
        return leeg;
    };
    for (const [x1, z1, x2, z2] of AKKERS) {
        const rand = (xa, za, xb, zb) => { // houtwal
            const l = Math.hypot(xb - xa, zb - za);
            for (let t = 0; t < l; t += 5 + r() * 3) {
                const x = xa + (xb - xa) * t / l + (r() - 0.5) * 2, z = za + (zb - za) * t / l + (r() - 0.5) * 2;
                if (r() < 0.7 && vrij(x, z)) lijst.push(boom(x, z));
            }
        };
        rand(x1 - 3, z1 - 3, x2 + 3, z1 - 3);
        rand(x1 - 3, z2 + 3, x2 + 3, z2 + 3);
        rand(x1 - 3, z1 - 3, x1 - 3, z2 + 3);
        rand(x2 + 3, z1 - 3, x2 + 3, z2 + 3);
    }
    // Overal waar plek is: parkjes en bosjes (golvend verdeeld), dicht bos langs de rand, ook buiten bereik.
    const [g1, g2, g3, g4] = GRENS, buiten = 70;
    for (let x = g1 - buiten; x < g2 + buiten; x += 8) for (let z = g3 - buiten; z < g4 + buiten; z += 8) {
        const px = x + (r() - 0.5) * 6, pz = z + (r() - 0.5) * 6, rand = Math.min(px - g1, g2 - px, pz - g3, g4 - pz);
        const golf = Math.sin(px / 37 + 1.3) + Math.sin(pz / 29 - 0.7) + Math.sin((px - pz) / 61);
        const kans = rand < 0 ? 0.7 : rand < 25 ? 0.8 : golf > 1.2 ? 0.7 : golf > 0 ? 0.16 : 0.04;
        if (r() < kans && vrij(px, pz)) lijst.push(boom(px, pz));
    }
    bomen(lijst);
    // Heuvels in de verte (alleen om te zien).
    const [cx, cz, bx, bz] = [(g1 + g2) / 2, (g3 + g4) / 2, (g2 - g1) / 2, (g4 - g3) / 2], heuvels = [];
    for (let i = 0; i < 46; i++) {
        const a = (i + r() * 0.6) / 46 * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a), rand = Math.min(bx / Math.abs(c || 1e-6), bz / Math.abs(s || 1e-6)) + 120 + r() * 170;
        heuvels.push([cx + c * rand, cz + s * rand, 70 + r() * 90, 14 + r() * 30, 70 + r() * 90, r() * Math.PI]);
    }
    const bol = new THREE.IcosahedronGeometry(1, 2);
    bol.computeVertexNormals(); // per vlak: hoekig
    veel(bol, MAT.heuvel, heuvels, (p, [x, z, sx, sy, sz, d]) => {
        p.position.set(x, -2, z);
        p.rotation.y = d;
        p.scale.set(sx, sy, sz);
    }, { schaduw: false });
}

// ---------------------------------------------------------------------------
// Alles bouwen (één keer), en wat er beweegt
// ---------------------------------------------------------------------------

export let kaart = null; // plattegrond voor de minikaart: { beeld (canvas), x0, z0 } (1 px = 1 m)
let gebouwd = false;
export function bouwWereld() {
    if (gebouwd) return;
    gebouwd = true;
    const r = zaad(2024);
    materialen();
    maakWegen();
    const { lijnen, lampen, bomenLijst, geparkeerd } = tekenWegen(r);
    tekenViaduct(lijnen, lampen);
    rotondeMidden(r);
    parkeerGarage(r, lijnen);
    tankstation(r);
    bouwLangsWegen(r);
    driftpark(r);
    bedrijfsterrein(r);
    for (const o of omgevingObstakels) muur(o, 7); // bomen en lantaarns bij het park en langs de straat (omgeving.js)
    strepen(lijnen);
    lantaarns(lampen);
    bomen(bomenLijst.filter(([x, z]) => !opWeg(x, z, 0.5)));
    autos(geparkeerd);
    aankleden(r);
    plantBomen();
    M.gebouwen.klaar();
    ramenAan(donker);
    kaart = tekenKaart();
}

// Het park zelf (containers, gebouw, wagen en voorbeeldvoertuigen) om tegen te botsen: rechthoeken van bovenaf.
export function parkObstakels() {
    const bovenste = m => { while (m.parent !== scene) m = m.parent; return m; };
    const geparkeerd = klikbaar.filter(m => VOERTUIGTYPES.includes(m.userData.id)).map(bovenste);
    for (const o of new Set([...alleBoxen, gebouw, wagen3d, ...geparkeerd])) {
        const draai = o.rotation.y, plek = o.position.clone();
        o.rotation.y = 0;
        o.position.set(0, 0, 0);
        const b = new THREE.Box3().setFromObject(o);
        o.rotation.y = draai;
        o.position.copy(plek);
        o.updateMatrixWorld(true);
        const hoek = -draai, mx = (b.min.x + b.max.x) / 2, mz = (b.min.z + b.max.z) / 2;
        muur({ x: plek.x + mx * Math.cos(hoek) - mz * Math.sin(hoek), z: plek.z + mx * Math.sin(hoek) + mz * Math.cos(hoek), hoek, hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2 }, b.max.y);
    }
}

// Pylonen die je raakt schuiven weg en vallen om als je harder dan stapvoets rijdt; kom je terug op het driftpark,
// dan staan ze weer rechtop. De heftruck op het bedrijfsterrein rijdt heen en weer met een pallet.
const kegelPop = new THREE.Object3D();
kegelPop.rotation.order = 'YZX';
function zetKegel(k, i) {
    kegelPop.position.set(k.x, 0, k.z);
    kegelPop.rotation.set(0, -k.richting, -k.kant);
    kegelPop.updateMatrix();
    kegelDelen.forEach(m => m.setMatrixAt(i, kegelPop.matrix));
}
let opDriftpark = false;
export function rekwisietenStap(a, dt) {
    const hier = binnen(PAD, a.x, a.z, 30);
    if (hier && !opDriftpark) {
        kegels.forEach((k, i) => {
            Object.assign(k, { x: k.x0, z: k.z0, vx: 0, vz: 0, kant: 0, richting: 0, valt: false });
            zetKegel(k, i);
        });
        kegelDelen.forEach(m => { m.instanceMatrix.needsUpdate = true; });
    }
    opDriftpark = hier;
    let bewogen = false;
    kegels.forEach((k, i) => {
        if (a.y < 0.7 && Math.abs(k.x - a.x) < 4 && Math.abs(k.z - a.z) < 4) for (const d of [-1.2, 1.2]) {
            const cx = a.x + Math.cos(a.hoek) * d, cz = a.z + Math.sin(a.hoek) * d, dx = k.x - cx, dz = k.z - cz, afstand = Math.hypot(dx, dz);
            if (afstand >= 1.1 || afstand < 1e-4) continue;
            const v = Math.hypot(a.vx, a.vz), nx = dx / afstand, nz = dz / afstand;
            k.x = cx + nx * 1.1;
            k.z = cz + nz * 1.1;
            k.vx = a.vx * 1.1 + nx * (1 + v * 0.25) + Math.random() - 0.5;
            k.vz = a.vz * 1.1 + nz * (1 + v * 0.25) + Math.random() - 0.5;
            k.richting = Math.atan2(k.vz, k.vx);
            k.valt ||= v > 2.5;
            a.vx *= 0.985;
            a.vz *= 0.985;
        }
        if (!k.vx && !k.vz && (!k.valt || k.kant >= 1.25)) return;
        k.x += k.vx * dt;
        k.z += k.vz * dt;
        const rem = Math.exp(-(k.valt ? 3 : 5) * dt);
        k.vx *= rem;
        k.vz *= rem;
        if (Math.hypot(k.vx, k.vz) < 0.05) k.vx = k.vz = 0;
        if (k.valt) k.kant = Math.min(1.25, k.kant + dt * 6);
        zetKegel(k, i);
        bewogen = true;
    });
    if (bewogen) kegelDelen.forEach(m => { m.instanceMatrix.needsUpdate = true; });
    const h = heftruckRijdt;
    h.t = (h.t + dt) % 24;
    const t = h.t, heen = t < 8 ? glad(t / 8) : t < 12 ? 1 : t < 20 ? 1 - glad((t - 12) / 8) : 0;
    h.groep.position.x = HEFTRUCK_X + 21 * heen;
    h.o.x = h.groep.position.x + 0.5;
    h.groep.userData.vork.position.y = 0.15 + (t >= 8 && t < 12 ? Math.sin((t - 8) / 4 * Math.PI) * 1.3 : 0);
}

// ---------------------------------------------------------------------------
// Plattegrond voor de minikaart (1 px = 1 m)
// ---------------------------------------------------------------------------

function tekenKaart() {
    const x0 = GRENS[0] - 20, z0 = GRENS[2] - 20, b = GRENS[1] - x0 + 20, h = GRENS[3] - z0 + 20;
    const beeld = doek(b, h, g => {
        const pt = (x, z) => [x - x0, z - z0], rect = ([x1, z1, x2, z2], kleur) => {
            g.fillStyle = kleur;
            g.fillRect(x1 - x0, z1 - z0, x2 - x1, z2 - z1);
        };
        g.fillStyle = '#cfdcc4';
        g.fillRect(0, 0, b, h);
        rect([tx1, tz1, tx2, tz2], '#f1efe8'); // het park
        for (const [x1, z1, x2, z2, soort] of AKKERS) rect([x1, z1, x2, z2], soort === 'akker' ? '#d9cfae' : '#c3d8ad');
        rect(PAD, '#b9bcc0');
        rect(WERF, '#c8c3ba');
        rect(DOORRIT, '#c8c3ba');
        rect(INRITTEN[1], '#b9bcc0');
        rect(INRITTEN[2], '#c8c3ba');
        rect([-8, PAD[3], 12, -149], '#7d848c'); // door de poort
        rect(GARAGE, '#b9bcc0');
        rect(TANKSTATION, '#c8c3ba');
        g.lineCap = g.lineJoin = 'round';
        const lijn = (w, breed, kleur) => {
            g.strokeStyle = kleur;
            g.lineWidth = breed;
            g.beginPath();
            w.monsters.forEach((m, i) => g[i ? 'lineTo' : 'moveTo'](...pt(m.x, m.z)));
            if (w.dicht) g.closePath();
            g.stroke();
        };
        for (const w of wegen) if (w.soort !== 'viaduct') lijn(w, 2 * (w.half + w.stoep), '#e9e6de');
        for (const w of wegen) if (w.soort !== 'viaduct') lijn(w, 2 * w.half, '#7d848c');
        g.fillStyle = '#9fbf8a';
        g.beginPath();
        g.arc(...pt(...CENTRUM), 20.5, 0, 2 * Math.PI);
        g.fill();
        g.strokeStyle = '#eef0f2'; // de cirkels op het driftpark
        g.lineWidth = 0.8;
        for (const [x, z, straal] of kaartRingen) {
            g.beginPath();
            g.arc(...pt(x, z), straal, 0, 2 * Math.PI);
            g.stroke();
        }
        g.fillStyle = '#a5c291';
        for (const [x, z, groot] of alleBomen) {
            g.beginPath();
            g.arc(...pt(x, z), 1.7 * groot, 0, 2 * Math.PI);
            g.fill();
        }
        g.fillStyle = '#a8adb4';
        M.gebouwen.vakken.forEach(d => { // daken van de gebouwen (elk vijfde vlak van een doos is het dak)
            for (let i = 0; i < d.pos.length; i += 18 * 5) {
                const dak = d.pos.slice(i + 18 * 4, i + 18 * 5);
                g.beginPath();
                g.moveTo(dak[0] - x0, dak[2] - z0);
                for (const j of [3, 6, 15]) g.lineTo(dak[j] - x0, dak[j + 2] - z0); // hoeken 1, 2 en 3 (0 en 2 staan er dubbel in)
                g.fill();
            }
        });
        for (const o of huisVormen) {
            g.beginPath();
            hoeken(o).slice(0, 4).forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](x - x0, z - z0));
            g.fill();
        }
        const v = weg('viaduct');
        lijn(v, 2 * v.half + 3, '#3d4450');
        lijn(v, 2 * v.half, '#5d6570');
    });
    return { beeld, x0, z0 };
}
