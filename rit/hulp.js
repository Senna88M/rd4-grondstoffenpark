// Kleine hulpjes voor het rijspel: rekenen, texturen, en veel dingen tegelijk tekenen zonder dat de computer het
// merkt (wat buiten beeld is, wordt niet getekend). THREE, renderer en scene komen van de site (script.js).

export const klem = (v, a, b) => Math.min(b, Math.max(a, v));
export const hoekVerschil = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const glad = v => v * v * (3 - 2 * v);
// Punt (lx, lz) van iets dat op (x, z) staat met rotation.y = draai (voor = +x).
export const lokaal = (x, z, draai, lx, lz) => [x + lx * Math.cos(draai) + lz * Math.sin(draai), z - lx * Math.sin(draai) + lz * Math.cos(draai)];

export function doek(b, h, teken) {
    const c = document.createElement('canvas');
    c.width = b;
    c.height = h;
    teken(c.getContext('2d'), b, h);
    return c;
}
export function textuur(canvas, herhaal = 1) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(herhaal, herhaal);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
}
// Bijna wit met vlekjes (en eventueel voegen): over een kleur gelegd geeft het structuur.
export function ruis(vlekjes, herhaal = 1, tegels = 0) {
    const r = zaad(vlekjes + tegels);
    return textuur(doek(256, 256, g => {
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
    }), herhaal);
}

// Veel dezelfde dingen. Vast (standaard): per vak van 300 m een eigen InstancedMesh met een eigen bol, zodat wat
// buiten beeld is niet getekend wordt. Beweeglijk: één InstancedMesh die altijd getekend wordt (zelf matrices zetten).
const pop = new THREE.Object3D(), plek = new THREE.Vector3();
export function veel(geo, materiaal, lijst, plaats, { kleur, schaduw = true, beweeglijk = false, vak = 300 } = {}) {
    const stuks = lijst.map(d => {
        pop.position.set(0, 0, 0);
        pop.rotation.set(0, 0, 0);
        pop.scale.set(1, 1, 1);
        plaats(pop, d);
        pop.updateMatrix();
        return [pop.matrix.clone(), kleur && kleur(d), Math.max(pop.scale.x, pop.scale.y, pop.scale.z)];
    });
    const maak = (deel, g) => {
        const m = new THREE.InstancedMesh(g, materiaal, Math.max(deel.length, 1));
        m.count = deel.length;
        deel.forEach(([matrix, k], i) => {
            m.setMatrixAt(i, matrix);
            if (k) m.setColorAt(i, k);
        });
        m.castShadow = schaduw;
        m.receiveShadow = true;
        scene.add(m);
        return m;
    };
    if (beweeglijk) {
        const m = maak(stuks, geo);
        m.frustumCulled = false;
        return m;
    }
    geo.computeBoundingSphere();
    const marge = geo.boundingSphere.center.length() + geo.boundingSphere.radius, vakken = new Map();
    for (const s of stuks) {
        plek.setFromMatrixPosition(s[0]);
        const sleutel = Math.floor(plek.x / vak) + ',' + Math.floor(plek.z / vak);
        if (!vakken.has(sleutel)) vakken.set(sleutel, []);
        vakken.get(sleutel).push(s);
    }
    return [...vakken.values()].map(deel => {
        const g = geo.clone(), doos = new THREE.Box3();
        let schaal = 1;
        for (const [matrix, , s] of deel) {
            doos.expandByPoint(plek.setFromMatrixPosition(matrix));
            schaal = Math.max(schaal, s);
        }
        g.boundingSphere = doos.getBoundingSphere(new THREE.Sphere());
        g.boundingSphere.radius += marge * schaal;
        const m = maak(deel, g);
        m.frustumCulled = true; // InstancedMesh staat in deze three.js standaard uit; met de eigen bol per vak klopt het
        return m;
    });
}

// Driehoeken verzamelen en per vak één mesh maken: gebouwen, wegen, stoepen. Vlakken met vier hoeken, elk met
// een normaal, uv's en een kleur (vermenigvuldigt met de textuur).
export class Bouwer {
    constructor(materiaal, { schaduw = true, vak = 150 } = {}) {
        Object.assign(this, { materiaal, schaduw, vak, vakken: new Map() });
    }
    vak_(x, z) {
        const sleutel = Math.floor(x / this.vak) + ',' + Math.floor(z / this.vak);
        if (!this.vakken.has(sleutel)) this.vakken.set(sleutel, { pos: [], nor: [], uv: [], kleur: [] });
        return this.vakken.get(sleutel);
    }
    // hoeken: vier [x, y, z] tegen de klok in, van de kant gezien waar het vlak naartoe wijst.
    vlak(hoeken, normaal, uvs, kleur = WIT, d = this.vak_(hoeken[0][0], hoeken[0][2])) {
        for (const i of [0, 1, 2, 0, 2, 3]) {
            d.pos.push(...hoeken[i]);
            d.nor.push(...normaal);
            d.uv.push(...uvs[i]);
            d.kleur.push(kleur.r, kleur.g, kleur.b);
        }
    }
    // Doos op (x, z) met rotation.y = draai, breedte b langs zijn x, diepte d langs zijn z, van y0 tot y0 + h.
    // Gevels krijgen uv in meters (ramen), het dak een effen stukje; effen: alles effen.
    doos(x, z, draai, b, d, h, y0, kleur, effen = false) {
        const hoek = (lx, lz, y) => {
            const [px, pz] = lokaal(x, z, draai, lx, lz);
            return [px, y, pz];
        };
        const c = Math.cos(draai), s = Math.sin(draai), y1 = y0 + h, bx = b / 2, dz = d / 2;
        const uv = l => effen ? EFFEN : [[0, y0], [l, y0], [l, y1], [0, y1]];
        const n = (lx, lz) => [lx * c + lz * s, 0, -lx * s + lz * c], vak = this.vak_(x, z); // hele doos in één vak
        this.vlak([hoek(-bx, dz, y0), hoek(bx, dz, y0), hoek(bx, dz, y1), hoek(-bx, dz, y1)], n(0, 1), uv(b), kleur, vak);
        this.vlak([hoek(bx, -dz, y0), hoek(-bx, -dz, y0), hoek(-bx, -dz, y1), hoek(bx, -dz, y1)], n(0, -1), uv(b), kleur, vak);
        this.vlak([hoek(bx, dz, y0), hoek(bx, -dz, y0), hoek(bx, -dz, y1), hoek(bx, dz, y1)], n(1, 0), uv(d), kleur, vak);
        this.vlak([hoek(-bx, -dz, y0), hoek(-bx, dz, y0), hoek(-bx, dz, y1), hoek(-bx, -dz, y1)], n(-1, 0), uv(d), kleur, vak);
        this.vlak([hoek(-bx, dz, y1), hoek(bx, dz, y1), hoek(bx, -dz, y1), hoek(-bx, -dz, y1)], [0, 1, 0], EFFEN, kleur.clone().multiplyScalar(0.8), vak); // dak iets donkerder
    }
    klaar() {
        return [...this.vakken.values()].map(d => {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(d.kleur, 3));
            geo.computeBoundingSphere();
            const m = new THREE.Mesh(geo, this.materiaal);
            m.castShadow = this.schaduw;
            m.receiveShadow = true;
            scene.add(m);
            return m;
        });
    }
}
const WIT = new THREE.Color('#fff'), EFFEN = [[0.1, 0.1], [0.1, 0.1], [0.1, 0.1], [0.1, 0.1]];

// Doos met een schuine bovenkant (in de lengte van h0 naar h1), uv in meters.
export function schuinBlok(lengte, breedte, h0, h1, bodem) {
    const geo = new THREE.BoxGeometry(lengte, 1, breedte), p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
        p.setY(i, p.getY(i) > 0 ? (p.getX(i) < 0 ? h0 : h1) : bodem);
        const zij = Math.abs(n.getY(i)) < 0.5;
        uv.setXY(i, Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i), zij ? p.getY(i) : p.getZ(i));
    }
    geo.computeVertexNormals();
    return geo;
}

// Ruimtelijk raster: snel alles opzoeken wat in de buurt van een punt ligt (botsen, grond, wegen).
export class Raster {
    constructor(vak = 16) {
        Object.assign(this, { vak, vakken: new Map(), ronde: 0 });
    }
    voeg(item, x, z, straal) {
        const v = this.vak;
        for (let i = Math.floor((x - straal) / v); i <= Math.floor((x + straal) / v); i++) for (let j = Math.floor((z - straal) / v); j <= Math.floor((z + straal) / v); j++) {
            const k = i * 65536 + j;
            if (!this.vakken.has(k)) this.vakken.set(k, []);
            this.vakken.get(k).push(item);
        }
    }
    // Elk item in de vakken rond (x, z) één keer.
    rond(x, z, straal, doe) {
        const v = this.vak, ronde = ++this.ronde;
        for (let i = Math.floor((x - straal) / v); i <= Math.floor((x + straal) / v); i++) for (let j = Math.floor((z - straal) / v); j <= Math.floor((z + straal) / v); j++) {
            const lijst = this.vakken.get(i * 65536 + j);
            if (lijst) for (const item of lijst) if (item._ronde !== ronde) {
                item._ronde = ronde;
                doe(item);
            }
        }
    }
}
