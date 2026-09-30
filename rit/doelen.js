// Wat er te doen is: driften (punten, met een vermenigvuldiger als je doorgaat), springen, een ronde op de baan van
// het driftpark, een race door de stad langs controleposten (ook over het viaduct), en vijftien afvalbakken zoeken.
// De beste tijden en punten en de gevonden afvalbakken worden onthouden (in deze browser).
import { BAAN, grondOnder, weg } from './wereld.js';
import { meld, zetTijd, zetAanwijzing } from './hud.js';
import { piep } from './auto.js';

const OPSLAG = 'rd4-rit';
export const stand = (() => {
    try { return { blikjes: [], ...JSON.parse(localStorage.getItem(OPSLAG) || '{}') }; } catch { return { blikjes: [] }; } // blikjes: de gevonden afvalbakken
})();
export function bewaar() {
    try { localStorage.setItem(OPSLAG, JSON.stringify(stand)); } catch { }
}
const tijd = t => `${Math.floor(t / 60)}:${getal(t % 60, 1).padStart(4, '0')}`;

// Afvalbakken: [x, z, hoogte] (zonder hoogte: op de grond of wat daar rijbaar is).
const BAKKEN = [[124.2, -285], [76, -241], [26.4, -241, 4.2], [-47, -630], [112, -662], [-110, -684], [20, -538], [280, -212],
    [20, -290], [226.75, -224], [122.5, -581], [-70, 120], [183, -386, 0], [-10, -762], [-128, -612]];
// Stadsrace: start (x, z, richting), dan de controleposten; de laatste is de finish. Een post vlak bij het viaduct
// staat erop.
const RACE = { start: [20, -341, -Math.PI / 2], posten: [[19, -445], [-60, -551], [-240, -620], [-60, -750], [26, -660], [140, -565], [278, -500],
    [176, -262], [196, -470], [40, -690], [-160, -640], [20, -350]] };

export const voortgang = () => [
    ['Afvalbakken', `${stand.blikjes.length} / ${BAKKEN.length}`], ['Beste ronde', stand.ronde ? tijd(stand.ronde) : '–'],
    ['Stadsrace', stand.race ? tijd(stand.race) : '–'], ['Beste drift', stand.drift ? getal(stand.drift, 0) : '–'],
    ['Langste sprong', stand.sprong ? getal(stand.sprong, 1) + ' s' : '–']];

// ---------------------------------------------------------------------------
// Wat je ziet: afvalbakken, lichtzuilen voor de race, een pijl boven de wagen
// ---------------------------------------------------------------------------

const POST = '#e83e8c'; // controleposten en de pijl: niet te verwarren met de afvalbakken of de start (blauw)
let bakken = [], posten = [], zuilen = [], startZuil, pijl, gemaakt = false;
function zuil(kleur, straal = 7) { // lichtzuil met een ring op de grond
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(straal, straal, 14, 32, 1, true).translate(0, 7, 0),
        new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })));
    const ring = new THREE.Mesh(new THREE.RingGeometry(straal - 0.4, straal, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.8 }));
    ring.position.y = 0.06;
    g.add(ring);
    g.visible = false;
    scene.add(g);
    return g;
}
function maak() {
    if (gemaakt) return;
    gemaakt = true;
    // Een rolcontainer (grijs, deksel in de kleur van een afvalsoort) op twee wieltjes.
    const romp = new THREE.MeshLambertMaterial({ color: '#59626d', emissive: '#1a1f26' }), zwart = new THREE.MeshLambertMaterial({ color: '#1b1d21' });
    const deksels = ['#2f9e44', '#2f6aa8', '#e8792b', '#8a939c'].map(k => new THREE.MeshLambertMaterial({ color: k, emissive: new THREE.Color(k).multiplyScalar(0.35) }));
    const bak = new THREE.CylinderGeometry(0.5, 0.42, 1.05, 4).rotateY(Math.PI / 4).translate(0, -0.05, 0), deksel = new THREE.BoxGeometry(0.78, 0.09, 0.8).translate(0, 0.52, 0.02);
    const greep = new THREE.BoxGeometry(0.62, 0.06, 0.06).translate(0, 0.46, -0.42), wiel = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12).rotateZ(Math.PI / 2);
    bakken = BAKKEN.map(([x, z, h], i) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(bak, romp), new THREE.Mesh(deksel, deksels[i % deksels.length]), new THREE.Mesh(greep, zwart));
        for (const kant of [-1, 1]) {
            const w = new THREE.Mesh(wiel, zwart);
            w.position.set(kant * 0.27, -0.5, -0.36);
            g.add(w);
        }
        g.children.forEach(m => { m.castShadow = true; });
        g.scale.setScalar(1.25);
        const y = (h ?? grondOnder(x, z, 30)) + 1.2;
        g.position.set(x, y, z);
        g.rotation.x = 0.12;
        g.visible = !stand.blikjes.includes(i);
        scene.add(g);
        return { g, x, y, z, i };
    });
    const viaduct = weg('viaduct');
    posten = RACE.posten.map(([x, z]) => {
        const m = viaduct.monsters.reduce((b, m) => Math.hypot(m.x - x, m.z - z) < Math.hypot(b.x - x, b.z - z) ? m : b);
        return Math.hypot(m.x - x, m.z - z) < 12 ? [m.x, m.z, m.h] : [x, z, grondOnder(x, z, 0)];
    });
    zuilen = posten.map(([x, z, y]) => {
        const g = zuil(POST);
        g.position.set(x, y, z);
        return g;
    });
    startZuil = zuil('#3d8bfd', 6);
    startZuil.position.set(RACE.start[0], 0, RACE.start[1]);
    pijl = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 4).rotateZ(-Math.PI / 2).scale(1, 0.35, 1), new THREE.MeshBasicMaterial({ color: POST }));
    pijl.visible = false;
    scene.add(pijl);
}

// ---------------------------------------------------------------------------
// Elke stap
// ---------------------------------------------------------------------------

const drift = { punten: 0, duur: 0, rust: 0 };
const ronde = { bezig: false, tijd: 0, half: false, vorigeX: 0 };
const race = { fase: 'uit', tijd: 0, post: 0, stil: 0 }; // fase: uit, tellen, bezig
export const bevroren = () => race.fase === 'tellen';

export function startDoelen(a) {
    maak();
    Object.assign(drift, { punten: 0, duur: 0, rust: 0 });
    Object.assign(ronde, { bezig: false, vorigeX: a.x });
    stopRace();
    startZuil.visible = true;
}
export function stopDoelen() {
    stopRace();
    if (startZuil) startZuil.visible = false;
    zetTijd(null);
    zetAanwijzing(null);
}

export function doelenStap(a, g, dt) {
    const nu = performance.now() / 1000;
    // Drift: zolang hij flink dwars (> 15°) glijdt op snelheid. Ga je binnen 1,5 s weer dwars, dan telt het door en
    // loopt de vermenigvuldiger op (elke 2 s, tot ×5). Botsen: de lopende drift is weg.
    if (g.klap > 4 && drift.punten > 30) {
        meld('Botsing', 'drift kwijt');
        Object.assign(drift, { punten: 0, duur: 0 });
    } else if (!a.lucht && g.dwars > 0.26 && g.snel > 6) {
        Object.assign(drift, { punten: drift.punten + g.snel * Math.sin(g.dwars) * 10 * dt, duur: drift.duur + dt, rust: 0 });
        if (drift.punten > 30) meld('Drift ' + getal(Math.round(drift.punten), 0), '×' + keer(), 0.3);
    } else if (drift.punten && (drift.rust += dt) > 1.5) {
        if (drift.punten > 30) {
            const erbij = Math.round(drift.punten * keer()), record = erbij > (stand.drift || 0);
            meld('+' + getal(erbij, 0), record ? 'beste drift' : '');
            if (record) {
                stand.drift = erbij;
                bewaar();
            }
        }
        Object.assign(drift, { punten: 0, duur: 0, rust: 0 });
    }
    // Sprong: hoe lang in de lucht.
    if (g.landing > 0.4) {
        const record = g.landing > (stand.sprong || 0);
        meld(`Sprong ${getal(g.landing, 1)} s`, record ? 'langste sprong' : '+' + getal(Math.round(g.landing * 100) * 10, 0));
        if (record) {
            stand.sprong = Math.round(g.landing * 10) / 10;
            bewaar();
        }
    }
    // Afvalbakken: draaien rond en zweven; rij je erdoor, dan heb je hem.
    for (const b of bakken) {
        if (!b.g.visible) continue;
        b.g.rotation.y = nu * 2 + b.i;
        b.g.position.y = b.y + Math.sin(nu * 2 + b.i) * 0.15;
        if (Math.hypot(a.x - b.x, a.z - b.z) < 2.6 && Math.abs(a.y + 0.6 - b.y) < 2.2) {
            b.g.visible = false;
            stand.blikjes.push(b.i);
            bewaar();
            piep(1320, 0.18, 0.06);
            setTimeout(() => piep(1760, 0.25, 0.06), 120);
            meld(stand.blikjes.length === BAKKEN.length ? 'Alle afvalbakken' : 'Afvalbak', `${stand.blikjes.length} / ${BAKKEN.length}`, 2);
        }
    }
    rondeStap(a, dt);
    raceStap(a, g, dt);
}
const keer = () => Math.min(5, 1 + Math.floor(drift.duur / 2));

// Ronde op de baan van het driftpark: over de startstreep naar het oosten, de hele baan rond (ook het noordelijke
// rechte stuk), en weer over de streep.
function rondeStap(a, dt) {
    const over = Math.abs(a.z - (BAAN.z + BAAN.r)) < 8 && ronde.vorigeX < BAAN.start && a.x >= BAAN.start;
    ronde.vorigeX = a.x;
    if (over && race.fase === 'uit') {
        if (ronde.bezig && ronde.half) {
            const record = !stand.ronde || ronde.tijd < stand.ronde;
            meld(tijd(ronde.tijd), record ? 'beste ronde' : 'beste ' + tijd(stand.ronde), 3);
            piep(990, 0.3, 0.06);
            if (record) {
                stand.ronde = ronde.tijd;
                bewaar();
            }
        }
        Object.assign(ronde, { bezig: true, tijd: 0, half: false });
    }
    const opBaan = a.x > BAAN.x1 - BAAN.r - 20 && a.x < BAAN.x2 + BAAN.r + 20 && Math.abs(a.z - BAAN.z) < BAAN.r + 20;
    if (!opBaan || race.fase !== 'uit') ronde.bezig = false;
    if (ronde.bezig) {
        ronde.tijd += dt;
        if (Math.abs(a.z - (BAAN.z - BAAN.r)) < 8 && a.x > BAAN.x1 && a.x < BAAN.x2) ronde.half = true;
        zetTijd('Ronde ' + tijd(ronde.tijd) + (stand.ronde ? ' · beste ' + tijd(stand.ronde) : ''));
    } else if (race.fase === 'uit') zetTijd(null);
}

// Stadsrace: sta stil in de blauwe zuil, dan telt hij af. Rij langs alle roze zuilen; de pijl boven de wagen wijst
// naar de volgende. Ver van de route af (400 m): de race stopt.
function raceStap(a, g, dt) {
    const [sx, sz] = RACE.start, bijStart = Math.hypot(a.x - sx, a.z - sz) < 6;
    if (race.fase === 'uit') {
        zetAanwijzing(bijStart ? 'Stadsrace · sta stil om te starten' : null);
        race.stil = bijStart && g.snel < 1.5 ? race.stil + dt : 0;
        if (race.stil > 0.8) {
            Object.assign(race, { fase: 'tellen', tijd: 3.99, post: 0 });
            zetAanwijzing(null);
        }
        return;
    }
    if (race.fase === 'tellen') {
        const was = Math.ceil(race.tijd);
        race.tijd -= dt;
        if (Math.ceil(race.tijd) !== was || race.tijd <= 0) {
            if (race.tijd > 0) {
                meld(String(Math.ceil(race.tijd)), '', 0.8);
                piep(660, 0.15);
            } else {
                meld('Start', '', 1);
                piep(1320, 0.35);
                Object.assign(race, { fase: 'bezig', tijd: 0 });
                toonPosten();
            }
        }
        return;
    }
    race.tijd += dt;
    const [px, pz, py] = posten[race.post], laatste = race.post === posten.length - 1;
    zetTijd(`Race ${tijd(race.tijd)} · ${race.post} / ${posten.length}`);
    if (Math.hypot(a.x - px, a.z - pz) < 9 && Math.abs(a.y - py) < 4) {
        if (laatste) {
            const record = !stand.race || race.tijd < stand.race;
            meld(tijd(race.tijd), record ? 'beste tijd' : 'beste ' + tijd(stand.race), 4);
            piep(990, 0.4, 0.07);
            if (record) {
                stand.race = race.tijd;
                bewaar();
            }
            return stopRace();
        }
        piep(1100, 0.15);
        race.post++;
        toonPosten();
    } else if (Math.hypot(a.x - px, a.z - pz) > 400) {
        meld('Race gestopt', 'te ver van de route', 2.5);
        return stopRace();
    }
    // Pijl boven de wagen naar de volgende post.
    pijl.visible = true;
    pijl.position.set(a.x, a.y + 3.2, a.z);
    const doel = Math.atan2(pz - a.z, px - a.x);
    pijl.rotation.y = -doel;
}
function toonPosten() {
    zuilen.forEach((z, i) => {
        z.visible = i === race.post || i === race.post + 1;
        z.children[0].material.opacity = i === race.post ? 0.3 : 0.1;
    });
    startZuil.visible = false;
}
function stopRace() {
    Object.assign(race, { fase: 'uit', tijd: 0, post: 0, stil: 0 });
    zuilen.forEach(z => { z.visible = false; });
    if (pijl) pijl.visible = false;
    if (startZuil) startZuil.visible = true;
}

// Stippen voor de minikaart: [x, z, kleur, groot (ook aan de rand als hij verder weg is)].
export function stippen(a) {
    const uit = [];
    if (race.fase === 'uit') uit.push([RACE.start[0], RACE.start[1], '#3d8bfd', true]);
    else uit.push([...posten[race.post].slice(0, 2), POST, true]);
    for (const b of bakken) if (b.g.visible && Math.hypot(b.x - a.x, b.z - a.z) < 90) uit.push([b.x, b.z, '#2f9e44', false]);
    return uit;
}
