// Wat je tijdens het rijden ziet: knoppen, snelheid, minikaart, grote meldingen, de tijd van een race of ronde, een
// aanwijzing, het pauzemenu en het laadscherm. De besturing op een touchscreen komt uit invoer.js.
import { maakTouch, doe } from './invoer.js';
import { kaart } from './wereld.js';

const ICOON = {
    pauze: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /></svg>',
    los: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>',
    zijbalk: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M9 5v14" /></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></svg>'
};
const ZICHTEN = { kaart: 'Kaart', achter: 'Achter', binnen: 'Binnen' };

let el, snelheidEl, meldingEl, tijdEl, aanwijzingEl, kaartDoek, menuEl, ladenEl, meldTot = 0, zichtKnop;
export function maakHud() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'rit';
    el.hidden = true;
    el.innerHTML = `
        <div class="rit-links">
            <button class="rit-knop" data-doe="pauze" aria-label="Pauze">${ICOON.pauze}</button>
            <button class="rit-knop" data-doe="los" aria-label="Terug op de weg">${ICOON.los}</button>
            <button class="rit-knop rit-zijbalk" aria-label="Zijbalk verbergen">${ICOON.zijbalk}</button>
        </div>
        <button class="rit-knop rit-zicht" data-doe="camera" aria-label="Camera wisselen">${ICOON.camera}<span>Kaart</span></button>
        <canvas class="rit-kaart" aria-hidden="true"></canvas>
        <div class="rit-hint">WASD rijden · spatie handrem · C camera · R terug op de weg · Esc pauze</div>
        <div class="rit-tijd" hidden></div>
        <div class="rit-melding" hidden><b></b><span></span></div>
        <div class="rit-aanwijzing" hidden></div>
        <div class="rit-snelheid"><b>0</b>km/h</div>
        <div class="rit-menu" hidden role="dialog" aria-label="Pauze"><div class="rit-kaartje"></div></div>
        <div class="rit-laden" hidden><div class="rit-draaier"></div>Laden</div>`;
    mapEl.append(el);
    snelheidEl = el.querySelector('.rit-snelheid b');
    meldingEl = el.querySelector('.rit-melding');
    tijdEl = el.querySelector('.rit-tijd');
    aanwijzingEl = el.querySelector('.rit-aanwijzing');
    kaartDoek = el.querySelector('.rit-kaart');
    menuEl = el.querySelector('.rit-menu');
    ladenEl = el.querySelector('.rit-laden');
    zichtKnop = el.querySelector('.rit-zicht');
    // Met een vinger meteen bij aanraken (houdt je andere duim het gas vast, dan maakt de browser er geen klik van).
    let getikt = 0;
    el.querySelectorAll('[data-doe]').forEach(k => {
        k.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'touch') return;
            getikt = performance.now();
            doe(k.dataset.doe);
        });
        k.addEventListener('click', () => { if (performance.now() - getikt > 800) doe(k.dataset.doe); });
    });
    el.querySelector('.rit-zijbalk').addEventListener('click', () => wisselZijbalk()); // script.js
    el.addEventListener('contextmenu', e => e.preventDefault());
    maakTouch(el);
}
export const toonHud = aan => { el.hidden = !aan; };
export const laden = aan => {
    el.hidden = false;
    ladenEl.hidden = !aan;
};
export function zetZichtNaam(naam) {
    zichtKnop.querySelector('span').textContent = ZICHTEN[naam];
}
export function zetSnelheid(kmh) {
    const t = String(Math.round(kmh));
    if (snelheidEl.textContent !== t) snelheidEl.textContent = t;
}
// Grote tekst midden in beeld, een paar seconden.
export function meld(groot, klein = '', seconden = 1.6) {
    const [b, span] = meldingEl.children;
    if (b.textContent !== groot) b.textContent = groot;
    if (span.textContent !== klein) span.textContent = klein;
    meldTot = performance.now() + seconden * 1000;
    meldingEl.hidden = false;
}
export function hudStap() {
    if (!meldingEl.hidden && performance.now() > meldTot) meldingEl.hidden = true;
}
const zet = (element, tekst) => {
    element.hidden = !tekst;
    if (tekst && element.textContent !== tekst) element.textContent = tekst;
};
export const zetTijd = tekst => zet(tijdEl, tekst);
export const zetAanwijzing = tekst => zet(aanwijzingEl, tekst);

// Minikaart: rond, met de rijrichting naar boven; op snelheid verder uitgezoomd. Stippen: [x, z, kleur, groot].
let zoom = 1;
export function tekenMinikaart(a, stippen) {
    const px = devicePixelRatio || 1, r = kaartDoek.clientWidth / 2;
    if (!r) return;
    if (kaartDoek.width !== Math.round(2 * r * px)) kaartDoek.width = kaartDoek.height = Math.round(2 * r * px);
    const g = kaartDoek.getContext('2d');
    zoom += (klemZoom(Math.hypot(a.vx, a.vz)) - zoom) * 0.05;
    const schaal = zoom * r / 110; // px per m
    g.setTransform(px, 0, 0, px, 0, 0);
    g.clearRect(0, 0, 2 * r, 2 * r);
    g.save();
    g.beginPath();
    g.arc(r, r, r - 1, 0, 2 * Math.PI);
    g.clip();
    g.fillStyle = '#cfdcc4';
    g.fillRect(0, 0, 2 * r, 2 * r);
    g.translate(r, r);
    g.rotate(-Math.PI / 2 - a.hoek);
    g.scale(schaal, schaal);
    g.drawImage(kaart.beeld, kaart.x0 - a.x, kaart.z0 - a.z);
    for (const [x, z, kleur, groot] of stippen) { // aan de rand als ze buiten de kaart vallen
        let dx = x - a.x, dz = z - a.z;
        const d = Math.hypot(dx, dz), max = (r - 8) / schaal;
        if (d > max) {
            if (!groot) continue;
            dx *= max / d;
            dz *= max / d;
        }
        g.fillStyle = kleur;
        g.strokeStyle = '#fff';
        g.lineWidth = 2 / schaal;
        g.beginPath();
        g.arc(dx, dz, (groot ? 6 : 4) / schaal, 0, 2 * Math.PI);
        g.fill();
        g.stroke();
    }
    g.restore();
    g.fillStyle = '#d4101a'; // de wagen: pijl naar boven
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(r, r - 8);
    g.lineTo(r + 6, r + 7);
    g.lineTo(r, r + 3);
    g.lineTo(r - 6, r + 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(r, r, r - 1, 0, 2 * Math.PI);
    g.strokeStyle = 'rgba(4, 23, 45, 0.35)';
    g.lineWidth = 2;
    g.stroke();
}
const klemZoom = v => 1.3 - Math.min(0.75, v / 45);

// ---------------------------------------------------------------------------
// Pauzemenu. keuzes: { zicht, tempo, geluid, beeld } en voortgang: [[naam, waarde], ...].
// ---------------------------------------------------------------------------

export function toonMenu(open, { keuzes, voortgang, kies, bron } = {}) {
    menuEl.hidden = !open;
    if (!open) return;
    const groep = (naam, sleutel, opties) => `<div class="rit-rij"><span>${naam}</span><div class="pills">${opties.map(([waarde, tekst]) =>
        `<button data-sleutel="${sleutel}" data-waarde="${waarde}" aria-pressed="${String(keuzes[sleutel]) === String(waarde)}">${tekst}</button>`).join('')}</div></div>`;
    menuEl.firstChild.innerHTML = `
        <h2>Pauze</h2>
        <button class="rit-groot" data-kies="door">Doorgaan</button>
        <button class="rit-groot rit-licht" data-kies="los">Terug op de weg</button>
        ${groep('Camera', 'zicht', Object.entries(ZICHTEN))}
        ${groep('Park', 'tempo', [[1, '1×'], [10, '10×'], [30, '30×'], [90, '90×']])}
        ${groep('Geluid', 'geluid', [[true, 'Aan'], [false, 'Uit']])}
        ${groep('Beeld', 'beeld', [['mooi', 'Mooi'], ['snel', 'Snel']])}
        <h3>Voortgang</h3>
        <dl>${voortgang.map(([naam, waarde]) => `<dt>${naam}</dt><dd>${waarde}</dd>`).join('')}</dl>
        <details><summary>Besturing</summary>
            <dl class="rit-besturing">
                <dt>Toetsenbord</dt><dd>WASD of pijltjes · spatie handrem · C camera · R terug op de weg · H toeter · Esc pauze</dd>
                <dt>Controller</dt><dd>RT gas · LT rem · A handrem · linkerstick sturen · rechterstick rondkijken · R3 achterom · Y camera · X of L3 toeter · View terug op de weg · Menu pauze</dd>
                <dt>Touchscreen</dt><dd>stuur links · pedalen rechts · knoppen boven</dd>
            </dl>
        </details>
        <button class="rit-groot rit-licht" data-kies="stop">Stoppen met rijden</button>
        <p class="rit-bron">${bron}</p>`;
    menuEl.onclick = e => {
        const k = e.target.closest('button');
        if (!k) return;
        if (k.dataset.kies) kies(k.dataset.kies);
        else if (k.dataset.sleutel) {
            const { sleutel, waarde } = k.dataset;
            kies(sleutel, sleutel === 'tempo' ? +waarde : sleutel === 'geluid' ? waarde === 'true' : waarde);
            k.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === k));
        }
    };
    menuEl.querySelector('[data-kies="door"]').focus();
}
// Controller of pijltjes in het menu: naar de vorige of volgende knop.
export function menuStap(richting) {
    const knoppen = [...menuEl.querySelectorAll('button, summary')];
    const i = knoppen.indexOf(document.activeElement);
    knoppen[(i + richting + knoppen.length) % knoppen.length]?.focus();
}
export const menuKies = () => document.activeElement?.closest?.('.rit-menu') && document.activeElement.click();
