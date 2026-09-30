// Het rijspel: instappen in de sportwagen en rondrijden door het park, het driftpark, het bedrijfsterrein en de stad.
// Wordt pas geladen als je instapt (sim.js), zodat de site er verder niets van merkt. Dit bestand regelt starten en
// stoppen, elke stap, de camera, de schaduw, het pauzemenu en de instellingen. Bij stoppen staat alles weer zoals het was.
import { auto, zetNeer, rijd, binnenkant, wisSporen, startMotor, stopMotor, geluidAan, bonk } from './auto.js';
import { lees, startInvoer, stopInvoer, losLaten, invoerStaat, tril } from './invoer.js';
import { bouwWereld, parkObstakels, rekwisietenStap, ramenAan, dichtsteWeg, obstakelsRond, botstMet } from './wereld.js';
import { maakHud, toonHud, laden, zetZichtNaam, zetSnelheid, hudStap, tekenMinikaart, toonMenu, menuStap, menuKies } from './hud.js';
import { startDoelen, stopDoelen, doelenStap, bevroren, stippen, voortgang, stand, bewaar } from './doelen.js';
import { maakVerkeer, verkeerStap, verkeerObstakels } from './verkeer.js';
import { klem, hoekVerschil, ruis } from './hulp.js';
import { laadModel, BRON } from './model.js';

// De eigen stijl: pas nu laden.
document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./rit.css', import.meta.url).href }));

export let bezig = false; // pas als alles klaar is: sim.js roept dan elk beeld stap() aan
let laadt = false, pauze = false, zicht = 'kaart', kaartStand = null, site = null, gebouwd = false, vorigDonker = null;
const instelling = { geluid: stand.geluid ?? true, beeld: stand.beeld || 'mooi' };
const grasRuis = ruis(5000, 400); // gras met vlekjes: dan zie je dat je rijdt (het veld is 2 km)

export async function start() {
    if (bezig || laadt) return;
    laadt = true;
    maakHud();
    if (!gebouwd) {
        laden(true);
        await new Promise(klaar => requestAnimationFrame(() => setTimeout(klaar, 30))); // eerst het laadscherm tonen
        bouwWereld();
        parkObstakels();
        maakVerkeer();
        gebouwd = true;
    }
    laden(false);
    laadModel(); // de mooie auto komt er zo bij (niet op wachten)
    stand.ontgrendeld = true; // voortaan staat hij bij de busjes (sim.js)
    bewaar();
    const i = sim.actief.indexOf(sim.sport), snel = i >= 0 ? sim.sport.snel : 0;
    if (i >= 0) sim.actief.splice(i, 1); // de simulatie laat hem los
    zetNeer(sportwagen.position.x, sportwagen.position.z, -sportwagen.rotation.y, snel);
    Object.assign(auto, { omkijk: 0, schok: 0, kijk: auto.hoek });
    sportwagen.visible = true;
    const sc = zon.shadow.camera;
    site = { tempo: sim.tempo, pixel: renderer.getPixelRatio(), zon: zon.position.clone(), schaduw: [sc.left, sc.right, sc.top, sc.bottom, sc.far], bias: zon.shadow.bias };
    zetTempo(Math.min(sim.tempo, 10));
    eenKeer.hidden = false;
    controls.enablePan = false; // de kaart volgt de wagen
    mapEl.classList.add('rijdt');
    MAT.gras.map = grasRuis;
    MAT.gras.needsUpdate = true;
    toonHud(true);
    beeld(instelling.beeld);
    geluidAan(instelling.geluid);
    startInvoer();
    startMotor();
    toeter();
    startDoelen(auto);
    pauze = false;
    zetZicht(stand.zicht || 'kaart');
    history.pushState({ rijden: true }, ''); // de terugknop van de telefoon stopt het rijden, niet de site
    laadt = false;
    bezig = true;
    teken();
}

export function stop() {
    if (!bezig) return;
    zetZicht('kaart', false);
    bezig = false;
    pauze = invoerStaat.pauze = false;
    toonMenu(false);
    toonHud(false);
    stopInvoer();
    stopMotor();
    stopDoelen();
    wisSporen();
    controls.enablePan = true;
    mapEl.classList.remove('rijdt');
    MAT.gras.map = null;
    MAT.gras.needsUpdate = true;
    zetTempo(site.tempo);
    eenKeer.hidden = true;
    renderer.setPixelRatio(site.pixel);
    zon.castShadow = !zonderVideokaart;
    resize();
    const sc = zon.shadow.camera;
    [sc.left, sc.right, sc.top, sc.bottom, sc.far] = site.schaduw;
    sc.updateProjectionMatrix();
    zon.shadow.bias = site.bias;
    zon.position.copy(site.zon);
    zon.target.position.set(0, 0, 0);
    zon.target.updateMatrixWorld();
    sportwagen.userData.voorwielen.forEach(m => { m.rotation.y = 0; });
    const stuur = sportwagen.userData.stuur;
    stuur?.deel.quaternion.copy(stuur.basis);
    parkeerSportwagen(); // terug naar zijn plek bij de busjes (sim.js)
    if (history.state?.rijden) history.back();
    teken();
}
addEventListener('popstate', () => { if (bezig) stop(); });

// Elk beeld (vanuit sim.js), in echte tijd.
export function stap(dt) {
    if (!bezig) return;
    const invoer = lees();
    for (const actie of invoer.acties) {
        if (actie === 'pauze') zetPauze(!pauze);
        else if (pauze) {
            if (actie === 'op') menuStap(-1);
            else if (actie === 'neer') menuStap(1);
            else if (actie === 'kies') menuKies();
            else if (actie === 'terug') zetPauze(false);
        } else if (actie === 'camera') wisselZicht();
        else if (actie === 'toeter') toeter();
        else if (actie === 'los') los();
    }
    if (!bezig) return;
    if (donker !== vorigDonker) ramenAan(vorigDonker = donker);
    if (pauze) return teken();
    const g = rijd(dt, bevroren() ? { ...invoer, gas: 0, rem: 1, drift: false } : invoer, [...verkeerObstakels, ...parkVoertuigen()]);
    if (g.klap > 4) {
        bonk(g.klap);
        tril(g.klap / 12);
        auto.schok = Math.min(1, g.klap / 14);
    }
    rekwisietenStap(auto, dt);
    verkeerStap(auto, dt);
    doelenStap(auto, g, dt);
    zetSnelheid(g.snel * 3.6);
    hudStap();
    tekenMinikaart(auto, stippen(auto));
    cameraStap(dt, invoer, g);
    teken();
}

// Voertuigen van de simulatie op het park: daar bots je ook tegen.
const parkVoertuigen = () => sim.actief.filter(v => v.groep).map(v => {
    const hoek = -v.groep.rotation.y, m = v.voor - v.lengte / 2;
    return { x: v.groep.position.x + Math.cos(hoek) * m, z: v.groep.position.z + Math.sin(hoek) * m, hoek, hx: v.lengte / 2, hz: 0.95, h0: 3, h1: 3, bodem: 0 };
});

// Terug op de weg: vast tussen iets of in een rare hoek? Dan naar de dichtstbijzijnde vrije plek, rechtop en stil.
function los() {
    const vrij = (x, z) => {
        let ok = true;
        obstakelsRond(x, z, 5, o => { if (ok && botstMet(o, x, z, 0) && Math.abs((x - o.x) * Math.cos(o.hoek) + (z - o.z) * Math.sin(o.hoek)) < o.hx + 2.5 && Math.abs(-(x - o.x) * Math.sin(o.hoek) + (z - o.z) * Math.cos(o.hoek)) < o.hz + 2.5) ok = false; });
        return ok;
    };
    for (let straal = 0; straal <= 30; straal += 2.5) for (let k = 0; k < (straal ? 12 : 1); k++) {
        const x = auto.x + straal * Math.cos(k * Math.PI / 6), z = auto.z + straal * Math.sin(k * Math.PI / 6);
        if (vrij(x, z)) return zetNeer(x, z, auto.hoek);
    }
    const m = dichtsteWeg(auto.x, auto.z);
    zetNeer(m.x, m.z, Math.atan2(m.tz, m.tx));
}

// ---------------------------------------------------------------------------
// Pauze en instellingen
// ---------------------------------------------------------------------------

function zetPauze(aan) {
    pauze = invoerStaat.pauze = aan;
    if (aan) losLaten();
    toonMenu(aan, { keuzes: { zicht, tempo: sim.tempo, geluid: instelling.geluid, beeld: instelling.beeld }, voortgang: voortgang(), kies, bron: BRON });
    if (!aan) renderer.domElement.focus({ preventScroll: true });
}
function kies(wat, waarde) {
    if (wat === 'door') zetPauze(false);
    else if (wat === 'los') {
        zetPauze(false);
        los();
    } else if (wat === 'stop') stop();
    else if (wat === 'zicht') zetZicht(waarde);
    else if (wat === 'tempo') zetTempo(waarde);
    else if (wat === 'geluid') geluidAan(stand.geluid = instelling.geluid = waarde);
    else if (wat === 'beeld') beeld(stand.beeld = instelling.beeld = waarde);
    bewaar();
}
// Mooi: schaduw en scherp; snel: zonder schaduw en met minder pixels (voor een zwakke laptop).
function beeld(soort) {
    renderer.setPixelRatio(soort === 'snel' ? 1 : site.pixel);
    zon.castShadow = soort !== 'snel' && !zonderVideokaart;
    resize();
}

// ---------------------------------------------------------------------------
// Camera: de kaart volgt de wagen (standaard), achter de wagen aan, of vanaf de bestuurdersstoel (links).
// ---------------------------------------------------------------------------

const OOG = new THREE.Vector3(-0.35, 1.05, -0.33), kijkRichting = new THREE.Quaternion(), kijkHoek = new THREE.Euler();
// Beeldhoek (verticaal, zoals three.js wil) bij een gegeven breedte: rechtop op een telefoon zie je anders bijna niets.
const beeldhoek = (breed, max) => Math.min(max, 2 * Math.atan(Math.tan(breed * Math.PI / 360) / camera.aspect) * 180 / Math.PI);
let siteMist = null;
function zetZicht(naam, onthoud = true) {
    siteMist ||= { near: scene.fog.near, far: scene.fog.far, cameraFar: camera.far };
    if (zicht === 'kaart' && naam !== 'kaart') kaartStand = { afstand: camera.position.clone().sub(controls.target), fov: camera.fov, near: camera.near };
    zicht = naam;
    const kaart = naam === 'kaart';
    controls.enabled = kaart;
    labelsEl.style.visibility = kaart ? '' : 'hidden';
    binnenkant.visible = naam === 'binnen';
    if (kaart && kaartStand) { // terug naar de kaart zoals hij was, met de wagen in het midden
        camera.fov = kaartStand.fov;
        camera.near = kaartStand.near;
        controls.target.set(auto.x, 0, auto.z);
        camera.position.copy(controls.target).add(kaartStand.afstand);
        camera.lookAt(controls.target);
        kaartStand = null;
    }
    if (kaart) {
        Object.assign(scene.fog, { near: siteMist.near, far: siteMist.far });
        camera.far = siteMist.cameraFar;
        siteMist = null;
    } else {
        camera.near = naam === 'binnen' ? 0.1 : 0.3;
        camera.far = 660; // voorbij de mist is niets meer te zien
        Object.assign(scene.fog, { near: 160, far: 650 });
    }
    camera.updateProjectionMatrix();
    zetZichtNaam(naam);
    if (onthoud) {
        stand.zicht = naam;
        bewaar();
    }
    teken();
}
function wisselZicht() {
    const namen = ['kaart', 'achter', 'binnen'];
    zetZicht(namen[(namen.indexOf(zicht) + 1) % namen.length]);
}

function cameraStap(dt, invoer, g) {
    const a = auto, snel = g.snel;
    a.omkijk += (invoer.kijkX * 2.6 - a.omkijk) * Math.min(1, dt * 8); // rechterstick: rondkijken
    const schud = Math.sin(performance.now() / 1000 * 45) * a.schok * 0.25;
    a.schok *= Math.exp(-5 * dt);
    let middenX = a.x, middenZ = a.z, half = 90;
    if (zicht === 'kaart') { // de kaart schuift mee: de wagen blijft in het midden
        const dx = a.x - controls.target.x, dz = a.z - controls.target.z;
        controls.target.x += dx;
        controls.target.z += dz;
        camera.position.x += dx;
        camera.position.z += dz;
        if (invoer.kijkX) draaiCamera(-invoer.kijkX * 2 * dt);
        if (invoer.kijkY) camera.position.sub(controls.target).multiplyScalar(1 + invoer.kijkY * 1.5 * dt).add(controls.target);
        half = klem(camera.position.distanceTo(controls.target) * 0.7, 60, 180);
    } else if (zicht === 'achter') { // kijkt half mee met waar hij heen glijdt, en loopt iets achter het draaien aan
        const gaat = g.voor > 3 ? Math.atan2(a.vz, a.vx) : a.hoek;
        a.kijk += hoekVerschil(a.hoek + hoekVerschil(gaat, a.hoek) * 0.5, a.kijk) * Math.min(1, dt * 5);
        const hoek = a.kijk + (invoer.achterom ? Math.PI : a.omkijk), kx = Math.cos(hoek), kz = Math.sin(hoek);
        const hoog = (camera.aspect < 1 ? 5 : 3) + invoer.kijkY * 2.5;
        camera.position.set(a.x - kx * 7.5, a.y + hoog + schud, a.z - kz * 7.5);
        camera.lookAt(a.x + kx * 3, a.y + 1, a.z + kz * 3);
        camera.fov = beeldhoek(80 + snel * 0.4, 90);
        camera.updateProjectionMatrix();
        middenX += kx * 45;
        middenZ += kz * 45;
    } else {
        sportwagen.updateMatrixWorld();
        camera.position.copy(OOG).applyMatrix4(sportwagen.matrixWorld);
        kijkRichting.setFromEuler(kijkHoek.set(-0.06 - invoer.kijkY * 0.6, -Math.PI / 2 - (invoer.achterom ? Math.PI : a.omkijk), 0, 'YXZ'));
        camera.quaternion.copy(sportwagen.quaternion).multiply(kijkRichting);
        camera.position.y += schud * 0.5;
        camera.fov = beeldhoek(95 + snel * 0.3, 100);
        camera.updateProjectionMatrix();
        middenX += Math.cos(a.hoek) * 40;
        middenZ += Math.sin(a.hoek) * 40;
        half = 80;
    }
    schaduw(middenX, middenZ, half);
}

// Schaduw valt alleen binnen een vierkant rond het doel van de zon. Dat vierkant ligt over wat je ziet en schuift in
// hele schaduwpixels mee (in de richting van het licht gemeten), anders trillen de randen bij elke beweging.
const LICHT = new THREE.Vector3(-40, 70, -15).normalize(), LX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LICHT).normalize();
const LY = new THREE.Vector3().crossVectors(LICHT, LX), doel = new THREE.Vector3();
function schaduw(x, z, half) {
    const sc = zon.shadow.camera;
    if (sc.right !== half) {
        Object.assign(sc, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 650 });
        sc.updateProjectionMatrix();
        zon.shadow.bias = -0.00015;
    }
    const pixel = 2 * half / zon.shadow.mapSize.x, rond = v => Math.round(v / pixel) * pixel;
    doel.set(x, 0, z);
    const lx = rond(doel.dot(LX)), ly = rond(doel.dot(LY)), lz = doel.dot(LICHT);
    doel.copy(LX).multiplyScalar(lx).addScaledVector(LY, ly).addScaledVector(LICHT, lz);
    zon.target.position.copy(doel);
    zon.target.updateMatrixWorld();
    zon.position.copy(doel).addScaledVector(LICHT, 300);
}
