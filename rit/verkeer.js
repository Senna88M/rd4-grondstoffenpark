// Verkeer op de ringweg, rechts rijdend en in beide richtingen. Auto's houden afstand van elkaar en stoppen voor
// jou; raak je er een hard, dan staat hij even stil.
import { weg, AUTO } from './wereld.js';
import { veel, lokaal, klem } from './hulp.js';

const KLEUREN = ['#c0392b', '#2c5f9e', '#e8e8e8', '#2b2b2b', '#7f8c8d', '#d4a017', '#1e7d4f', '#8e44ad', '#f0f0f0', '#5d6d7e'];
const SNEL = 12, STROOK = 5.25; // m/s (43 km/h); rechterrijstrook, vanaf het midden van de ring
let autos = null, delen = null;
export const verkeerObstakels = [];
const pop = new THREE.Object3D();

export function maakVerkeer() {
    if (autos) return;
    const ring = weg('ring'), r = zaad(77), n = 7;
    autos = [];
    for (const richting of [1, -1]) for (let i = 0; i < n; i++) {
        autos.push({ s: (i + (richting < 0 ? 0.5 : 0)) * ring.lengte / n, richting, v: SNEL, x: 0, z: 0, hoek: 0, wacht: 0, kleur: KLEUREN[r() * KLEUREN.length | 0] });
    }
    const zet = p => p.position.set(0, -50, 0);
    delen = [veel(AUTO.romp, mat(), autos, zet, { kleur: a => new THREE.Color(a.kleur), beweeglijk: true }),
        veel(AUTO.kap, mat('#2a3038'), autos, zet, { beweeglijk: true }),
        veel(AUTO.wiel, mat('#1b1d21'), autos.flatMap(a => AUTO.wielen.map(() => a)), zet, { beweeglijk: true })];
    for (const a of autos) verkeerObstakels.push(Object.assign(a.o = { x: 0, z: 0, hoek: 0, hx: 2.1, hz: 0.9, h0: 1.6, h1: 1.6, bodem: 0 }, {
        geraakt: klap => { if (klap > 4) a.wacht = 3; }
    }));
    verkeerStap({ x: 1e9, z: 1e9, y: 0 }, 0);
}

export function verkeerStap(speler, dt) {
    const ring = weg('ring'), L = ring.lengte;
    autos.forEach((a, i) => {
        // Afstand tot de auto voor hem in dezelfde richting.
        let gat = Infinity;
        for (const b of autos) if (b !== a && b.richting === a.richting) gat = Math.min(gat, (((b.s - a.s) * a.richting) % L + L) % L);
        const tx = Math.cos(a.hoek), tz = Math.sin(a.hoek), dx = speler.x - a.x, dz = speler.z - a.z, voor = dx * tx + dz * tz;
        const jijErVoor = speler.y < 3 && voor > 0 && voor < 13 && Math.abs(-dx * tz + dz * tx) < 2.8;
        a.wacht = Math.max(0, a.wacht - dt);
        const doel = gat < 15 || jijErVoor || a.wacht ? 0 : SNEL;
        a.v += klem(doel - a.v, -9 * dt, 3 * dt);
        a.s = ((a.s + a.v * dt * a.richting) % L + L) % L;
        const m = ring.op(a.s);
        a.x = m.x + m.rx * STROOK * a.richting;
        a.z = m.z + m.rz * STROOK * a.richting;
        a.hoek = Math.atan2(m.tz, m.tx) + (a.richting < 0 ? Math.PI : 0);
        Object.assign(a.o, { x: a.x, z: a.z, hoek: a.hoek });
        pop.position.set(a.x, 0, a.z);
        pop.rotation.set(0, -a.hoek, 0);
        pop.updateMatrix();
        delen[0].setMatrixAt(i, pop.matrix);
        delen[1].setMatrixAt(i, pop.matrix);
        AUTO.wielen.forEach(([lx, lz], k) => {
            const [wx, wz] = lokaal(a.x, a.z, -a.hoek, lx, lz);
            pop.position.set(wx, 0.33, wz);
            pop.updateMatrix();
            delen[2].setMatrixAt(i * 4 + k, pop.matrix);
        });
    });
    delen.forEach(m => { m.instanceMatrix.needsUpdate = true; });
}
