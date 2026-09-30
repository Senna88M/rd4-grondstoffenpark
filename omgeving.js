// Omgeving rond het park, alleen decor (de simulatie merkt er niets van): bomen rondom en een straat met lantaarns
// naar het noorden. Wat daar ligt (driftpark, stad) hoort bij het rijspel (rit/) en wordt pas geladen als je instapt.
// x = oost, z = zuid: noord (−z) is boven op de kaart.

// Waar je met de sportwagen tegenaan botst (rit/wereld.js): midden, richting en halve lengte en breedte.
const omgevingObstakels = [];
const hindernis = (x, z, half) => omgevingObstakels.push({ x, z, hoek: 0, hx: half, hz: half });

// Ruis: bijna wit met vlekjes (en eventueel voegen). Over een kleur gelegd geeft het wat structuur.
function ruis(vlekjes, tegels = 0) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d'), r = zaad(vlekjes);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < vlekjes; i++) {
        const grijs = 185 + r() * 60 | 0;
        g.fillStyle = `rgba(${grijs},${grijs},${grijs},${0.15 + r() * 0.25})`;
        g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
    }
    g.fillStyle = 'rgba(110,110,110,0.35)';
    for (let i = 0; i < tegels; i++) {
        g.fillRect(i * 256 / tegels, 0, 3, 256);
        g.fillRect(0, i * 256 / tegels, 256, 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
}

// Eigen kleuren per thema (zetThema in script.js zet ze bij het wisselen); het rijspel gebruikt ze ook.
Object.assign(SCENEKLEUREN.light, { asfalt: '#b6b8bb', stoep: '#e6e3dc', band: '#f4f3ef', streep: '#ffffff', blad: '#9cc289', stam: '#8d735b' });
Object.assign(SCENEKLEUREN.dark, { asfalt: '#2d333c', stoep: '#3a424c', band: '#4a525d', streep: '#b4bcc6', blad: '#31513e', stam: '#4d3f33' });
const dubbel = kleur => new THREE.MeshLambertMaterial({ map: kleur, side: THREE.DoubleSide }); // ook de opstaande randen, hoe ze ook liggen
Object.assign(MAT, { asfalt: dubbel(ruis(9000)), stoep: dubbel(ruis(3000, 4)), band: dubbel(null), streep: dubbel(null), blad: mat(), stam: mat() });
MAT.asfalt.map.repeat.set(0.25, 0.25); // uv in meters: vlekjes per 4 m
MAT.stoep.map.repeat.set(0.5, 0.5); // tegels van 50 cm
for (const naam of ['asfalt', 'stoep', 'band', 'streep', 'blad', 'stam']) MAT[naam].color.set(SCENEKLEUREN[donker ? 'dark' : 'light'][naam]);

// Veel dezelfde dingen in één keer tekenen: per stuk zet `plaats` positie, draai en maat.
const pop = new THREE.Object3D();
function veel(geo, materiaal, lijst, plaats, kleur) {
    const m = new THREE.InstancedMesh(geo, materiaal, Math.max(lijst.length, 1));
    m.count = lijst.length;
    lijst.forEach((d, i) => {
        pop.position.set(0, 0, 0);
        pop.rotation.set(0, 0, 0);
        pop.scale.set(1, 1, 1);
        plaats(pop, d);
        pop.updateMatrix();
        m.setMatrixAt(i, pop.matrix);
        if (kleur) m.setColorAt(i, kleur(d));
    });
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false; // ze staan overal, niet rond hun eigen oorsprong
    scene.add(m);
    return m;
}

// ---------------------------------------------------------------------------
// Straat: van het zuiden langs de ingang naar het noorden, waar hij langs het driftpark naar het oosten buigt (verder: rit/wereld.js)
// ---------------------------------------------------------------------------

const STRAAT = new THREE.CatmullRomCurve3([[-70, 180], [-70, 20], [-70, -55], [-63, -102], [-42, -134], [-14, -146], [20, -146]]
    .map(([x, z]) => new THREE.Vector3(x, 0, z)));
STRAAT.arcLengthDivisions = 400;
const STRAATLENGTE = STRAAT.getLength();
function opStraat(s) { // punt op s meter, met (rx, rz) = naar rechts (aan het begin: oost)
    const u = THREE.MathUtils.clamp(s / STRAATLENGTE, 0, 1), p = STRAAT.getPointAt(u), t = STRAAT.getTangentAt(u);
    return { x: p.x, z: p.z, rx: -t.z, rz: t.x };
}
const INRIT = [180 - 29, 180 - 7]; // hier komt de toegangsweg van het park erop (z 7 tot 29): oostkant open
const sBij = x => { let s = STRAATLENGTE; while (s > 0 && opStraat(s).x > x) s -= 0.5; return s; };
const POORT = [sBij(-8), sBij(12)]; // de poort van het driftpark: noordkant open

// Een strook langs de straat, van `van` tot `tot` meter opzij, op hoogte y1 en y2 (verschillend: een opstaande rand).
const strook = () => ({ pos: [], uv: [], idx: [] });
function lint(d, van, tot, y1, y2, s0, s1, stap = 2) {
    const n = Math.max(1, Math.ceil((s1 - s0) / stap)), eerste = d.pos.length / 3;
    for (let i = 0; i <= n; i++) {
        const s = s0 + (s1 - s0) * i / n, p = opStraat(s);
        d.pos.push(p.x + p.rx * van, y1, p.z + p.rz * van, p.x + p.rx * tot, y2, p.z + p.rz * tot);
        d.uv.push(van, s, tot, s);
        if (i) d.idx.push(eerste + 2 * i - 2, eerste + 2 * i - 1, eerste + 2 * i, eerste + 2 * i - 1, eerste + 2 * i + 1, eerste + 2 * i);
    }
}
function leg(d, materiaal) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    geo.setIndex(d.idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materiaal);
    m.receiveShadow = true;
    scene.add(m);
}

{
    const asfalt = strook(), streep = strook(), band = strook(), stoep = strook();
    lint(asfalt, -3.75, 3.75, 0.02, 0.02, 0, STRAATLENGTE);
    for (const kant of [-1, 1]) {
        for (const [s0, s1] of kant > 0 ? [[0, INRIT[0]], [INRIT[1], STRAATLENGTE]] : [[0, POORT[0]], [POORT[1], STRAATLENGTE]]) {
            lint(streep, kant * 3.35, kant * 3.5, 0.03, 0.03, s0, s1);       // kantstreep
            lint(band, kant * 3.75, kant * 3.75, 0.02, 0.15, s0, s1);        // stoeprand
            lint(band, kant * 3.75, kant * 3.95, 0.15, 0.15, s0, s1);
            lint(stoep, kant * 3.95, kant * 6.2, 0.13, 0.13, s0, s1);        // stoep
            lint(stoep, kant * 6.2, kant * 6.2, 0.13, 0, s0, s1);
        }
    }
    for (let s = 2; s < STRAATLENGTE; s += 9) lint(streep, -0.07, 0.07, 0.03, 0.03, s, Math.min(s + 3, STRAATLENGTE), 1); // onderbroken middenstreep
    for (let d = -3; d <= 3; d++) lint(streep, d - 0.25, d + 0.25, 0.032, 0.032, 138, 141.5, 1);        // zebrapad bij de ingang
    leg(asfalt, MAT.asfalt);
    leg(streep, MAT.streep);
    leg(band, MAT.band);
    leg(stoep, MAT.stoep);
    plat(vorm([[-66.3, 7], [-60, 10], [-60, 26], [-66.3, 29]]), MAT.verhard, 0, 0, 0.012); // aansluiting op de toegangsweg
}

// Lantaarnpalen: [x, z, richting naar de weg (rad)], de arm wijst die kant op.
{
    const grijs = mat('#8a9199'), lamp = new THREE.MeshBasicMaterial({ color: '#fff2c7' }), plekken = [];
    for (let s = 10, kant = 1; s < STRAATLENGTE; s += 30, kant = -kant) {
        if (kant > 0 && s > INRIT[0] - 4 && s < INRIT[1] + 4 || kant < 0 && s > POORT[0] - 4 && s < POORT[1] + 4) continue;
        const p = opStraat(s);
        plekken.push([p.x + p.rx * kant * 5.4, p.z + p.rz * kant * 5.4, Math.atan2(-kant * p.rz, -kant * p.rx)]);
    }
    for (const [geo, materiaal] of [[new THREE.CylinderGeometry(0.06, 0.09, 6.5, 8).translate(0, 3.25, 0), grijs],
        [new THREE.BoxGeometry(1.5, 0.07, 0.07).translate(0.72, 6.42, 0), grijs],
        [new THREE.BoxGeometry(0.6, 0.1, 0.26).translate(1.35, 6.36, 0), lamp]]) veel(geo, materiaal, plekken, (p, [x, z, r]) => {
        p.position.set(x, 0, z);
        p.rotation.y = -r;
    });
    plekken.forEach(([x, z]) => hindernis(x, z, 0.15));
}

// ---------------------------------------------------------------------------
// Bomen rond het park en langs de straat: [x, z, grootte, naaldboom, tint]
// ---------------------------------------------------------------------------

{
    const r = zaad(4242), lijst = [], langsStraat = Array.from({ length: Math.ceil(STRAATLENGTE / 4) }, (_, i) => opStraat(i * 4));
    const vrij = (x, z) => !(x > tx1 - 3 && x < tx2 + 3 && z > tz1 - 3 && z < tz2 + 3) // niet op het terrein
        && !(x < tx1 && x > -64 && z > -8 && z < 36)                                        // niet bij de ingang
        && z > -150                                                                         // niet in het noorden (rijspel)
        && !langsStraat.some(p => Math.hypot(p.x - x, p.z - z) < 7.5);
    const zet = (x, z) => { if (vrij(x, z)) lijst.push([x, z, 0.8 + r() * 0.55, r() < 0.3, 0.8 + r() * 0.3]); };
    const randen = [[tx1, tz1, tx2, tz1, 0, -1], [tx2, tz1, tx2, tz2, 1, 0], [tx2, tz2, tx1, tz2, 0, 1], [tx1, tz2, tx1, tz1, -1, 0]];
    for (const [van, tot, stap] of [[6, 14, 8], [18, 34, 12]]) for (const [x1, z1, x2, z2, nx, nz] of randen) { // twee rijen rond het park
        const lengte = Math.hypot(x2 - x1, z2 - z1);
        for (let t = -tot; t < lengte + tot; t += stap * (0.7 + r() * 0.6)) {
            const d = van + r() * (tot - van);
            zet(x1 + (x2 - x1) * t / lengte + nx * d, z1 + (z2 - z1) * t / lengte + nz * d);
        }
    }
    for (let s = 6; s < STRAATLENGTE; s += 11 + r() * 6) for (const kant of [-1, 1]) { // langs de straat
        const p = opStraat(s), d = kant * (8.5 + r() * 3);
        if (r() > 0.25 && !(kant > 0 && s > INRIT[0] - 6 && s < INRIT[1] + 6)) zet(p.x + p.rx * d, p.z + p.rz * d);
    }
    veel(new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6).translate(0, 1.2, 0), MAT.stam, lijst, (p, [x, z, g]) => {
        p.position.set(x, 0, z);
        p.scale.setScalar(g);
    });
    const kruin = (geo, soort) => veel(geo, MAT.blad, lijst.filter(b => b[3] === soort), (p, [x, z, g]) => {
        p.position.set(x, 0, z);
        p.rotation.y = x * 7 + z; // niet allemaal dezelfde kant op
        p.scale.setScalar(g);
    }, b => new THREE.Color().setScalar(b[4]));
    kruin(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.3, 0), false);
    kruin(new THREE.ConeGeometry(1.35, 4.2, 7).translate(0, 3.9, 0), true);
    lijst.forEach(([x, z]) => hindernis(x, z, 0.3));
}
