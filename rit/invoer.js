// Besturing: toetsenbord, controller (standaardindeling) en touchscreen (stuur links, pedalen rechts).
// lees() geeft per beeld wat je wilt: gas, rem en handrem (0 tot 1), sturen (−1 tot 1), rondkijken, en eenmalige
// acties (camera, toeter, terug op de weg, pauze, en in het menu: op, neer, kiezen, terug).
import { klem, hoekVerschil } from './hulp.js';

const TOETSEN = { gas: ['KeyW', 'ArrowUp'], rem: ['KeyS', 'ArrowDown'], links: ['KeyA', 'ArrowLeft'], rechts: ['KeyD', 'ArrowRight'], drift: ['Space'] };
const EENMALIG = { KeyC: 'camera', KeyH: 'toeter', KeyR: 'los', Escape: 'pauze', KeyP: 'pauze' };
const RIJTOETSEN = Object.values(TOETSEN).flat();
const ingedrukt = new Set(), acties = new Set();
export const invoerStaat = { actief: false, pauze: false };

function neer(e) {
    if (!invoerStaat.actief) return;
    const actie = EENMALIG[e.code];
    if (actie) {
        if (!e.repeat) acties.add(actie);
        if (actie === 'pauze' || !invoerStaat.pauze) {
            e.preventDefault();
            e.stopPropagation();
        }
        return;
    }
    if (invoerStaat.pauze || !RIJTOETSEN.includes(e.code)) return; // in het menu doen pijltjes, Tab en Enter gewoon hun werk
    e.preventDefault();
    e.stopPropagation(); // niet ook de kaart schuiven of een knop indrukken
    ingedrukt.add(e.code);
}
addEventListener('keydown', neer, true);
addEventListener('keyup', e => ingedrukt.delete(e.code), true);
addEventListener('blur', () => ingedrukt.clear());

// Controller: RT gas en LT rem zo ver als ingedrukt, linkerstick of kruis sturen, A of RB handrem, rechterstick
// rondkijken (indrukken: achterom), Y camera, X of linkerstick indrukken toeter, View terug op de weg, Menu pauze.
// In het menu: kruis op/neer, A kiezen, B terug.
let vorigeKnoppen = [];
function controller() {
    const p = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (!p) return null;
    const waarde = i => p.buttons[i] ? p.buttons[i].value : 0, nieuw = i => p.buttons[i]?.pressed && !vorigeKnoppen[i];
    const dood = (v, d = 0.15) => Math.abs(v || 0) < d ? 0 : (v - Math.sign(v) * d) / (1 - d);
    const uit = {
        stuur: Math.sign(p.axes[0] || 0) * Math.abs(dood(p.axes[0], 0.12)) ** 1.3 || waarde(15) - waarde(14),
        gas: waarde(7), rem: waarde(6), drift: !invoerStaat.pauze && (waarde(0) > 0.5 || waarde(5) > 0.5),
        kijkX: dood(p.axes[2]), kijkY: dood(p.axes[3]), achterom: !!p.buttons[11]?.pressed, acties: [], p
    };
    const knop = { 3: 'camera', 2: 'toeter', 10: 'toeter', 8: 'los', 9: 'pauze', 12: 'op', 13: 'neer', 0: 'kies', 1: 'terug' };
    for (const i in knop) if (nieuw(+i)) uit.acties.push(knop[i]);
    vorigeKnoppen = p.buttons.map(b => b.pressed);
    return uit;
}
export function tril(sterk, duur = 150) {
    const p = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    p?.vibrationActuator?.playEffect('dual-rumble', { duration: duur, strongMagnitude: klem(sterk, 0, 1), weakMagnitude: 0.4 })?.catch(() => { });
}

// ---------------------------------------------------------------------------
// Touchscreen: stuur (draaien met je duim, een kwartslag is vol uitgestuurd) en pedalen (per vinger welke knop,
// doorschuiven mag; drift geeft ook gas, je hebt maar één duim).
// ---------------------------------------------------------------------------

const vingers = new Map();
let stuurVinger = null, stuurHoek = 0, pedalen, stuurEl, stuurSvg;
export function maakTouch(ouder) {
    ouder.insertAdjacentHTML('beforeend', `
        <div class="rit-stuur" aria-hidden="true"><svg viewBox="-50 -50 100 100"><circle class="vlak" r="49" /><circle class="ring" r="40" /><path class="spaak" d="M-40 0H-11M11 0H40M0 11V40" /><path class="merk" d="M0-44v8" /><circle class="naaf" r="12" /></svg></div>
        <div class="rit-pedalen" aria-hidden="true"><span data-rij="drift gas">Drift</span><span data-rij="rem">Rem</span><span data-rij="gas">Gas</span></div>`);
    pedalen = ouder.querySelector('.rit-pedalen');
    stuurEl = ouder.querySelector('.rit-stuur');
    stuurSvg = stuurEl.querySelector('svg');
    const pedaalOnder = e => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        return el && el.parentNode === pedalen ? el : null;
    };
    pedalen.addEventListener('pointerdown', e => {
        pedalen.setPointerCapture(e.pointerId);
        zetPedaal(e.pointerId, pedaalOnder(e));
    });
    pedalen.addEventListener('pointermove', e => { if (pedalen.hasPointerCapture(e.pointerId)) zetPedaal(e.pointerId, pedaalOnder(e)); });
    for (const t of ['pointerup', 'pointercancel']) pedalen.addEventListener(t, e => zetPedaal(e.pointerId, null));
    const hoekBijStuur = e => {
        const r = stuurEl.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
        return Math.hypot(dx, dy) > 12 ? Math.atan2(dy, dx) : null;
    };
    stuurEl.addEventListener('pointerdown', e => {
        stuurEl.setPointerCapture(e.pointerId);
        stuurVinger = { id: e.pointerId, hoek: hoekBijStuur(e) };
        stuurEl.classList.add('vast');
    });
    stuurEl.addEventListener('pointermove', e => {
        if (stuurVinger?.id !== e.pointerId) return;
        const h = hoekBijStuur(e);
        if (h !== null && stuurVinger.hoek !== null) stuurHoek = klem(stuurHoek + hoekVerschil(h, stuurVinger.hoek), -2, 2);
        stuurVinger.hoek = h;
        stuurSvg.style.transform = `rotate(${stuurHoek}rad)`;
    });
    for (const t of ['pointerup', 'pointercancel']) stuurEl.addEventListener(t, e => { if (stuurVinger?.id === e.pointerId) stuurLos(); });
}
function zetPedaal(id, el) {
    if (el) vingers.set(id, el);
    else vingers.delete(id);
    for (const k of pedalen.children) k.classList.toggle('aan', [...vingers.values()].includes(k));
}
function stuurLos() {
    stuurVinger = null;
    stuurHoek = 0;
    stuurEl?.classList.remove('vast');
    if (stuurSvg) stuurSvg.style.transform = '';
}

export function startInvoer() {
    invoerStaat.actief = true;
    invoerStaat.pauze = false;
}
export function stopInvoer() {
    invoerStaat.actief = false;
    ingedrukt.clear();
    acties.clear();
    vingers.clear();
    if (pedalen) zetPedaal(null, null);
    stuurLos();
}
export function losLaten() { // bij pauze: niets blijft ingedrukt hangen
    ingedrukt.clear();
    vingers.clear();
    if (pedalen) zetPedaal(null, null);
    stuurLos();
}

export function lees() {
    const p = controller();
    const houdt = actie => TOETSEN[actie].some(c => ingedrukt.has(c)) || [...vingers.values()].some(el => el.dataset.rij.split(' ').includes(actie));
    const analoog = stuurVinger ? klem(stuurHoek / (Math.PI / 2), -1, 1) : p?.stuur || 0;
    const uit = {
        gas: Math.max(+houdt('gas'), p?.gas || 0), rem: Math.max(+houdt('rem'), p?.rem || 0), drift: houdt('drift') || !!p?.drift,
        stuur: analoog || houdt('rechts') - houdt('links'), analoog: !!analoog, kijkX: p?.kijkX || 0, kijkY: p?.kijkY || 0, achterom: !!p?.achterom,
        acties: new Set([...acties, ...(p?.acties || [])])
    };
    acties.clear();
    return uit;
}
// Van buitenaf (knoppen op het scherm) een actie doen.
export const doe = actie => acties.add(actie);
