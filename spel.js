// ---------------------------------------------------------------------------
// Lossen maar: het spelletje achter de Rd4-wagen op de kaart.
// Auto's en busjes (met of zonder aanhanger) rijden het park op en stoppen bij jou;
// sleep hun spullen naar de goede container voordat de rij bij de slagboom te lang wordt.
// Soort voertuig, aantal containers per bezoek en welke stromen ze brengen volgen de meetdag.
// ---------------------------------------------------------------------------

const MAX_RIJ = 4; // wachtende voertuigen; komt er nog één bij, dan is de dienst voorbij
const LEVENS = 3;
const RECORD = 'rd4-lossen';
const DAGRECORD = 'rd4-lossen-dag'; // { dag: '2026-09-30', record: 12 }

// Spullen per stroom als kleine tekeningen (48×48), zodat ze er op elk apparaat hetzelfde uitzien.
const SPULLEN = {
    hout: {
        Deur: '<rect x="13" y="4" width="22" height="41" rx="1.5" fill="#b07a45"/><rect x="17" y="8" width="14" height="14" rx="1" fill="#95633a"/><rect x="17" y="25" width="14" height="16" rx="1" fill="#95633a"/><circle cx="33" cy="23.5" r="1.8" fill="#e0b64a"/>',
        Stoel: '<path d="M13 4h5v20h17v5h-3v16h-4V29H18v16h-5z" fill="#b07a45"/><rect x="13" y="24" width="22" height="2" fill="#95633a"/><rect x="13" y="9" width="5" height="2" fill="#95633a"/>',
        Planken: '<rect x="3" y="12" width="42" height="7" rx="1" fill="#c48a52" transform="rotate(-6 24 16)"/><rect x="3" y="21" width="42" height="7" rx="1" fill="#b07a45"/><rect x="3" y="30" width="42" height="7" rx="1" fill="#c48a52" transform="rotate(4 24 34)"/><path d="M8 24.5h12M26 33h10" stroke="#8a5a2b" stroke-width="1.2"/>',
        Pallet: '<rect x="3" y="14" width="42" height="5" fill="#d4a86a"/><g fill="#b8864d"><rect x="5" y="19" width="7" height="8"/><rect x="20.5" y="19" width="7" height="8"/><rect x="36" y="19" width="7" height="8"/></g><rect x="3" y="27" width="42" height="5" fill="#d4a86a"/>'
    },
    metaal: {
        Fiets: '<g fill="none" stroke="#5d6773" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="32" r="8"/><circle cx="36" cy="32" r="8"/><path d="M12 32l7-12h12l5 12M12 32h12l-5-12M24 32l7-12M16 17h6M31 20l-1-5h4"/></g>',
        Koekenpan: '<circle cx="19" cy="26" r="14" fill="#3a3f46"/><circle cx="19" cy="26" r="10.5" fill="#5d6773"/><rect x="31" y="23" width="15" height="6" rx="3" fill="#2b2f36"/>',
        Radiator: '<rect x="5" y="11" width="38" height="28" rx="2" fill="#c7ced6" stroke="#8e99a6" stroke-width="1.5"/><path d="M11 14v22M17 14v22M23 14v22M29 14v22M35 14v22" stroke="#8e99a6" stroke-width="2.5" stroke-linecap="round"/><path d="M9 39v4M39 39v4" stroke="#5d6773" stroke-width="3"/>'
    },
    kunststof: {
        Tuinstoel: '<path d="M14 6h20a3 3 0 0 1 3 3v15H11V9a3 3 0 0 1 3-3z" fill="#2fa36b"/><path d="M16 11h16M16 16h16M16 21h16" stroke="#23884f" stroke-width="2"/><rect x="9" y="24" width="30" height="6" rx="2" fill="#23884f"/><path d="M11 30L9 44h4l3-14zM37 30l2 14h-4l-3-14z" fill="#23884f"/>',
        Emmer: '<path d="M11 14c2-12 24-12 26 0" fill="none" stroke="#3a3f46" stroke-width="2"/><path d="M11 15h26l-3 28H14z" fill="#3a86d8"/><rect x="9" y="12" width="30" height="5" rx="2" fill="#2f6fb5"/>',
        Krat: '<rect x="5" y="12" width="38" height="28" rx="2" fill="#e0a320"/><path d="M9 17h30v8H9zM9 28h30v8H9z" fill="#b8820f"/><path d="M19 17v19M29 17v19" stroke="#e0a320" stroke-width="3"/>'
    },
    elektro: {
        Televisie: '<rect x="4" y="7" width="40" height="27" rx="2" fill="#2b2f36"/><rect x="7" y="10" width="34" height="21" fill="#5b8ff0"/><path d="M7 10h14L7 31z" fill="#7aa6f5"/><rect x="21" y="34" width="6" height="5" fill="#2b2f36"/><rect x="14" y="39" width="20" height="3" rx="1.5" fill="#2b2f36"/>',
        Magnetron: '<rect x="4" y="11" width="40" height="27" rx="3" fill="#d9dee4" stroke="#8e99a6" stroke-width="1.5"/><rect x="8" y="15" width="23" height="19" rx="2" fill="#2b2f36"/><circle cx="37.5" cy="19" r="2" fill="#5d6773"/><circle cx="37.5" cy="25" r="2" fill="#5d6773"/><rect x="35" y="29" width="5" height="4" rx="1" fill="#5d6773"/>',
        Laptop: '<rect x="9" y="9" width="30" height="21" rx="2" fill="#2b2f36"/><rect x="11.5" y="11.5" width="25" height="16" fill="#5b8ff0"/><path d="M4 32h40l-3 5H7z" fill="#8e99a6"/>'
    },
    papier: {
        Doos: '<path d="M8 18h32v22H8z" fill="#c9955c"/><path d="M8 18l5-8h22l5 8z" fill="#b5834d"/><rect x="21" y="18" width="6" height="9" fill="#e8cfa6"/>',
        Kranten: '<rect x="7" y="7" width="34" height="34" rx="1.5" fill="#eceae3" stroke="#9aa3ad" stroke-width="1.5"/><rect x="11" y="11" width="26" height="5" fill="#5d6773"/><rect x="11" y="20" width="11" height="9" fill="#b5bdc6"/><path d="M25 21h12M25 25h12M25 29h12M11 33h26M11 37h20" stroke="#9aa3ad" stroke-width="1.6"/>',
        Eierdoos: '<rect x="5" y="22" width="38" height="13" rx="3" fill="#c7b79b"/><g fill="#d8cbb2"><circle cx="11.5" cy="22" r="5"/><circle cx="20" cy="22" r="5"/><circle cx="28.5" cy="22" r="5"/><circle cx="37" cy="22" r="5"/></g><path d="M5 29h38" stroke="#b3a283" stroke-width="1.5"/>'
    },
    glas: {
        Fles: '<path d="M20 4h8v10c4 2 6 5 6 9v19a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V23c0-4 2-7 6-9z" fill="#3f9a6b"/><rect x="14" y="27" width="20" height="9" fill="#e8e6df"/><rect x="17.5" y="15" width="2.5" height="10" rx="1.2" fill="#8fd1ae"/>',
        Pot: '<rect x="11" y="14" width="26" height="29" rx="5" fill="#bfe3dc" stroke="#7fb3a8" stroke-width="1.5"/><rect x="13" y="7" width="22" height="8" rx="2" fill="#d03b3b"/><rect x="15" y="19" width="3" height="18" rx="1.5" fill="#fff" opacity=".7"/>'
    },
    pmd: {
        Blikje: '<rect x="14" y="7" width="20" height="35" rx="3" fill="#d03b3b"/><rect x="14" y="19" width="20" height="10" fill="#fff" opacity=".85"/><rect x="14" y="7" width="20" height="4" rx="2" fill="#b5bdc6"/><rect x="14" y="38" width="20" height="4" rx="2" fill="#b5bdc6"/>',
        Shampoofles: '<rect x="19" y="4" width="10" height="8" rx="1.5" fill="#5b3e99"/><path d="M18 11h12v3c4 1 6 4 6 8v20a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V22c0-4 2-7 6-8z" fill="#8b5fd1"/><rect x="16" y="24" width="16" height="10" rx="2" fill="#fff" opacity=".8"/>',
        Drinkpak: '<path d="M14 16l4-9h12l4 9v27H14z" fill="#f4f6f8" stroke="#8e99a6" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 16h20" stroke="#8e99a6" stroke-width="1.5"/><rect x="14.8" y="24" width="18.4" height="11" fill="#3a86d8"/>'
    },
    tuin: {
        Takken: '<path d="M6 42L40 8M20 28l-9-6M28 20l2-12M33 15l9 2" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/><g fill="#4f9a3a"><ellipse cx="10" cy="20" rx="4" ry="2.5"/><ellipse cx="31" cy="7" rx="2.5" ry="4"/><ellipse cx="43" cy="17" rx="4" ry="2.5"/><ellipse cx="17" cy="35" rx="2.5" ry="4"/></g>',
        Bladeren: '<path d="M6 36C6 20 18 10 34 10c0 16-12 26-28 26z" fill="#d9822b"/><path d="M6 36L28 16" stroke="#a85f1c" stroke-width="1.6"/><path d="M20 44c0-10 8-17 20-17 0 10-8 17-20 17z" fill="#7aa83a"/><path d="M20 44l13-11" stroke="#5c8629" stroke-width="1.4"/>'
    },
    rest: {
        Vuilniszak: '<path d="M19 12l5-7 5 7z" fill="#2b2f36"/><path d="M24 12c-10 0-15 10-15 19 0 7 5 12 15 12s15-5 15-12c0-9-5-19-15-19z" fill="#2b2f36"/><path d="M15 27c2-4 5-7 8-8" stroke="#5d6773" stroke-width="2" fill="none" stroke-linecap="round"/>',
        Drinkglas: '<path d="M13 7h22l-3 36H16z" fill="#dff0f5" stroke="#8eb6c4" stroke-width="1.5" stroke-linejoin="round"/><path d="M17.5 12l1.8 26" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>',
        Knuffel: '<g fill="#c98f5a"><circle cx="16" cy="10" r="4.5"/><circle cx="32" cy="10" r="4.5"/><circle cx="24" cy="17" r="10"/><ellipse cx="24" cy="36" rx="12" ry="10"/></g><ellipse cx="24" cy="37" rx="6" ry="5" fill="#e0b48a"/><g fill="#2b2f36"><circle cx="20" cy="16" r="1.4"/><circle cx="28" cy="16" r="1.4"/><circle cx="24" cy="20.5" r="1.8"/></g>'
    },
    schoonpuin: {
        Stenen: '<g fill="#b5523b"><rect x="5" y="27" width="18" height="9" rx="1"/><rect x="25" y="27" width="18" height="9" rx="1"/><rect x="15" y="16" width="18" height="9" rx="1"/></g><g fill="#94412d"><rect x="5" y="34" width="18" height="2"/><rect x="25" y="34" width="18" height="2"/><rect x="15" y="23" width="18" height="2"/></g>',
        Tegels: '<rect x="6" y="10" width="20" height="20" rx="1.5" fill="#c9ccd1" stroke="#8e99a6" stroke-width="1.5" transform="rotate(-8 16 20)"/><rect x="20" y="18" width="20" height="20" rx="1.5" fill="#e1e3e6" stroke="#8e99a6" stroke-width="1.5" transform="rotate(10 30 28)"/>'
    },
    piepschuim: {
        Schuimblok: '<path d="M5 12h38v26H5z" fill="#fbfcfd" stroke="#b5bdc6" stroke-width="1.5"/><path d="M13 12v12h22V12" fill="#e9eef2" stroke="#b5bdc6" stroke-width="1.5"/><g fill="#d5dce3"><circle cx="10" cy="31" r="1.2"/><circle cx="17" cy="33" r="1.2"/><circle cx="26" cy="30" r="1.2"/><circle cx="36" cy="33" r="1.2"/><circle cx="39" cy="18" r="1.2"/></g>',
        Schuimdoos: '<path d="M6 18h36v20H6z" fill="#fbfcfd" stroke="#b5bdc6" stroke-width="1.5"/><path d="M4 13h40v6H4z" fill="#eef2f5" stroke="#b5bdc6" stroke-width="1.5"/><g fill="#d5dce3"><circle cx="12" cy="28" r="1.2"/><circle cx="22" cy="32" r="1.2"/><circle cx="33" cy="26" r="1.2"/></g>'
    },
    grofvuil: {
        Bank: '<rect x="8" y="14" width="32" height="14" rx="4" fill="#3f7f8c"/><rect x="4" y="22" width="40" height="12" rx="3" fill="#336b76"/><rect x="3" y="19" width="8" height="17" rx="3" fill="#3f7f8c"/><rect x="37" y="19" width="8" height="17" rx="3" fill="#3f7f8c"/><path d="M8 36v5M40 36v5" stroke="#2b2f36" stroke-width="3"/>',
        Fauteuil: '<rect x="13" y="10" width="22" height="18" rx="5" fill="#b0503c"/><rect x="11" y="24" width="26" height="11" rx="3" fill="#933f2e"/><rect x="8" y="19" width="8" height="17" rx="3" fill="#b0503c"/><rect x="32" y="19" width="8" height="17" rx="3" fill="#b0503c"/><path d="M12 36v6M36 36v6" stroke="#2b2f36" stroke-width="3"/>'
    }
};
const tekening = inhoud => `<svg viewBox="0 0 48 48" aria-hidden="true">${inhoud}</svg>`;

// Zijaanzicht van een voertuig (rijdt naar rechts), in de kleur van zijn type zoals in de analyse.
const WIEL = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#1b1d21"/><circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="#b5bdc6"/>`;
const RUIT = 'fill="#cfe3f7"';
function voertuigSvg(type) {
    const naam = VOERTUIGTYPES[type], kleur = `style="fill:${VOERTUIGKLEUREN[type]}"`;
    const aanhanger = naam.includes('aanhanger') ? 66 : 0;
    const wagen = naam.startsWith('Busje')
        ? `<path ${kleur} d="M4 42V10q0-4 4-4h76q6 0 10 5l12 14 6 2q6 2 6 8v7z"/>
           <path ${RUIT} d="M86 10h4q2 0 4 3l9 12H86z"/><rect ${RUIT} x="60" y="11" width="20" height="11" rx="1"/>
           ${WIEL(26, 42, 9)}${WIEL(98, 42, 9)}<rect x="114" y="30" width="4" height="3" fill="#f9f91d"/>`
        : `<path ${kleur} d="M4 40V30q0-5 6-6l14-2 12-11h34q5 0 9 4l9 8 12 2q6 1 6 7v8z"/>
           <path ${RUIT} d="M39 14h15v9H29zM58 14h11q3 0 6 3l6 6H58z"/>
           ${WIEL(26, 40, 8)}${WIEL(86, 40, 8)}<rect x="102" y="28" width="4" height="3" fill="#f9f91d"/>`;
    const b = aanhanger + (naam.startsWith('Busje') ? 124 : 108);
    return `<svg viewBox="0 0 ${b} 52" width="${b}" height="52" aria-label="${naam}">
        ${aanhanger ? `<rect x="2" y="20" width="52" height="18" rx="2" fill="#8e99a6"/><rect x="2" y="20" width="52" height="3" fill="#6b7682"/>
            <path d="M54 34h14" stroke="#3a3f46" stroke-width="3"/>${WIEL(28, 42, 7)}` : ''}
        <g transform="translate(${aanhanger} 0)">${wagen}</g></svg>`;
}

// ---------------------------------------------------------------------------
// De wagen op de kaart, in het vrije vak naast de binnendoor-route. Voorkant = +x.
// ---------------------------------------------------------------------------

const wagen3d = new THREE.Group();
function deel(geo, materiaal, x, y, z, rx = 0, ry = 0) {
    const m = new THREE.Mesh(geo, materiaal);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    m.castShadow = true;
    m.userData.id = 'truck';
    wagen3d.add(m);
    klikbaar.push(m);
}
deel(new THREE.BoxGeometry(8.4, 0.4, 2), mat('#2b2f36'), 0, 0.9, 0);          // chassis, steekt voor als bumper uit
deel(new THREE.BoxGeometry(1.9, 2.3, 2.5), mat('#ffffff'), 3.15, 1.95, 0);    // cabine
deel(new THREE.BoxGeometry(0.06, 0.85, 2.2), mat('#1d3557'), 4.12, 2.45, 0);  // voorruit
deel(new THREE.BoxGeometry(0.5, 1.3, 0.5), mat('#6b7a8f'), 1.8, 1.75, 0);     // haakarm
deel(new THREE.BoxGeometry(5.8, 2.2, 2.4), mat('#0a366a'), -1.2, 2.2, 0);     // container
const wiel = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16), rubber = mat('#1b1d21');
for (const x of [2.9, -1.7, -2.9]) for (const z of [-1.05, 1.05]) deel(wiel, rubber, x, 0.5, z, Math.PI / 2);
if (location.protocol !== 'file:') { // los geopend weigert de browser plaatjes in WebGL: zwarte vlakken, dan liever zonder logo
    const logo = new THREE.MeshLambertMaterial({ map: new THREE.TextureLoader().load('img/logord4.png', teken) });
    const logoGeo = new THREE.PlaneGeometry(1.9, 1.9);
    deel(logoGeo, logo, -1.2, 2.2, 1.22);
    deel(logoGeo, logo, -1.2, 2.2, -1.22, 0, Math.PI);
    deel(logoGeo, logo, -1.2, 3.32, 0, -Math.PI / 2); // op het dak, leesbaar van boven
}
wagen3d.position.set(-0.8, 0, 6.5);
wagen3d.rotation.y = -Math.PI / 4; // neus naar rechtsonder
wagen3d.scale.setScalar(VOERTUIGSCHAAL);
scene.add(wagen3d);
maakLabel('truck', labelBoven(wagen3d), true); // script.js
update(); // meet het nieuwe label

// ---------------------------------------------------------------------------
// Spel
// ---------------------------------------------------------------------------

const ladingEl = document.getElementById('lading');
const wegEl = document.getElementById('weg');
const voertuigEl = document.getElementById('voertuig');
const meldingEl = document.getElementById('melding');
const bakkenEl = document.getElementById('bakken');
const spelKaart = document.getElementById('spel-kaart');
const geholpenEl = document.getElementById('spel-geholpen');
const recordEl = document.getElementById('spel-record');
const recordSoortEl = document.getElementById('spel-record-soort');
const rijEl = document.getElementById('spel-rij');
const levensEl = document.getElementById('spel-levens');

// Containers ongeveer zoals ze op het park liggen: noordelijke helft eerst, van west naar oost.
const midden = id => labels.find(l => l.id === id).pos;
const opZ = [...ACTIEF].sort((a, b) => midden(a).z - midden(b).z);
const helft = Math.ceil(opZ.length / 2);
bakkenEl.innerHTML = [opZ.slice(0, helft), opZ.slice(helft)]
    .flatMap(rij => rij.sort((a, b) => midden(a).x - midden(b).x))
    .map(id => `<button class="bak" data-id="${id}">${STROMEN[id].naam}</button>`).join('');

let spel = null;
let aankomstTimer;
let record = 0;
try { record = +localStorage.getItem(RECORD) || 0; } catch { }

// Dagopdracht: vandaag krijgt iedereen dezelfde voertuigen, zodat collega's hun score kunnen vergelijken.
// Het toeval komt dan uit een vast zaadje (de datum, mulberry32) in plaats van Math.random.
const vandaag = () => new Date().toLocaleDateString('sv'); // 2026-09-30, lokale tijd
const zaad = s => () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
let rnd = Math.random;
function dagRecord() {
    try { const d = JSON.parse(localStorage.getItem(DAGRECORD)); return d?.dag === vandaag() ? d.record : 0; } catch { return 0; }
}

function trek(opties, gewicht) {
    let r = rnd() * som(opties, gewicht);
    for (const o of opties) if ((r -= gewicht(o)) < 0) return o;
    return opties[opties.length - 1];
}

function hussel(lijst, r = rnd) {
    for (let i = lijst.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [lijst[i], lijst[j]] = [lijst[j], lijst[i]];
    }
    return lijst;
}

// Een voertuig zoals op de meetdag: type naar het aantal voertuigen, aantal containers naar
// het gemiddelde van dat type (bv. 1,5 bij auto + aanhanger), stromen naar wat dat type bracht.
function nieuwVoertuig() {
    const type = trek(VOERTUIGTYPES.map((_, i) => i), i => VOERTUIG_AANTAL[i]);
    const perBezoek = STOPS_PER_TYPE[type] / VOERTUIG_AANTAL[type];
    const aantal = Math.floor(perBezoek) + (rnd() < perBezoek % 1 ? 1 : 0);
    const stromen = [];
    while (stromen.length < aantal) {
        const opties = ACTIEF.filter(id => !stromen.includes(id) && STROMEN[id].voertuigen[type]);
        if (!opties.length) break;
        stromen.push(trek(opties, id => STROMEN[id].voertuigen[type]));
    }
    const extra = VOERTUIGTYPES[type].includes('aanhanger') ? 1 : 0; // aanhanger = meer spullen
    const spullen = stromen.flatMap(id => hussel(Object.keys(SPULLEN[id]))
        .slice(0, 1 + Math.floor(rnd() * 2) + extra)
        .map(naam => ({ naam, stroom: id })));
    return { type, spullen: hussel(spullen) };
}

// Menu of eindstand: het speelveld erachter doet even niet mee, de focus staat op de eerste keuze.
function toonKaart(html) {
    spelKaart.innerHTML = html;
    spelKaart.hidden = !html;
    for (const el of [ladingEl, bakkenEl]) el.inert = !!html;
    spelKaart.querySelector('button')?.focus();
}

function toonStand({ geholpen, rij, levens } = { geholpen: 0, rij: [], levens: LEVENS }) {
    geholpenEl.textContent = geholpen;
    recordSoortEl.textContent = spel?.dag ? 'Vandaag' : 'Record';
    recordEl.textContent = Math.max(spel?.dag ? dagRecord() : record, geholpen); // loopt mee zodra je hem breekt
    rijEl.innerHTML = Array.from({ length: MAX_RIJ }, (_, i) => rij[i] ? voertuigSvg(rij[i].type) : '<i></i>').join('');
    levensEl.innerHTML = Array.from({ length: LEVENS }, (_, i) => `<i${i < LEVENS - levens ? ' class="kwijt"' : ''}></i>`).join('');
}

function melding(tekst) {
    meldingEl.textContent = tekst;
    meldingEl.animate([{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], 2200);
}

function spelOpen() {
    spelEl.showModal();
    menu();
}

// Keuze: oneindig (tot de rij vol is of je drie keer misgrijpt) of de dagopdracht (voor iedereen dezelfde voertuigen).
function menu() {
    ladingEl.innerHTML = voertuigEl.innerHTML = '';
    toonStand();
    const beste = dagRecord();
    toonKaart(`
        <h3>Klaar om te lossen?</h3>
        <p>Sleep elk ding naar de goede container.</p>
        <div class="modi">
            <button class="modus" data-actie="start">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c-2-2.7-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.3 6-4zm0 0c2 2.7 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.3-6 4z"/></svg>
                <b>Oneindig</b><span>${record ? `Record ${record}` : 'Nog geen record'}</span>
            </button>
            <button class="modus" data-actie="dag">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><text x="12" y="18">${new Date().getDate()}</text></svg>
                <b>Dagopdracht</b><span>${beste ? `Vandaag ${beste}` : 'Nieuw vandaag'}</span>
            </button>
        </div>`);
}

function start(dag = false) {
    rnd = dag ? zaad(+vandaag().replace(/-/g, '')) : Math.random;
    spel = { geholpen: 0, rij: [], levens: LEVENS, huidig: null, dag };
    ladingEl.innerHTML = voertuigEl.innerHTML = '';
    toonKaart('');
    aankomst();
}

// Er komt een voertuig bij de slagboom; steeds sneller achter elkaar.
function aankomst() {
    if (spel.rij.length >= MAX_RIJ) return einde('De rij bij de slagboom stond tot op de weg.');
    spel.rij.push(nieuwVoertuig());
    if (!spel.huidig) volgende();
    toonStand(spel);
    const pauze = Math.max(2.5, 8 - spel.geholpen * 0.25) * (0.7 + rnd() * 0.6);
    aankomstTimer = setTimeout(aankomst, pauze * 1000);
}

// Het eerste voertuig uit de rij rijdt naar de losplek en laat zijn lading zien.
function volgende() {
    const v = spel.huidig = spel.rij.shift(), dit = spel;
    toonStand(spel);
    voertuigEl.innerHTML = voertuigSvg(v.type);
    voertuigEl.firstElementChild.animate([{ transform: `translateX(${-wegEl.clientWidth}px)` }, { transform: 'none' }],
        { duration: 900, easing: 'ease-out' }).onfinish = () => {
        if (spel !== dit) return;
        ladingEl.innerHTML = v.spullen.map(d =>
            `<button class="ding" data-stroom="${d.stroom}">${tekening(SPULLEN[d.stroom][d.naam])}${d.naam}</button>`).join('');
        ladingEl.querySelector('.ding').focus(); // toetsenbord: meteen verder met het eerste ding
    };
}

function vertrek() {
    spel.geholpen++;
    toonStand(spel);
    const dit = spel;
    voertuigEl.firstElementChild.animate([{ transform: 'none' }, { transform: `translateX(${wegEl.clientWidth}px)` }],
        { duration: 700, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
        if (spel !== dit) return;
        spel.huidig = null;
        if (spel.rij.length) volgende();
    };
}

// Ding in een container laten vallen (na slepen of tikken). Fout = terug naar de lading.
function laatVallen(el, bak) {
    kies(null);
    const [ox, oy] = el.verschoven || [0, 0];
    el.verschoven = null;
    el.style.transform = '';
    if (!bak) {
        el.animate([{ transform: `translate(${ox}px, ${oy}px)` }, { transform: 'none' }], 200);
        return;
    }
    if (el.dataset.stroom === bak.dataset.id) {
        const a = el.getBoundingClientRect(), b = bak.getBoundingClientRect();
        const dx = b.left + b.width / 2 - a.left - a.width / 2, dy = b.top + b.height / 2 - a.top - a.height / 2;
        el.classList.add('sleept');
        el.animate([{ transform: `translate(${ox}px, ${oy}px)` }, { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 }],
            { duration: 250, easing: 'ease-in', fill: 'forwards' }); // blijft onzichtbaar staan: de rest verschuift niet onder je vinger
        bak.animate({ backgroundColor: ['#1f9d55', getComputedStyle(bak).backgroundColor] }, 500);
        el.dataset.stroom = ''; // telt niet meer mee
        el.disabled = true; // en is met Tab niet meer te bereiken
        if (bakkenEl.contains(document.activeElement)) ladingEl.querySelector('.ding:enabled')?.focus(); // door naar het volgende ding
        if (!ladingEl.querySelector('.ding[data-stroom]:not([data-stroom=""])')) vertrek();
        return;
    }
    el.animate([{ transform: `translate(${ox}px, ${oy}px)` }, { transform: 'none' }], 250);
    bak.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], 250);
    melding(`${el.textContent} hoort bij ${STROMEN[el.dataset.stroom].naam}`);
    spel.levens--;
    toonStand(spel);
    if (!spel.levens) einde('Drie keer verkeerd gesorteerd.');
}

// Tikken: ding kiezen, dan container.
let gekozen = null;
function kies(el) {
    if (gekozen) gekozen.setAttribute('aria-pressed', false);
    gekozen = el;
    if (el) el.setAttribute('aria-pressed', true);
}

// Slepen, binnen het spelvenster (anders krijgt het een schuifbalk en valt het ding eruit).
// Na slepen volgt soms nog een klik op het ding zelf; die telt niet als kiezen.
let sleep = null, sleepEinde = 0;
pijlGroep(ladingEl, '.ding');
pijlGroep(bakkenEl, '.bak');
pijlGroep(spelKaart, '.modus');
const bakOnder = e => document.elementFromPoint(e.clientX, e.clientY)?.closest('.bak');
const markeer = bak => bakkenEl.querySelectorAll('.bak').forEach(b => b.classList.toggle('onder', b === bak));

ladingEl.addEventListener('pointerdown', e => {
    const el = e.target.closest('.ding');
    if (!el || !spel || !el.dataset.stroom) return;
    const r = el.getBoundingClientRect(), v = spelEl.getBoundingClientRect(), m = 6; // marge voor de schaal 1.08
    sleep = { el, x0: e.clientX, y0: e.clientY, bewogen: false,
        grens: [v.left - r.left + m, v.right - r.right - m, v.top - r.top + m, v.bottom - r.bottom - m] };
});
spelEl.addEventListener('pointermove', e => {
    if (!sleep) return;
    const [x1, x2, y1, y2] = sleep.grens;
    const dx = THREE.MathUtils.clamp(e.clientX - sleep.x0, x1, x2), dy = THREE.MathUtils.clamp(e.clientY - sleep.y0, y1, y2);
    if (!sleep.bewogen && Math.hypot(dx, dy) < 8) return;
    sleep.bewogen = true;
    sleep.el.classList.add('sleept');
    sleep.el.verschoven = [dx, dy];
    sleep.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
    markeer(bakOnder(e));
});
spelEl.addEventListener('pointerup', e => {
    if (!sleep) return;
    const { el, bewogen } = sleep;
    sleep = null;
    markeer(null);
    if (!bewogen) return; // gewone tik: zie click
    sleepEinde = performance.now();
    el.classList.remove('sleept');
    laatVallen(el, bakOnder(e));
});
spelEl.addEventListener('pointercancel', () => {
    if (sleep) laatVallen(sleep.el, null);
    sleep = null;
    markeer(null);
});

spelEl.addEventListener('click', e => {
    const actie = e.target.closest('[data-actie]')?.dataset.actie;
    if (actie === 'start' || actie === 'dag') return start(actie === 'dag');
    if (actie === 'sluit') return spelEl.close();
    if (actie === 'menu') return menu();
    if (!spel || performance.now() - sleepEinde < 300) return;
    const ding = e.target.closest('.ding'), bak = e.target.closest('.bak');
    if (ding && ding.dataset.stroom) kies(gekozen === ding ? null : ding);
    else if (bak && gekozen) laatVallen(gekozen, bak);
});

function einde(reden) {
    clearTimeout(aankomstTimer);
    const { geholpen, dag } = spel;
    spel = null;
    sleep = null;
    kies(null);
    const beste = dagRecord(), nieuw = geholpen > record, nieuwDag = dag && geholpen > beste;
    try {
        if (nieuw) localStorage.setItem(RECORD, record = geholpen);
        if (nieuwDag) localStorage.setItem(DAGRECORD, JSON.stringify({ dag: vandaag(), record: geholpen }));
    } catch { }
    toonKaart(`
        <h3>Dienst voorbij</h3>
        <p class="spel-score"><b>${geholpen}</b> voertuigen geholpen</p>
        <p>${reden}</p>
        <p class="spel-record">${nieuw ? 'Nieuw record!' : nieuwDag ? 'Beste van vandaag!' : dag ? `Vandaag ${beste}` : `Record ${record}`}</p>
        <button class="knop" data-actie="${dag ? 'dag' : 'start'}">Nog een dienst</button>
        <button class="knop stil" data-actie="menu">Menu</button>`);
}

spelEl.addEventListener('close', () => {
    teken(); // de kaart weer bijwerken (script.js)
    clearTimeout(aankomstTimer);
    spel = null;
    sleep = null;
    kies(null);
});
