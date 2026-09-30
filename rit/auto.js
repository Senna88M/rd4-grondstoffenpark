// De sportwagen zelf: rijgedrag (banden), botsen, hoogte en sprongen, hoe hij erbij staat, rook, bandensporen en
// geluid. Globals van de site: THREE, scene, sportwagen, VOERTUIGSCHAAL, sim, toeter (sim.js).
import { klem } from './hulp.js';
import { obstakelsRond, botstMet, grondOnder, GRENS } from './wereld.js';

const TOP = 120 / 3.6, ACHTERUIT = 7;
const ESP_LOS = 1, MASSA = 1200, TRAAGHEID = 1500, AS = 1.25, GRIP = 1.5, STIJF = 11, MAXSTUUR = 0.5, ZWAARTE = 18;
const ACHTERAS = -1.3 * VOERTUIGSCHAAL, SPOORBREEDTE = 0.86 * VOERTUIGSCHAAL;

export const auto = {};

// Zet de wagen neer (x, z, richting), stilstaand en rechtop.
export function zetNeer(x, z, hoek, snelheid = 0, y = 0) {
    Object.assign(auto, {
        x, z, y, hoek, vx: Math.cos(hoek) * snelheid, vz: Math.sin(hoek) * snelheid, vy: 0, draai: 0, stuur: 0, ax: 0, ay: 0,
        lucht: false, luchtTijd: 0, helling: 0, duik: 0, kantel: 0, veer: 0, rook: 0, puf: 1, los: 0
    });
}

// ---------------------------------------------------------------------------
// Rijgedrag
// ---------------------------------------------------------------------------

// Banden zoals in de meeste rijspellen (een fietsmodel): een voor- en een achteras die elk zijwaarts grip geven tegen
// de hoek waaronder ze schuiven, tot een maximum. Daaronder houdt de auto de bocht, daarboven glijdt hij. Remmen drukt
// de neus in (meer grip voor), gas geven de achterkant. De handrem pakt alleen de achteras: die breekt uit, de auto
// draait, en de vaart gaat door in de richting waarin hij al ging. Een beetje stabiliteit (zoals ESP) houdt hem
// zonder handrem uit de spin. Is de achterkant eenmaal los (a.los, zie rijd), dan blijft hij met gas dwars: de
// achterbanden houden minder grip, de ESP laat los en je kunt verder tegensturen.
function banden(a, gas, rem, drift, h) {
    const c = Math.cos(a.hoek), s = Math.sin(a.hoek), vx = a.vx * c + a.vz * s, vy = -a.vx * s + a.vz * c;
    const remTot = acc => -Math.sign(vx) * Math.min(Math.abs(vx) / Math.max(h, 1e-6), acc); // afremmen, niet voorbij stilstand
    let ax = -0.0009 * vx * Math.abs(vx), ay = 0, moment = 0;
    if (!a.lucht) {
        if (gas && vx < -0.5) ax += 25 * gas; // eerst stilstaan
        else if (gas && vx < gas * TOP) ax += 13 * Math.min(1, gas * 1.5) * (1 - 0.026 * vx); // half gas: halve topsnelheid
        else if (rem) ax += (vx > 0.5 ? -14 : -8) * rem; // remmen zoals een goede wegauto: 100-0 in zo'n 30 m
        else ax += remTot(1); // uitrollen
        if (drift) ax += remTot(3);
        const last = MASSA * 9.81 / 2, verschuif = MASSA * ax * 0.2;
        const voorLast = Math.max(0.3 * last, last - verschuif), achterLast = Math.max(0.3 * last, last + verschuif);
        const los = a.los, hoek = MAXSTUUR * (1 + 0.3 * los) * a.stuur / (1 + Math.abs(vx) / 10 * (1 - 0.8 * los)), langs = Math.max(Math.abs(vx), 1); // op snelheid minder stuuruitslag
        const slipVoor = Math.atan2(vy + a.draai * AS, langs) - Math.sign(vx || 1) * hoek, slipAchter = Math.atan2(vy - a.draai * AS, langs);
        // Grip tegen schuifhoek: recht omhoog tot het maximum. Met de handrem wordt glijden daarna makkelijker dan
        // losbreken (dan blijft hij dwars); zonder handrem blijft de grip op zijn maximum en blijft hij rustig.
        const kracht = (slip, grip, los) => {
            const piek = grip / STIJF, hk = Math.abs(slip);
            return -Math.sign(slip) * (hk < piek ? STIJF * hk : grip * (1 - (los ? 0.2 : 0) * Math.min(1, (hk - piek) / (2 * piek))));
        };
        // De achteras iets meer grip dan de voorkant: stabiel, zoals een wegauto (hij duwt eerder rechtdoor dan dat hij spint).
        const achterGrip = GRIP * (drift ? 0.45 : 1.08 - 0.36 * los) * (1 - 0.15 * los * gas); // los en op gas: minder
        const voorKracht = kracht(slipVoor, GRIP, false) * voorLast, achterKracht = kracht(slipAchter, achterGrip, drift || los > 0.5) * achterLast;
        ay = (voorKracht * Math.cos(hoek) + achterKracht) / MASSA;
        ax -= voorKracht * Math.sin(hoek) / MASSA;
        moment = (voorKracht * Math.cos(hoek) - achterKracht) * AS;
        const maxDraai = GRIP * 9.81 / Math.max(Math.abs(vx), 1), gevraagd = klem(vx * Math.tan(hoek) / (2 * AS), -maxDraai, maxDraai);
        moment -= (a.draai - gevraagd) * TRAAGHEID * (drift ? 0.4 : 4 - (4 - ESP_LOS) * los);
    }
    a.vx += (c * ax - s * ay) * h;
    a.vz += (s * ax + c * ay) * h;
    a.draai += moment / TRAAGHEID * h;
    a.hoek += a.draai * h;
    a.ax += ax * h; // voor het hellen en duiken van de carrosserie (gemiddeld over de stap)
    a.ay += ay * h;
}

// Eén stap (echte tijd). invoer: { gas, rem, drift, stuur, analoog }. Geeft terug wat er gebeurde (voor punten en geluid).
export function rijd(dt, invoer, andere) {
    const a = auto, { gas, rem, drift } = invoer, gebeurd = { klap: 0, landing: 0 };
    dt = Math.max(dt, 1e-4); // het eerste beeld heeft nog geen tijd
    const voorAf = a.vx * Math.cos(a.hoek) + a.vz * Math.sin(a.hoek);
    a.stuur += (invoer.stuur - a.stuur) * Math.min(1, dt * (invoer.analoog ? 20 : 8 - 4 * Math.min(1, Math.abs(voorAf) / 25)));
    a.ax = a.ay = 0;
    const n = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < n; i++) banden(a, gas, rem, drift, dt / n);
    a.ax /= Math.max(dt, 1e-3);
    a.ay /= Math.max(dt, 1e-3);
    let fx = Math.cos(a.hoek), fz = Math.sin(a.hoek), voor = a.vx * fx + a.vz * fz, opzij = -a.vx * fz + a.vz * fx;
    const snelheid = Math.hypot(a.vx, a.vz);
    if (!a.lucht && snelheid < 4) { // stapvoets: gewoon sturen zoals een auto, anders gaan de banden trillen
        const k = (1 - snelheid / 4) * Math.min(1, dt * 20), stuurhoek = MAXSTUUR * a.stuur / (1 + Math.abs(voor) / 10);
        a.draai += (voor * Math.tan(stuurhoek) / (2 * AS) - a.draai) * k;
        opzij *= 1 - k;
        if (snelheid < 0.3 && !gas && !rem) voor = opzij = a.draai = 0;
    }
    if (a.lucht) a.draai *= Math.exp(-dt);
    voor = klem(voor, -ACHTERUIT, TOP);
    a.vx = fx * voor - fz * opzij;
    a.vz = fz * voor + fx * opzij;
    a.x += a.vx * dt;
    a.z += a.vz * dt;

    // Botsen: voor- en achterkant als twee cirkels tegen alles wat op die hoogte staat; terugduwen en terugkaatsen.
    const tegen = o => {
        for (const k of [-1.2, 1.2]) {
            const cx = a.x + Math.cos(a.hoek) * k, cz = a.z + Math.sin(a.hoek) * k, raak = duwUit(cx, cz, 0.9, o);
            if (!raak || !botstMet(o, cx, cz, a.y)) continue;
            const [nx, nz, diep] = raak, vn = a.vx * nx + a.vz * nz;
            a.x += nx * diep;
            a.z += nz * diep;
            if (vn < 0) {
                a.vx -= 1.3 * vn * nx;
                a.vz -= 1.3 * vn * nz;
                a.draai *= 0.6;
                gebeurd.klap = Math.max(gebeurd.klap, -vn);
                if (o.geraakt) o.geraakt(-vn);
            }
        }
    };
    obstakelsRond(a.x, a.z, 4, tegen);
    for (const o of andere) if (Math.abs(o.x - a.x) < o.hx + o.hz + 3 && Math.abs(o.z - a.z) < o.hx + o.hz + 3) tegen(o);
    const x = klem(a.x, GRENS[0], GRENS[1]), z = klem(a.z, GRENS[2], GRENS[3]);
    if (x !== a.x) a.vx *= -0.3;
    if (z !== a.z) a.vz *= -0.3;
    a.x = x;
    a.z = z;

    // Hoogte: op de grond volgt hij hellingen; rijdt hij van een schans of rand, dan vliegt hij met de vaart
    // omhoog die hij had.
    const grond = grondOnder(a.x, a.z, a.y);
    if (!a.lucht && grond >= a.y - 0.25) {
        a.vy = (grond - a.y) / Math.max(dt, 1e-3);
        a.y = grond;
    } else {
        if (!a.lucht) Object.assign(a, { lucht: true, luchtTijd: 0 });
        a.vy -= ZWAARTE * dt;
        a.y += a.vy * dt;
        a.luchtTijd += dt;
        if (a.y <= grond) {
            gebeurd.landing = a.luchtTijd;
            gebeurd.klap = Math.max(gebeurd.klap, -a.vy * 0.6);
            Object.assign(a, { y: grond, veer: Math.min(1, -a.vy / 14), vy: 0, lucht: false });
        }
    }

    // Hoe hij erbij staat: hellen in de bocht, duiken bij remmen en optrekken, kantelen met de helling (in de lucht
    // de neus mee met stijgen en vallen), inveren na een landing.
    fx = Math.cos(a.hoek);
    fz = Math.sin(a.hoek);
    voor = a.vx * fx + a.vz * fz;
    opzij = -a.vx * fz + a.vz * fx;
    a.helling += (klem(-a.ay * 0.007, -0.07, 0.07) - a.helling) * Math.min(1, dt * 8);
    a.duik += (klem(a.ax * 0.004, -0.05, 0.05) - a.duik) * Math.min(1, dt * 6);
    const hv = grondOnder(a.x + fx * 1.3, a.z + fz * 1.3, a.y), ha = grondOnder(a.x - fx * 1.3, a.z - fz * 1.3, a.y);
    a.kantel += ((a.lucht ? klem(a.vy * 0.025, -0.3, 0.2) : Math.atan2(hv - ha, 2.6)) - a.kantel) * Math.min(1, dt * (a.lucht ? 2.5 : 14));
    a.veer *= Math.exp(-6 * dt);
    sportwagen.position.set(a.x, a.y - a.veer * 0.12, a.z);
    sportwagen.rotation.set(a.helling, -a.hoek, a.duik + a.kantel);
    sportwagen.userData.voorwielen.forEach(m => { m.rotation.y = -a.stuur * 0.45; });
    sportwagen.userData.wielen?.forEach(m => { m.rotation.x += voor * dt / 0.34; }); // rollen (bij het mooie model)
    const stuur = sportwagen.userData.stuur; // het stuur van het mooie model draait om zijn eigen y-as
    if (stuur) stuur.deel.quaternion.copy(stuur.basis).multiply(stuurDraai.setFromAxisAngle(Y, a.stuur * 1.8));
    else stuurwiel.rotation.x = a.stuur * 1.8;

    // Rook en sporen van de achterbanden als die echt glijden (meer dan 8° schuiven, of de handrem), niet in de lucht.
    // Hard door een bocht op de grip piept hij nog niet.
    const achterHoek = Math.atan2(Math.abs(opzij - a.draai * AS), Math.max(Math.abs(voor), 1));
    // Losgebroken: met de handrem dwars gegaan. Zolang je gas geeft en hij dwars blijft, blijft hij los; gas eraf,
    // remmen of rechtgetrokken: dan pakken de banden weer.
    const breek = !a.lucht && snelheid > 6 && achterHoek > 0.2 && drift;
    const houd = !a.lucht && snelheid > 5 && achterHoek > 0.08 && gas > 0.25 && !rem;
    a.los = breek ? Math.min(1, a.los + dt * 6) : houd ? a.los : Math.max(0, a.los - dt * 2.5);
    const glijden = a.lucht ? 0 : Math.max(0, achterHoek - 0.14) * snelheid * 0.6 + (drift && Math.abs(voor) > 3 ? 1.5 : 0);
    const band = kant => [a.x + fx * ACHTERAS - fz * kant * SPOORBREEDTE, a.z + fz * ACHTERAS + fx * kant * SPOORBREEDTE];
    [-1, 1].forEach((kant, i) => {
        if (glijden > 0) spoor(i, ...band(kant), a.y);
        else vorigSpoor[i] = null;
    });
    for (a.rook += Math.min(glijden, 6) * 6 * dt; a.rook >= 1; a.rook--) blaas(...band(a.puf = -a.puf), a.vx, a.vz, a.y);
    rookStap(dt);
    geluidStap(snelheid, glijden, gas);
    return Object.assign(gebeurd, { snel: Math.hypot(a.vx, a.vz), voor, dwars: Math.atan2(Math.abs(opzij), Math.abs(voor) + 0.5), glijden });
}

// Cirkel (straal r) tegen een rechthoek: de richting naar buiten en hoe diep hij erin zit, of null.
function duwUit(px, pz, r, o) {
    const c = Math.cos(o.hoek), s = Math.sin(o.hoek), dx = px - o.x, dz = pz - o.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    let nx = lx - klem(lx, -o.hx, o.hx), nz = lz - klem(lz, -o.hz, o.hz);
    let d = Math.hypot(nx, nz);
    if (d >= r) return null;
    if (d > 1e-6) {
        nx /= d;
        nz /= d;
    } else if (o.hx - Math.abs(lx) < o.hz - Math.abs(lz)) {
        [nx, nz, d] = [Math.sign(lx) || 1, 0, Math.abs(lx) - o.hx];
    } else {
        [nx, nz, d] = [0, Math.sign(lz) || 1, Math.abs(lz) - o.hz];
    }
    return [nx * c - nz * s, nx * s + nz * c, r - d];
}

// ---------------------------------------------------------------------------
// Van binnen: dashboard, stijlen en een stuur dat meedraait (zichtbaar als je van binnen kijkt)
// ---------------------------------------------------------------------------

export const binnenkant = new THREE.Group();
const stuurwiel = new THREE.Group();
{
    const donker = mat('#23272e'), zwart = new THREE.MeshLambertMaterial({ color: '#15171b', depthTest: false });
    const dashboard = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1.36), donker);
    dashboard.position.set(0.1, 0.76, 0);
    dashboard.rotation.z = -0.08;
    binnenkant.add(dashboard);
    for (const z of [-0.6, 0.6]) {
        const stijl = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.06), donker);
        stijl.position.set(0.17, 0.95, z * 0.95);
        stijl.rotation.z = -0.33;
        binnenkant.add(stijl);
    }
    stuurwiel.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 32).rotateY(Math.PI / 2), zwart));
    stuurwiel.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.28), zwart));
    stuurwiel.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.03).translate(0, -0.075, 0), zwart));
    stuurwiel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 20).rotateZ(Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#d4101a', depthTest: false })));
    stuurwiel.children.forEach(m => { m.renderOrder = 1; });
    stuurwiel.position.set(0.3, 0.62, -0.33);
    stuurwiel.rotation.order = 'ZXY';
    stuurwiel.rotation.z = -0.45;
    binnenkant.add(stuurwiel);
    binnenkant.visible = false;
    sportwagen.add(binnenkant);
}

// ---------------------------------------------------------------------------
// Rook en bandensporen
// ---------------------------------------------------------------------------

const rookBeeld = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), verloop = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    verloop.addColorStop(0, 'rgba(255,255,255,1)');
    verloop.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = verloop;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
})();
const rook = Array.from({ length: 90 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: rookBeeld, color: '#b9bec4', transparent: true, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    return s;
});
let rookNr = 0;
function blaas(x, z, vx, vz, y) {
    const s = rook[rookNr++ % rook.length];
    s.position.set(x + Math.random() * 0.4 - 0.2, y + 0.3, z + Math.random() * 0.4 - 0.2);
    s.userData = { leven: 1, duur: 1 + Math.random() * 0.6, vx: vx * 0.3 + Math.random() - 0.5, vz: vz * 0.3 + Math.random() - 0.5 };
    s.visible = true;
}
function rookStap(dt) {
    for (const s of rook) {
        if (!s.visible) continue;
        const d = s.userData;
        d.leven -= dt / d.duur;
        if (d.leven <= 0) {
            s.visible = false;
            continue;
        }
        d.vx *= 1 - Math.min(1, 2 * dt);
        d.vz *= 1 - Math.min(1, 2 * dt);
        s.position.x += d.vx * dt;
        s.position.z += d.vz * dt;
        s.position.y += 0.7 * dt;
        s.scale.setScalar(1 + (1 - d.leven) * 3.5);
        s.material.opacity = 0.6 * d.leven * Math.min(1, (1 - d.leven) * 8);
    }
}

const SPOREN = 3000;
const sporen = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }), SPOREN);
sporen.count = 0;
sporen.position.y = 0.045;
sporen.frustumCulled = false;
scene.add(sporen);
let spoorNr = 0;
const vorigSpoor = [null, null], spoorMatrix = new THREE.Matrix4(), spoorDraai = new THREE.Quaternion(), stuurDraai = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
function spoor(i, x, z, y) { // om de 30 cm een stukje; de oudste gaan eerst weer weg
    const v = vorigSpoor[i], dx = v ? x - v[0] : 0, dz = v ? z - v[1] : 0, lengte = Math.hypot(dx, dz);
    if (v && lengte < 0.3) return;
    vorigSpoor[i] = [x, z];
    if (!v || lengte > 3) return;
    spoorDraai.setFromAxisAngle(Y, -Math.atan2(dz, dx));
    spoorMatrix.compose(new THREE.Vector3(x - dx / 2, y, z - dz / 2), spoorDraai, new THREE.Vector3(lengte, 1, 0.26));
    sporen.setMatrixAt(spoorNr++ % SPOREN, spoorMatrix);
    sporen.count = Math.min(spoorNr, SPOREN);
    sporen.instanceMatrix.needsUpdate = true; // ponytail: stuurt alle sporen opnieuw; updateRange als dit ooit hapert
}
export function wisSporen() {
    rook.forEach(s => { s.visible = false; });
    sporen.count = spoorNr = 0;
    vorigSpoor.fill(null);
}

// ---------------------------------------------------------------------------
// Geluid: motor (vijf versnellingen), piepende banden, een doffe klap. De claxon zit in sim.js.
// ---------------------------------------------------------------------------

let motor = null, stil = false;
export function geluidAan(aan) {
    stil = !aan;
    if (motor) motor.uit.gain.setTargetAtTime(aan ? 1 : 0, geluid.currentTime, 0.05);
}
export function startMotor() {
    geluid ||= new AudioContext();
    geluid.resume();
    const g = geluid, uit = g.createGain(), laag = g.createBiquadFilter(), brom = g.createGain();
    const zaag = g.createOscillator(), blok = g.createOscillator(), ruis = g.createBufferSource(), band = g.createBiquadFilter(), piep = g.createGain();
    zaag.type = 'sawtooth';
    blok.type = 'square';
    laag.type = 'lowpass';
    laag.frequency.value = 700;
    laag.Q.value = 2;
    brom.gain.value = 0.035;
    ruis.buffer = g.createBuffer(1, g.sampleRate, g.sampleRate);
    const d = ruis.buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ruis.loop = true;
    band.type = 'bandpass';
    band.frequency.value = 1700;
    band.Q.value = 3;
    piep.gain.value = 0;
    uit.gain.value = 0;
    zaag.connect(laag);
    blok.connect(laag);
    laag.connect(brom).connect(uit);
    ruis.connect(band).connect(piep).connect(uit);
    uit.connect(g.destination);
    for (const b of [zaag, blok, ruis]) b.start();
    motor = { zaag, blok, laag, brom, piep, uit, bronnen: [zaag, blok, ruis] };
}
function geluidStap(snel, glijden, gas) {
    if (!motor) return;
    const t = geluid.currentTime, versnelling = Math.min(4, Math.floor(snel / 7)), toeren = snel / 7 - versnelling;
    const hz = 38 + 55 * toeren + 10 * versnelling + 14 * gas;
    motor.zaag.frequency.setTargetAtTime(hz, t, 0.05);
    motor.blok.frequency.setTargetAtTime(hz / 2, t, 0.05);
    motor.laag.frequency.setTargetAtTime(400 + 900 * gas + 8 * snel, t, 0.08);
    motor.brom.gain.setTargetAtTime(0.025 + 0.02 * gas, t, 0.08);
    motor.piep.gain.setTargetAtTime(Math.min(0.3, glijden * 0.06), t, 0.05);
    // Klinkt alleen zolang er beelden komen: op een andere tab sterft het vanzelf weg.
    motor.uit.gain.cancelScheduledValues(t);
    motor.uit.gain.setTargetAtTime(stil ? 0 : 1, t, 0.05);
    motor.uit.gain.setTargetAtTime(0, t + 0.3, 0.1);
}
export function bonk(kracht) {
    if (!geluid || stil) return;
    const t = geluid.currentTime, o = geluid.createOscillator(), g = geluid.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    g.gain.setValueAtTime(Math.min(0.3, kracht * 0.02), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(geluid.destination);
    o.start(t);
    o.stop(t + 0.25);
}
// Korte toon (punten, controlepost, aftellen).
export function piep(toon = 880, duur = 0.12, sterk = 0.05) {
    if (!geluid || stil) return;
    const t = geluid.currentTime, o = geluid.createOscillator(), g = geluid.createGain();
    o.type = 'triangle';
    o.frequency.value = toon;
    g.gain.setValueAtTime(sterk, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    o.connect(g).connect(geluid.destination);
    o.start(t);
    o.stop(t + duur);
}
export function stopMotor() {
    if (!motor) return;
    const t = geluid.currentTime;
    motor.uit.gain.cancelScheduledValues(t);
    motor.uit.gain.setTargetAtTime(0, t, 0.08);
    motor.bronnen.forEach(b => b.stop(t + 0.5));
    motor = null;
}
