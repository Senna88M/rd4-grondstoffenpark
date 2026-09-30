// ---------------------------------------------------------------------------
// Simulatie: een dag op het park. Voertuigen rijden in, wachten bij de slagboom, lossen aan
// de kant van hun container en wachten op elkaar. Langs een lossend voertuig kun je aan de
// andere kant; staat er aan beide kanten een, dan wacht je tot er een kant vrij is.
// Uit de meting: hoeveel voertuigen van elk type, welke containers elk type bezocht, de
// verblijfstijd per container en de wachttijd bij de slagboom (gemiddeld precies zoals gemeten).
// Aangenomen: het verloop over de dag, welke containers één bezoeker combineert, de spreiding
// van de tijden en de snelheid.
// ---------------------------------------------------------------------------

const DRUKTE = 1.5;      // aantal voertuigen × de meetdag (170); de verhoudingen blijven gelijk
const VERLOOP = [0.8, 1, 1.2, 1, 0.9, 1.1, 1.2, 1, 0.8]; // aankomsten per uur vanaf 9:00; het laatste is een half uur
const OPEN = 9;          // uur (ma t/m vr)
const SNELHEID = 2.8;    // m/s, stapvoets (10 km/h)
const OPZIJ = 1.15;      // m uit het midden bij lossen of inhalen: twee voertuigen passen naast elkaar
const AFSTAND = 1.5;     // m tussen twee voertuigen achter elkaar
const NADER = 12;        // m voor de container kiest een voertuig zijn plek en gaat naar die kant
const VOORUIT = 6;       // m: staat er iets dichterbij in de weg, dan gaat een voertuig erlangs
const STAP = 0.25;       // s per rekenstap

// Afstand langs de rijroute (m) → punt op de kaart; voor het begin en na het eind rechtdoor.
const ROUTE = [];
let routeLengte = 0;
PLATTEGROND.route.slice(1).forEach(([x, z], i) => {
    const [x0, z0] = PLATTEGROND.route[i], l = Math.hypot(x - x0, z - z0);
    ROUTE.push({ x0, z0, dx: (x - x0) / l, dz: (z - z0) / l, l, s0: routeLengte });
    routeLengte += l;
});
function punt(s, uit) {
    let i = 0;
    while (i < ROUTE.length - 1 && s > ROUTE[i].s0 + ROUTE[i].l) i++;
    const g = ROUTE[i], t = s - g.s0;
    return uit.set(g.x0 + g.dx * t, 0, g.z0 + g.dz * t);
}

// Dichtstbijzijnde plek op de route; kant 1 = rechts van de rijrichting, −1 = links.
function opRoute(x, z) {
    let beste;
    for (const g of ROUTE) {
        const t = THREE.MathUtils.clamp((x - g.x0) * g.dx + (z - g.z0) * g.dz, 0, g.l);
        const ox = x - g.x0 - g.dx * t, oz = z - g.z0 - g.dz * t, afstand = Math.hypot(ox, oz);
        if (!beste || afstand < beste.afstand) beste = { afstand, s: g.s0 + t, kant: Math.sign(g.dx * oz - g.dz * ox) };
    }
    return beste;
}
const SLAGBOOM_S = opRoute(sx, sz).s;
const LOSPLEKKEN = {}; // per stroom, op volgorde langs de route
for (const [id, x, z] of PLATTEGROND.containers) {
    if (id && STROMEN[id].bezoeken) (LOSPLEKKEN[id] = LOSPLEKKEN[id] || []).push(opRoute(x, z));
}
Object.values(LOSPLEKKEN).forEach(p => p.sort((a, b) => a.s - b.s));
const laatstePlek = id => LOSPLEKKEN[id][LOSPLEKKEN[id].length - 1].s;

// Voertuigen worden hergebruikt. De eerste van elk type levert de maten (m, vanaf het midden van de
// wagen): voorkant, lengte met aanhanger, en bij een aanhanger de trekhaak en de as daarachter.
const garage = VOERTUIGTYPES.map(() => []);
const MAAT = VOERTUIGTYPES.map((_, type) => {
    const g = maakVoertuig(type), b = new THREE.Box3().setFromObject(g);
    g.visible = false;
    garage[type].push(g);
    const a = g.userData.aanhanger;
    return { voor: b.max.x, lengte: b.max.x - b.min.x, haak: a && a.position.x * VOERTUIGSCHAAL, as: a && a.userData.as * VOERTUIGSCHAAL };
});
const pak = type => { const g = garage[type].pop() || maakVoertuig(type); g.visible = true; return g; };
const parkeerIn = v => { v.groep.visible = false; if (!v.sport) garage[v.type].push(v.groep); };

// Een rode sportwagen die af en toe een rondje rijdt (zie nieuweDag): staat nergens in de rij en stopt bij één
// container, gekozen naar de verhouding van alle bezoeken (dus meestal Restafval). Voorkant = +x.
function maakSportwagen() {
    const groep = new THREE.Group();
    const lak = new THREE.MeshPhongMaterial({ color: '#d4101a', shininess: 90, specular: 0x777777 });
    const glas = new THREE.MeshPhongMaterial({ color: '#111821', shininess: 120, specular: 0x999999 });
    const deel = (geo, materiaal, x, y, z = 0) => {
        const m = new THREE.Mesh(geo, materiaal);
        m.position.set(x, y, z);
        groep.add(m);
        return m;
    };
    // Zijaanzicht, over de breedte uitgerekt met ronde randen.
    const profiel = (teken, breedte, materiaal) => {
        const vorm = new THREE.Shape();
        teken(vorm);
        const geo = new THREE.ExtrudeGeometry(vorm, { depth: breedte, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 10 });
        deel(geo.translate(0, 0, -breedte / 2), materiaal, 0, 0);
    };
    profiel(v => { // lage wig: lange neus, korte staart
        v.moveTo(-2.1, 0.25);
        v.lineTo(2.05, 0.25);
        v.quadraticCurveTo(2.28, 0.28, 2.2, 0.47);
        v.quadraticCurveTo(1.7, 0.6, 0.8, 0.72);
        v.lineTo(-1.7, 0.78);
        v.quadraticCurveTo(-2.1, 0.78, -2.1, 0.6);
        v.lineTo(-2.1, 0.25);
    }, 1.7, lak);
    profiel(v => { // glazen kap die naar achteren afloopt
        v.moveTo(0.85, 0.7);
        v.quadraticCurveTo(0.3, 1.08, -0.35, 1.1);
        v.quadraticCurveTo(-1.2, 1.08, -1.75, 0.76);
        v.lineTo(0.85, 0.7);
    }, 1.3, glas);
    const band = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 20).rotateX(Math.PI / 2);
    const velg = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 12).rotateX(Math.PI / 2);
    const voorwielen = []; // draaien mee met sturen
    for (const x of [1.35, -1.3]) for (const z of [-0.86, 0.86]) {
        const wiel = [deel(band, mat('#1b1d21'), x, 0.33, z), deel(velg, mat('#c9ced6'), x, 0.33, z)];
        if (x > 0) voorwielen.push(...wiel);
    }
    groep.userData.voorwielen = voorwielen;
    deel(new THREE.BoxGeometry(0.34, 0.04, 1.66), lak, -1.98, 1.02);             // spoiler
    for (const z of [-0.55, 0.55]) deel(new THREE.BoxGeometry(0.07, 0.22, 0.07), mat('#1b1d21'), -1.95, 0.9, z);
    const licht = kleur => new THREE.MeshBasicMaterial({ color: kleur });         // brandt altijd
    for (const z of [-0.58, 0.58]) {
        deel(new THREE.BoxGeometry(0.05, 0.07, 0.38), licht('#fff4cf'), 2.19, 0.45, z);
        deel(new THREE.BoxGeometry(0.05, 0.08, 0.5), licht('#ff2525'), -2.14, 0.64, z);
    }
    groep.scale.setScalar(VOERTUIGSCHAAL);
    groep.rotation.order = 'YXZ'; // eerst sturen, dan hellen en veren om zijn eigen assen
    groep.traverse(m => { m.castShadow = true; m.userData.id = 'sportwagen'; });
    const vang = deel(new THREE.BoxGeometry(6.5, 2.6, 3.6), new THREE.MeshLambertMaterial({ visible: false }), 0, 1.1); // onzichtbaar, ruimer klikvlak
    vang.userData.id = 'sportwagen';
    scene.add(groep);
    return groep;
}
const sportwagen = maakSportwagen();
const SPORTMAAT = (() => {
    const b = new THREE.Box3().setFromObject(sportwagen);
    return { voor: b.max.x, lengte: b.max.x - b.min.x, haak: null, as: null };
})();
sportwagen.visible = false;
sportwagen.traverse(m => { if (m.isMesh && m.material.emissive) klikbaar.push(m); }); // telt alleen als hij te zien is (zie raak)

// Waar de sportwagen op het scherm staat (px), of null als hij er niet is.
function sportwagenOpScherm() {
    if (!sportwagen.visible) return null;
    const p = sportwagen.position.clone().project(camera), r = renderer.domElement.getBoundingClientRect();
    return p.z < 1 ? [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height] : null;
}
// Een tik vlak naast hem telt ook (raak, script.js): met een vinger raak je zo'n klein ding anders moeilijk.
function tikBijSportwagen(e) {
    const p = e.pointerType === 'touch' && !rit?.bezig && sportwagenOpScherm();
    return !!p && Math.hypot(p[0] - e.clientX, p[1] - e.clientY) < 45;
}

// Is hij op het park, dan loopt de tijd even langzaam zodat je hem kunt aanklikken: met een muis als die in de
// buurt is, zonder muis (telefoon, tablet) zolang hij in beeld is en niet stilstaat om te lossen.
let cursor = null;
renderer.domElement.addEventListener('pointermove', e => { cursor = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerleave', () => { cursor = null; });
const zonderMuis = matchMedia('(hover: none)');
function vertraagBijSportwagen() {
    const v = sim.sport, p = !rit?.bezig && sim.actief.includes(v) && sportwagenOpScherm();
    if (!p) return false;
    if (!zonderMuis.matches) return !!cursor && Math.hypot(p[0] - cursor[0], p[1] - cursor[1]) < 150;
    const r = renderer.domElement.getBoundingClientRect();
    return !v.lossen && p[0] > r.left && p[0] < r.right && p[1] > r.top && p[1] < r.bottom;
}

// Geluid (ook voor het rijspel).
let geluid;
// Claxon: twee tonen een grote terts uit elkaar (zoals een echte), zacht aan en uit, gedempt zodat hij niet schel is. Kort-lang.
function toeter() {
    geluid ||= new AudioContext();
    geluid.resume();
    const nu = geluid.currentTime, demper = geluid.createBiquadFilter(), uit = geluid.createGain();
    demper.type = 'lowpass';
    demper.frequency.value = 1600;
    uit.gain.value = 0.018;
    demper.connect(uit).connect(geluid.destination);
    for (const [start, duur] of [[0, 0.14], [0.22, 0.32]]) {
        const t = nu + start, g = geluid.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(1, t + 0.02);
        g.gain.setValueAtTime(1, t + duur - 0.06);
        g.gain.linearRampToValueAtTime(0, t + duur);
        g.connect(demper);
        for (const toon of [440, 554]) {
            const o = geluid.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = toon;
            o.connect(g);
            o.start(t);
            o.stop(t + duur);
        }
    }
}

// Instappen: het rijspel (rit/) wordt pas geladen als je voor het eerst instapt; de site merkt er verder niets van.
// Na de eerste rit staat de sportwagen vast naast de busjes voor de ingang (ook na herladen); dan komt hij niet meer
// zelf aanrijden.
const SPORTPLEK = [-34.4, 0.2, -Math.PI / 4]; // x, z, draai
function parkeerSportwagen() {
    sportwagen.position.set(SPORTPLEK[0], 0, SPORTPLEK[1]);
    sportwagen.rotation.set(0, SPORTPLEK[2], 0);
    sportwagen.visible = true;
}
try {
    if (JSON.parse(localStorage.getItem('rd4-rit') || '{}').ontgrendeld) {
        parkeerSportwagen();
        setTimeout(() => import('./rit/model.js').then(m => m.laadModel(), () => { }), 3000); // de mooie auto erbij
    }
} catch { }
let rit = null;
async function stuur() {
    if (rit?.bezig) return toeter(); // tik op je eigen wagen
    rit ||= await import('./rit/rit.js').catch(() => null);
    rit?.start();
}
// Controller: met A stap je in als de sportwagen op de kaart staat.
let aVorige = false;
function padA() {
    const p = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null, a = !!p?.buttons[0]?.pressed, nieuw = a && !aVorige;
    aVorige = a;
    return nieuw;
}

// ---------------------------------------------------------------------------
// De dag vooraf: wie komt wanneer, met welk voertuig, naar welke containers
// ---------------------------------------------------------------------------

// Aantallen × DRUKTE in hele voertuigen: samen precies het totaal × DRUKTE en elk hooguit één van
// zijn aandeel af (grootste rest; gelijke resten wisselen per dag). Zo blijven de verhoudingen die van de meting.
function verdeel(aantallen, r) {
    const aandeel = aantallen.map(a => a * DRUKTE), uit = aandeel.map(Math.floor);
    const over = Math.floor(som(aandeel, a => a) + r()) - som(uit, a => a);
    aandeel.map((a, i) => [a - uit[i] + r() * 1e-9, i]).sort((x, y) => y[0] - x[0]).slice(0, over).forEach(([, i]) => uit[i]++);
    return uit;
}

function planDag(zaadje) {
    const r = zaad(zaadje), plan = [];
    const perType = verdeel(VOERTUIG_AANTAL, r);
    const bezoeken = VOERTUIGTYPES.flatMap((_, type) => ACTIEF.map(id => ({ type, id })));
    verdeel(bezoeken.map(b => STROMEN[b.id].voertuigen[b.type]), r).forEach((n, i) => { bezoeken[i].n = n; });
    VOERTUIGTYPES.forEach((_, type) => {
        // Evenveel bezoeken per container als dit type bracht, verdeeld over zijn voertuigen:
        // eerst één per voertuig, de rest bij voertuigen die daar nog niet heen gingen.
        const stops = hussel(bezoeken.filter(b => b.type === type).flatMap(b => Array(b.n).fill(b.id)), r);
        const lijsten = stops.splice(0, perType[type]).map(id => [id]);
        for (const id of stops) {
            const kan = lijsten.filter(l => !l.includes(id));
            if (kan.length) kan[Math.floor(r() * kan.length)].push(id);
        }
        for (const ids of lijsten) plan.push({
            type, ...MAAT[type],
            // Op volgorde langs de route (naar de laatste plek: bij een stroom met meer containers ligt er altijd één voor je).
            stops: ids.sort((a, b) => laatstePlek(a) - laatstePlek(b)).map(id => ({ id, duur: STROMEN[id].verblijf * (0.6 + 0.8 * r()) })),
            slagboom: 0.5 + r()
        });
    });
    // Verblijf per container: gemiddeld precies het gemeten.
    for (const id of ACTIEF) {
        const alle = plan.flatMap(v => v.stops.filter(s => s.id === id));
        const f = STROMEN[id].verblijf * alle.length / som(alle, s => s.duur);
        alle.forEach(s => { s.duur *= f; });
    }
    // Aankomsten verspreid over de dag volgens VERLOOP: gelijkmatig met wat toeval.
    hussel(plan, r);
    const massa = VERLOOP.map((w, u) => w * Math.min(1, METING.openingsuren - u));
    const totaal = som(massa, m => m);
    plan.forEach((v, i) => {
        let m = (i + r()) / plan.length * totaal, u = 0;
        while (u < massa.length - 1 && m > massa[u]) m -= massa[u++];
        v.aankomst = (u + m / VERLOOP[u]) * 3600;
    });
    // Slagboom: elk voertuig wacht zijn eigen tijd, gerekend vanaf het aansluiten in de rij, en mag door
    // als die om is en hij vooraan staat. Die tijden zo schalen dat het wachten gemiddeld precies het
    // gemeten is (wie achter een ander vastzit, wacht langer). Halveren met proefritten.
    const gemeten = METING.wachttijdSlagboom, basis = plan.map(v => v.slagboom * plan.length / som(plan, w => w.slagboom)); // gemiddeld 1
    let laag = 0, hoog = gemeten;
    for (let i = 0; i < 16; i++) {
        const k = (laag + hoog) / 2;
        plan.forEach((v, j) => { v.slagboom = basis[j] * k; });
        const wacht = wachtBijSlagboom(plan);
        if (Math.abs(wacht - gemeten) < 0.2) break;
        if (wacht > gemeten) hoog = k; else laag = k;
    }
    return plan;
}

// Proefrit over alleen de toegangsweg, met dezelfde regels: hoe lang wacht een voertuig gemiddeld bij de slagboom?
function wachtBijSlagboom(plan) {
    const proef = { t: 0, plan: plan.map(v => ({ ...v, stops: [] })), volgende: 0, actief: [], weg: [], arm: 0, alleenIngang: true };
    while (proef.volgende < proef.plan.length || proef.actief.length) {
        // Vooruitspoelen als er niets verandert: niemand op de weg, of iedereen staat stil voor de slagboom.
        const nieuw = proef.plan[proef.volgende], eerste = proef.actief[0];
        if (!eerste) proef.t = Math.max(proef.t, nieuw.aankomst - STAP);
        else if (eerste.vooraan && eerste.slagboom - eerste.wacht > STAP && proef.actief.every(v => !v.snel)) {
            const binnenkort = nieuw && nieuw.aankomst > proef.t ? nieuw.aankomst - proef.t - STAP : Infinity;
            const niemandErbij = !nieuw || nieuw.aankomst > proef.t || proef.actief.some(w => w.s - w.lengte <= AFSTAND);
            const sprong = niemandErbij ? Math.min(eerste.slagboom - eerste.wacht - STAP, binnenkort) : 0;
            if (sprong > 0) {
                proef.t += sprong;
                proef.actief.forEach(v => { v.wacht += sprong; });
            }
        }
        stap(proef, STAP);
    }
    return som(proef.plan, v => v.wacht) / proef.plan.length;
}

// ---------------------------------------------------------------------------
// Rijden en wachten. Elk voertuig: s = voorkant langs de route (m), baan −1/0/1 (links, midden,
// rechts), d = werkelijke zijwaartse plek (m). Midden botst met alles; links en rechts niet met elkaar.
// Wie nog opzij schuift, staat half in het midden: `bezet` is dan 0.
// ---------------------------------------------------------------------------

const sim = { dag: 1, t: 0, plan: [], volgende: 0, actief: [], weg: [], arm: 0, sport: null, sportKwam: true, speelt: false, tempo: 30, huidigTempo: 30, vorige: null };
let opPark = []; // de voertuigen van de stap die nu gerekend wordt (echt of proef)
let slagboomOpen = false;

function nieuweDag() {
    // Sportwagen: op de helft van de dagen, hooguit één keer. Kwam hij gisteren niet, dan vandaag zeker.
    const r = zaad(sim.dag * 7919);
    let sport = null;
    if (!sim.sportKwam || r() < 0.5) {
        let x = r() * TOTAAL_STOPS;
        const id = ACTIEF.find(i => (x -= STROMEN[i].bezoeken) < 0) || ACTIEF[0];
        sport = { sport: true, ...SPORTMAAT, stops: [{ id, duur: STROMEN[id].verblijf * (0.6 + 0.8 * r()) }], slagboom: 0,
            aankomst: 1800 + r() * (OPENINGSTIJD - 5400) };
    }
    if (sportwagen.visible) sport = null; // je hebt hem al (je rijdt, of hij staat waar je hem liet): geen tweede
    Object.assign(sim, { t: 0, plan: planDag(sim.dag++), volgende: 0, sport, sportKwam: false });
}

const botst = (a, b) => !a || !b || a === b;

// Tot waar kan v in baan b rijden voor hij iemand raakt? Rijden er twee aan weerskanten die
// allebei terug naar het midden willen (net klaar met lossen), dan laat de achterste de voorste voorgaan.
function limiet(v, b) {
    let s = Infinity;
    for (const w of opPark) {
        const voorlaten = b && w.bezet === -b && !w.doel && !w.lossen;
        if (w.s > v.s && (botst(b, w.bezet) || voorlaten)) s = Math.min(s, w.s - w.lengte - AFSTAND);
    }
    return s;
}

// Kan v nu naar baan b? Niet als er iemand naast staat, en voorrang voor wie van achteren aan
// de andere kant aankomt (die zou anders moeten remmen voor iemand die ineens voor hem opduikt).
const kanNaar = (v, b) => opPark.every(w => w === v || !botst(b, w.bezet) || w.s - w.lengte >= v.s + 1
    || w.s <= v.s - v.lengte - (w.snel > 0.3 && !botst(v.bezet, w.bezet) ? VOORUIT : 1));

// Staat er iemand aan die kant van de container? Een plek is vrij als daar niemand staat en niemand erheen gaat.
const staatOp = (p, v) => opPark.some(w => w !== v && w.baan === p.kant
    && w.s > p.s - v.lengte / 2 - AFSTAND && w.s - w.lengte < p.s + v.lengte / 2 + AFSTAND);
const plekVrij = (p, v) => !staatOp(p, v) && opPark.every(w => w === v || w.doel !== p);

function beweeg(v, dt) {
    if (v.lossen) {
        if ((v.nog -= dt) > 0) return;
        v.lossen = false;
        v.doel = null;
        v.stops.shift();
    }
    let doelS = Infinity, banen = [0, -1, 1];
    if (!v.binnen) {
        doelS = SLAGBOOM_S - 0.3;
        banen = [0];
        v.vooraan = doelS - v.s < 0.3 && v.snel < 0.1;
        if (v.vooraan && v.wacht >= v.slagboom && (!v.sport || slagboomOpen)) v.binnen = true; // de sportwagen wacht alleen op de arm
    } else if (v.stops.length) {
        const vooruit = LOSPLEKKEN[v.stops[0].id].filter(p => p.s + v.lengte / 2 >= v.s - 0.01);
        if (!v.doel && vooruit[0].s + v.lengte / 2 - v.s < NADER) v.doel = vooruit.find(p => plekVrij(p, v)) || vooruit[0];
        if (v.doel) {
            // Midden van het voertuig bij de container. Staat daar al iemand, dan erachter aansluiten
            // aan dezelfde kant; staat er iemand bij een container ervoor, dan eromheen.
            doelS = v.doel.s + v.lengte / 2;
            banen = staatOp(v.doel, v) ? [v.doel.kant, 0] : [v.doel.kant, 0, -v.doel.kant];
        }
    }

    // Baan kiezen: de gewenste als die de komende meters vrij is, anders waar je het verst komt.
    // Kan het nergens heen (je rijdt ernaast), dan blijf je staan tot dat wel kan.
    const ruimte = b => Math.min(doelS, limiet(v, b)) - v.s;
    const opties = banen.filter(b => b === v.baan || kanNaar(v, b));
    const wens = banen[0];
    let keus = v.baan, verst = opties.length ? -Infinity : 0;
    if (opties.includes(wens) && ruimte(wens) >= Math.min(doelS - v.s, VOORUIT)) keus = wens;
    else for (const b of opties) {
        const r = ruimte(b);
        if (r > verst || r === verst && (b === wens || b === v.baan && keus !== wens)) {
            keus = b;
            verst = r;
        }
    }
    v.baan = keus;

    // Vooruit: optrekken, remmen voor wie voor je staat of voor je eigen plek.
    const r = opties.length ? Math.max(0, Math.min(ruimte(keus), ruimte(v.bezet))) : 0;
    const wil = r < 0.05 ? 0 : Math.min(SNELHEID, r * 0.8);
    v.snel += THREE.MathUtils.clamp(wil - v.snel, -3 * dt, dt);
    v.s += Math.min(v.snel * dt, r);
    // Opzij: langzaam uit stilstand, sneller al rijdend.
    const max = (0.3 + 0.4 * v.snel) * dt;
    v.dv = THREE.MathUtils.clamp(keus * OPZIJ - v.d, -max, max) / dt;
    v.d += v.dv * dt;
    v.bezet = Math.abs(v.d - keus * OPZIJ) < 0.05 ? keus : 0;

    if (v.doel && keus === v.doel.kant && Math.abs(v.d - keus * OPZIJ) < 0.05 && doelS - v.s < 0.3 && v.snel < 0.1) {
        v.lossen = true;
        v.nog = v.stops[0].duur;
    }
}

const rijBinnen = (park, v, wacht) => {
    Object.assign(v, { s: 0, snel: SNELHEID, baan: 0, bezet: 0, d: 0, dv: 0, binnen: false, vooraan: false, doel: null, lossen: false, wacht });
    park.actief.push(v);
};

function stap(park, dt) {
    park.t += dt;
    const nieuw = park.plan[park.volgende];
    if (nieuw && nieuw.aankomst <= park.t && park.actief.every(w => w.s - w.lengte > AFSTAND)) {
        const buiten = park.t - nieuw.aankomst; // stond al buiten beeld in de rij
        rijBinnen(park, nieuw, buiten >= STAP ? buiten : 0);
        park.volgende++;
    }
    // De sportwagen komt pas als de weg naar de slagboom leeg is, zodat hij nergens in de rij staat.
    const sport = park.sport;
    if (sport && !sport.gekomen && sport.aankomst <= park.t && park.actief.every(w => w.binnen)) {
        rijBinnen(park, sport, 0);
        sport.gekomen = park.sportKwam = true;
    }
    slagboomOpen = park.arm >= 1.4;
    opPark = park.actief.sort((a, b) => b.s - a.s); // voorste eerst
    for (const v of opPark) {
        beweeg(v, dt);
        if (!v.binnen && (v.wacht || v.snel < 0.1)) v.wacht += dt; // loopt vanaf het aansluiten in de rij
    }
    const einde = park.alleenIngang ? SLAGBOOM_S + 2 : routeLengte; // de weg af (proefrit: voorbij de slagboom)
    park.weg.push(...park.actief.filter(v => v.s - v.lengte > einde));
    park.actief = park.actief.filter(v => v.s - v.lengte <= einde);
    // Slagboom omhoog vlak voordat iemand door mag, omlaag als hij erdoor is.
    const open = park.actief.some(v => v.binnen ? v.s - v.lengte < SLAGBOOM_S + 1 : v.vooraan && v.slagboom - v.wacht < 2);
    park.arm = THREE.MathUtils.clamp(park.arm + (open ? dt : -dt), 0, 1.4);
}

// ---------------------------------------------------------------------------
// Op de kaart
// ---------------------------------------------------------------------------

// Richting (radialen) van een stuk voertuig dat met zijn voor- en achterpunt op de route staat.
const voorkant = new THREE.Vector3(), achterkant = new THREE.Vector3();
const richting = (voor, achter) => {
    punt(voor, voorkant);
    punt(achter, achterkant);
    return Math.atan2(voorkant.z - achterkant.z, voorkant.x - achterkant.x);
};

// Alleen opnieuw tekenen als er iets bewoog: op rustige momenten is het park leeg of staat iedereen stil.
function plaatsVoertuigen() {
    let bewogen = sim.weg.length > 0 || scharnier.rotation.x !== -sim.arm;
    for (const v of sim.weg.splice(0)) parkeerIn(v);
    for (const v of sim.actief) {
        if (v.groep && !v.snel && !v.dv) continue; // staat stil, dus staat al goed
        bewogen = true;
        if (!v.groep) {
            v.groep = v.sport ? sportwagen : pak(v.type);
            v.groep.visible = true;
        }
        // De wagen van voorkant tot trekhaak (of achterkant) op de route, iets gedraaid bij opzij gaan.
        const kop = v.haak ? v.voor - v.haak : v.lengte;
        const hoek = richting(v.s, v.s - kop), rx = Math.cos(hoek), rz = Math.sin(hoek);
        const x = voorkant.x - rx * v.voor - rz * v.d, z = voorkant.z - rz * v.voor + rx * v.d; // (−rz, rx) = naar rechts
        const gedraaid = hoek + Math.atan(v.dv / Math.max(v.snel, 1.5));
        v.groep.position.set(x, 0, z);
        v.groep.rotation.y = -gedraaid;
        // De aanhanger hangt aan de trekhaak en wijst naar zijn as, die de route volgt: zo neemt hij de bocht apart.
        if (v.haak) {
            const hx = x + Math.cos(gedraaid) * v.haak, hz = z + Math.sin(gedraaid) * v.haak;
            const ah = richting(v.s - kop, v.s - kop - v.as); // achterkant = de as op de route
            const ax = achterkant.x - Math.sin(ah) * v.d, az = achterkant.z + Math.cos(ah) * v.d;
            v.groep.userData.aanhanger.rotation.y = gedraaid - Math.atan2(hz - az, hx - ax);
        }
        if (v.sport) { // veert licht op en neer zolang hij rijdt
            const fase = performance.now() / 1000 * 14, veer = v.snel > 0.3 ? 1 : 0;
            v.groep.position.y = (1 - Math.cos(fase)) * 0.03 * veer;
            v.groep.rotation.z = Math.sin(fase) * 0.012 * veer;
        }
    }
    scharnier.rotation.x = -sim.arm;
    const m = OPEN * 60 + Math.floor(sim.t / 60), klok = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    if (klokEl.textContent !== klok) klokEl.textContent = klok;
    if (bewogen) teken();
}

const speelKnop = document.getElementById('sim-speel');
const klokEl = document.getElementById('sim-klok');
const tempoEl = document.getElementById('sim-tempo');

function speel(aan) {
    if (aan) teken(); // de beeldenlus weer op gang
    sim.speelt = aan;
    sim.vorige = null;
    speelKnop.setAttribute('aria-pressed', aan);
    speelKnop.setAttribute('aria-label', aan ? 'Pauzeren' : 'Afspelen');
}
speelKnop.addEventListener('click', () => speel(!sim.speelt));
function zetTempo(tempo) {
    sim.tempo = tempo;
    tempoEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.tempo === tempo));
}
tempoEl.addEventListener('click', e => {
    const knop = e.target.closest('[data-tempo]');
    if (knop) zetTempo(+knop.dataset.tempo);
});
pijlGroep(tempoEl);
// 1× alleen tijdens het rijden (stuur): dan loopt het park op echte snelheid mee.
const eenKeer = document.createElement('button');
eenKeer.textContent = '1×';
eenKeer.dataset.tempo = 1;
eenKeer.hidden = true;
eenKeer.setAttribute('aria-pressed', false);
tempoEl.prepend(eenKeer);

// Elke frame vanuit script.js. Alleen tijdens afspelen, en hooguit zo'n 30 keer per seconde.
simStap = nu => {
    const rijdt = rit?.bezig;
    if (!sim.speelt && !rijdt) return;
    wakker(); // tijdens afspelen of rijden blijven beelden komen
    if (!rijdt && nu - sim.vorige < 30) return; // zelf rijden wel elk beeld, anders reageert hij traag
    if (!rijdt && sportwagen.visible && padA()) stuur();
    const echt = sim.vorige === null ? 0 : Math.min(nu - sim.vorige, 100) / 1000;
    sim.vorige = nu;
    if (rijdt) rit.stap(echt);
    if (!sim.speelt) return;
    // Bij de sportwagen: snel af naar hooguit 2×, daarna rustig weer op tempo.
    const doelTempo = vertraagBijSportwagen() ? Math.min(sim.tempo, 2) : sim.tempo;
    sim.huidigTempo += (doelTempo - sim.huidigTempo) * (doelTempo < sim.huidigTempo ? 0.35 : 0.08);
    for (let dt = echt * sim.huidigTempo; dt > 0; dt -= STAP) stap(sim, Math.min(dt, STAP));
    if (sim.t > OPENINGSTIJD && sim.volgende === sim.plan.length && !sim.actief.length) nieuweDag();
    plaatsVoertuigen();
};

// De dag begint meteen, behalve bij 'minder beweging' of zonder videokaart (script.js): dan zelf op afspelen drukken.
nieuweDag();
speel(!zonderVideokaart && !matchMedia('(prefers-reduced-motion: reduce)').matches);

// Met #sportwagen in de link staat hij meteen bij de busjes (ook als hij nog niet gereden is).
function haalSportwagen(hash) {
    if (decodeURIComponent(hash.slice(1)) !== 'sportwagen' || rit?.bezig) return;
    const i = sim.actief.indexOf(sim.sport);
    if (i >= 0) sim.actief.splice(i, 1); // kwam hij net aanrijden: dan niet meer
    sim.sport = null;
    parkeerSportwagen();
    import('./rit/model.js').then(m => m.laadModel(), () => { });
    teken();
}
haalSportwagen(location.hash);
addEventListener('hashchange', e => haalSportwagen(new URL(e.newURL).hash)); // script.js haalt de hash zelf weer weg
