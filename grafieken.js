// ---------------------------------------------------------------------------
// Analyse-tab: sankey, knelpunten, per voertuigtype en datatabel.
// Gebruikt de gedeelde cijfers en helpers uit script.js.
// ---------------------------------------------------------------------------

const analyseEl = document.getElementById('tab-analyse');
const tipEl = document.getElementById('tip');

const aanhangers = aantallen => aantallen.reduce((t, n, i) => VOERTUIGTYPES[i].includes('aanhanger') ? t + n : t, 0);

const meet = (() => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '12px Figtree, sans-serif';
    return tekst => ctx.measureText(tekst).width;
})();

document.getElementById('analyse-kpis').innerHTML = kpiHtml([
    [METING.bezoekers, 'bezoekers'],
    [TOTAAL_STOPS, 'container&shy;bezoeken'],
    [getal(TOTAAL_STOPS / METING.bezoekers, 1), 'containers per bezoeker'],
    [pct(aanhangers(VOERTUIG_AANTAL), METING.bezoekers), 'met aanhanger'],
    [tijd(METING.wachttijdSlagboom), 'min wachttijd slagboom']
]);

// Opvallend: zinnen die uit de cijfers volgen, zodat ze kloppen als de meting verandert. Met een id klikbaar naar de kaart.
function tekenInzichten(el) {
    const naam = id => STROMEN[id].naam;
    const lijstje = namen => namen.length > 1 ? `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}` : namen.join('');
    const meeste = f => ACTIEF.reduce((a, b) => f(STROMEN[b]) > f(STROMEN[a]) ? b : a);
    const langst = meeste(s => s.verblijf), bezetst = meeste(bezet), top3 = ACTIEF.slice(0, 3);
    const leeg = IDS.filter(id => !STROMEN[id].bezoeken).map(naam);
    // Het voertuigtype dat bij één stroom het sterkst oververtegenwoordigd is (minstens 3 bezoeken).
    let over = null;
    VOERTUIGTYPES.forEach((_, i) => ACTIEF.forEach(id => {
        const n = STROMEN[id].voertuigen[i], factor = n / STROMEN[id].bezoeken / (VOERTUIG_AANTAL[i] / METING.bezoekers);
        if (n >= 3 && factor > 1.5 && factor > (over?.factor || 0)) over = { i, id, factor };
    }));
    const wacht = METING.wachttijdSlagboom;
    const zinnen = [
        ['slagboom', tijd(wacht), `min wachtten bezoekers gemiddeld bij de slagboom: ${wacht > GEM_STOP ? 'langer' : 'korter'} dan bij een container (${tijd(GEM_STOP)} min)`],
        [bezetst, bezetPct(STROMEN[bezetst]), `van de openingstijd was ${naam(bezetst)} bezet, meer dan elke andere container`],
        [null, pct(som(top3, id => STROMEN[id].bezoeken), TOTAAL_STOPS), `van alle containerbezoeken ging naar ${lijstje(top3.map(naam))}`],
        [langst, tijd(STROMEN[langst].verblijf), `min stonden bezoekers gemiddeld bij ${naam(langst)}, ${getal(STROMEN[langst].verblijf / GEM_STOP, 1)} × zo lang als gemiddeld`],
        over && [VOERTUIGTYPES[over.i], pct(STROMEN[over.id].voertuigen[over.i], STROMEN[over.id].bezoeken),
            `van de bezoeken aan ${naam(over.id)} was een ${VOERTUIGTYPES[over.i].toLowerCase().replace(' + ', ' met ')}, tegen ${pct(VOERTUIG_AANTAL[over.i], METING.bezoekers)} van alle bezoekers`],
        leeg.length && [null, leeg.length, `stromen kregen op de meetdag geen bezoek: ${lijstje(leeg)}`]
    ];
    el.innerHTML = zinnen.filter(Boolean).map(([id, waarde, tekst]) => id
        ? `<button class="inzicht" data-id="${id}"><b>${waarde}</b>${tekst}</button>`
        : `<div class="inzicht"><b>${waarde}</b>${tekst}</div>`).join('');
}
tekenInzichten(document.getElementById('inzichten'));
pijlGroep(document.getElementById('inzichten'));

// Sankey: totaal → voertuigtype → afvalstroom. Breedte = containerbezoeken.
// Op een smal scherm zonder de totaal-kolom, met de voertuignamen links.
function tekenSankey(el) {
    const compact = el.clientWidth < 600;
    const W = compact ? el.clientWidth : Math.max(el.clientWidth, 680), NODE = 10, PAD = 6, PAD_TYPE = 30;
    const k = ACTIEF.length * 24 / TOTAAL_STOPS; // px per containerbezoek
    const H = TOTAAL_STOPS * k + Math.max(PAD * (ACTIEF.length - 1), PAD_TYPE * (VOERTUIGTYPES.length - 1)) + 40;
    const x0 = 110, x2 = W - (compact ? 124 : 160), x1 = compact ? 118 : Math.round((x0 + x2) / 2);

    const stapel = (waarden, pad) => {
        let y = (H - som(waarden, v => v * k) - pad * (waarden.length - 1)) / 2;
        return waarden.map(v => { const n = [y, y + v * k]; y = n[1] + pad; return n; });
    };
    const [totaal] = stapel([TOTAAL_STOPS], 0);
    const types = stapel(STOPS_PER_TYPE, PAD_TYPE);
    const stromen = stapel(ACTIEF.map(id => STROMEN[id].bezoeken), PAD);
    const band = (xa, ya, xb, yb, w) => {
        const xm = (xa + xb) / 2;
        return `M${xa},${ya}C${xm},${ya} ${xm},${yb} ${xb},${yb}V${yb + w}C${xm},${yb + w} ${xm},${ya + w} ${xa},${ya + w}Z`;
    };

    let links = '', nodes = '', tekst = '';
    let yTotaal = totaal[0];
    const yStroom = stromen.map(n => n[0]);

    VOERTUIGTYPES.forEach((type, i) => {
        const kleur = VOERTUIGKLEUREN[i], [y0, y1] = types[i];
        if (!compact) links += `<path class="link" style="fill:${kleur}" d="${band(x0 + NODE, yTotaal, x1, y0, y1 - y0)}"
            data-tip="<b>${type}</b><br>${VOERTUIG_AANTAL[i]} voertuigen · ${STOPS_PER_TYPE[i]} containerbezoeken"/>`;
        yTotaal += y1 - y0;

        let yUit = y0;
        ACTIEF.forEach((id, j) => {
            const n = STROMEN[id].voertuigen[i];
            if (!n) return;
            links += `<path class="link" data-id="${id}" style="fill:${kleur}" d="${band(x1 + NODE, yUit, x2, yStroom[j], n * k)}"
                data-tip="${type} → <b>${STROMEN[id].naam}</b><br>${n} bezoeken · ${pct(n, STROMEN[id].bezoeken)} van ${STROMEN[id].naam}"/>`;
            yUit += n * k;
            yStroom[j] += n * k;
        });

        nodes += `<rect data-id="${type}" x="${x1}" y="${y0}" width="${NODE}" height="${y1 - y0}" rx="2" style="fill:${kleur}"/>`;
        const tx = compact ? x1 - 8 : x1 + NODE + 8;
        tekst += `<text data-id="${type}" class="halo" x="${tx}" y="${(y0 + y1) / 2 - 3}" text-anchor="${compact ? 'end' : 'start'}">
            <tspan class="naam">${type}</tspan>
            <tspan class="muted" x="${tx}" dy="15">${VOERTUIG_AANTAL[i]} voertuigen${compact ? '' : ` · ${STOPS_PER_TYPE[i]} bezoeken`}</tspan></text>`;
    });

    if (!compact) {
        nodes += `<rect x="${x0}" y="${totaal[0]}" width="${NODE}" height="${totaal[1] - totaal[0]}" rx="2" class="knoop"/>`;
        tekst += `<text x="${x0 - 10}" y="${(totaal[0] + totaal[1]) / 2 - 3}" text-anchor="end">
            <tspan class="naam">Totaal</tspan>
            <tspan class="muted" x="${x0 - 10}" dy="15">${METING.bezoekers} voertuigen</tspan></text>`;
    }

    ACTIEF.forEach((id, j) => {
        const [y0, y1] = stromen[j], s = STROMEN[id];
        nodes += `<rect data-id="${id}" x="${x2}" y="${y0}" width="${NODE}" height="${y1 - y0}" rx="2" class="knoop"
            data-tip="<b>${s.naam}</b><br>${s.bezoeken} bezoeken"/>`;
        tekst += `<text data-id="${id}" x="${x2 + NODE + 8}" y="${(y0 + y1) / 2 + 4}">${s.naam} <tspan class="naam">${s.bezoeken}</tspan></text>`;
    });

    el.innerHTML = `<svg class="sankey" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${links}${nodes}${tekst}</svg>`;
}

// Knelpunten: bezoeken × gemiddelde verblijfstijd, met het parkgemiddelde als kruis.
function tekenScatter(el) {
    const W = el.clientWidth, H = 320, L = 52, R = 12, T = 12, B = 44;
    const xMax = Math.ceil(Math.max(...ACTIEF.map(id => STROMEN[id].bezoeken)) / 10) * 10;
    const yMax = Math.ceil(Math.max(...ACTIEF.map(id => STROMEN[id].verblijf)) / 30) * 30;
    const sx = v => L + v / xMax * (W - L - R);
    const sy = v => T + (1 - v / yMax) * (H - T - B);
    const gemX = TOTAAL_STOPS / ACTIEF.length, gemY = GEM_STOP;

    let svg = `<rect class="druk" x="${sx(gemX)}" y="${T}" width="${W - R - sx(gemX)}" height="${sy(gemY) - T}"/>
        <text x="${W - R - 6}" y="${T + 16}" text-anchor="end" class="muted">Druk én lang</text>`;
    for (let x = 0; x <= xMax; x += 10) {
        svg += `<line class="raster" x1="${sx(x)}" x2="${sx(x)}" y1="${T}" y2="${H - B}"/>
            <text class="as" x="${sx(x)}" y="${H - B + 16}" text-anchor="middle">${x}</text>`;
    }
    for (let y = 0; y <= yMax; y += 60) {
        svg += `<line class="raster" x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}"/>
            <text class="as" x="${L - 8}" y="${sy(y) + 4}" text-anchor="end">${tijd(y)}</text>`;
    }
    svg += `<line class="gem" x1="${sx(gemX)}" x2="${sx(gemX)}" y1="${T}" y2="${H - B}"/>
        <line class="gem" x1="${L}" x2="${W - R}" y1="${sy(gemY)}" y2="${sy(gemY)}"/>
        <text class="muted" x="${W - R - 6}" y="${sy(gemY) + 16}" text-anchor="end">gemiddeld</text>
        <text class="as" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Bezoeken</text>
        <text class="as" transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Gem. verblijf (min)</text>`;

    // Labels naast de punten: rechts, links, boven of onder — de eerste plek die vrij is.
    const vlakken = ACTIEF.map(id => { const x = sx(STROMEN[id].bezoeken), y = sy(STROMEN[id].verblijf); return [x - 6, y - 6, x + 6, y + 6]; });
    vlakken.push([W - R - 90, T, W - R, T + 22], [W - R - 70, sy(gemY) + 2, W - R, sy(gemY) + 20]); // vaste teksten
    let punten = '', namen = '';
    for (const id of ACTIEF) {
        const s = STROMEN[id], x = sx(s.bezoeken), y = sy(s.verblijf), tw = meet(s.naam), th = 14;
        const opties = [[x + 9, y - th / 2], [x - 9 - tw, y - th / 2], [x - tw / 2, y - 9 - th], [x - tw / 2, y + 9]];
        const [lx, ly] = opties.find(([a, b]) => a >= L && a + tw <= W - R && b >= T && b + th <= H - B &&
            !vlakken.some(r => a < r[2] && a + tw > r[0] && b < r[3] && b + th > r[1])) || opties[0];
        vlakken.push([lx, ly, lx + tw, ly + th]);
        namen += `<text data-id="${id}" x="${lx}" y="${ly + 11}">${s.naam}</text>`;
        punten += `<circle class="punt" cx="${x}" cy="${y}" r="5"/>
            <circle data-id="${id}" cx="${x}" cy="${y}" r="12" fill="transparent"
                data-tip="<b>${s.naam}</b><br>${s.bezoeken} bezoeken · ${tijd(s.verblijf)} min gem.<br>${uren(bezet(s))} bezetting, ≈ ${bezetPct(s)} van de openingstijd"/>`;
    }
    el.innerHTML = `<svg class="scatter" width="${W}" height="${H}">${svg}${namen}${punten}</svg>`;
}

// Aandeel bezoekers en containers per bezoek, per voertuigtype.
function tekenVoertuigen(el) {
    const perBezoek = STOPS_PER_TYPE.map((n, i) => n / VOERTUIG_AANTAL[i]);
    const max = Math.max(...perBezoek), gem = TOTAAL_STOPS / METING.bezoekers;
    const rij = (i, breedte, waarde, tick) => balkRij(`<i class="dot" style="background:${VOERTUIGKLEUREN[i]}"></i>${VOERTUIGTYPES[i]}`,
        breedte, waarde, { tick, kleur: VOERTUIGKLEUREN[i] });
    el.innerHTML = `
        <h3>Aandeel bezoekers</h3>
        <div class="bars">${VOERTUIGTYPES.map((_, i) =>
            rij(i, VOERTUIG_AANTAL[i] / METING.bezoekers * 100, pct(VOERTUIG_AANTAL[i], METING.bezoekers))).join('')}</div>
        <h3>Containers per bezoek</h3>
        <div class="bars">${VOERTUIGTYPES.map((_, i) =>
            rij(i, perBezoek[i] / max * 100, getal(perBezoek[i], 1), gem / max * 100)).join('')}</div>
        <p class="note"><em class="tick"></em> gemiddeld ${getal(gem, 1)}</p>`;
}

// Datatabel met alle stromen; voertuigkolommen als heatmap.
const KOLOMMEN = [
    { kop: 'Stroom', waarde: s => s.naam },
    { kop: 'Bezoeken', waarde: s => s.bezoeken },
    { kop: '% bezoekers', waarde: s => s.bezoeken, fmt: v => pct(v, METING.bezoekers) },
    { kop: 'Gem. verblijf', waarde: s => s.verblijf, fmt: METRICS.verblijf.fmt },
    { kop: 'Bezetting', waarde: bezet, fmt: uren },
    { kop: '% van openingstijd', waarde: bezet, fmt: v => pct(v, OPENINGSTIJD) },
    ...VOERTUIGTYPES.map((kop, i) => ({ kop, waarde: s => s.voertuigen[i], heat: true })),
    { kop: '% met aanhanger', waarde: s => aanhangers(s.voertuigen) / (s.bezoeken || 1), fmt: v => Math.round(v * 100) + '%' }
];
const sortering = { kolom: 1, oplopend: false };

function tekenTabel(el) {
    const { waarde } = KOLOMMEN[sortering.kolom];
    const rijen = [...IDS].sort((a, b) => {
        const va = waarde(STROMEN[a]), vb = waarde(STROMEN[b]);
        const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sortering.oplopend ? c : -c;
    });
    const maxCel = Math.max(...IDS.flatMap(id => STROMEN[id].voertuigen));
    const cel = (kolom, s) => {
        const v = kolom.waarde(s), tekst = kolom.fmt ? kolom.fmt(v) : v;
        if (kolom === KOLOMMEN[0]) return `<td><button>${tekst}</button></td>`; // toetsenbord: naar de kaart
        if (!kolom.heat || !v) return `<td>${tekst}</td>`;
        const c = rampKleur(v / maxCel), licht = c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.55; // tekstkleur naar helderheid cel
        return `<td class="heat" style="background:#${c.getHexString()};color:${licht ? '#04172d' : '#fff'}">${tekst}</td>`;
    };
    el.innerHTML = `<table>
        <thead><tr>${KOLOMMEN.map((k, i) => `<th data-kolom="${i}"
            aria-sort="${i === sortering.kolom ? (sortering.oplopend ? 'ascending' : 'descending') : 'none'}"><button>${k.kop}</button></th>`).join('')}</tr></thead>
        <tbody>${rijen.map(id => `<tr data-id="${id}">${KOLOMMEN.map(k => cel(k, STROMEN[id])).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

pijlGroep(document.getElementById('tabel'), 'th button'); // kolomkoppen: sorteren
pijlGroep(document.getElementById('tabel'), 'td button'); // stromen: naar de kaart
document.getElementById('tabel').addEventListener('click', e => {
    const th = e.target.closest('[data-kolom]');
    if (!th) return;
    const kolom = +th.dataset.kolom;
    sortering.oplopend = kolom === sortering.kolom ? !sortering.oplopend : kolom === 0;
    sortering.kolom = kolom;
    tekenTabel(document.getElementById('tabel'));
    document.querySelector(`#tabel [data-kolom="${kolom}"] button`).focus(); // focus blijft op de kolom
});

// Klik op een stroom (sankey, punt, tabelrij) = hetzelfde als op de container klikken.
analyseEl.addEventListener('click', e => {
    const doel = e.target.closest('[data-id]');
    if (!doel) return;
    tipEl.hidden = true;
    toonTab('kaart'); // staat in script.js
    selecteer(doel.dataset.id);
    if (!e.detail) detailEl.querySelector('.terug').focus(); // met het toetsenbord gekozen: focus mee naar het detail
});

// Tooltip voor alles met data-tip.
analyseEl.addEventListener('pointermove', e => {
    const doel = e.target.closest('[data-tip]');
    tipEl.hidden = !doel;
    if (!doel) return;
    tipEl.innerHTML = doel.dataset.tip;
    const x = e.clientX + 14 + tipEl.offsetWidth > innerWidth ? e.clientX - 14 - tipEl.offsetWidth : e.clientX + 14;
    tipEl.style.transform = `translate(${x}px, ${e.clientY + 14}px)`;
});
analyseEl.addEventListener('pointerleave', () => { tipEl.hidden = true; });

function tekenAnalyse() {
    if (analyseEl.hidden) return;
    tekenSankey(document.getElementById('sankey'));
    tekenScatter(document.getElementById('scatter'));
    tekenVoertuigen(document.getElementById('voertuigen'));
    tekenTabel(document.getElementById('tabel'));
}
new ResizeObserver(tekenAnalyse).observe(analyseEl);

// Afdrukken of PDF: altijd de analyse, licht, in één kolom op papierbreedte (.afdruk in style.css).
// De grafieken worden daarvoor op die breedte opnieuw getekend en na afloop weer terug.
let voorAfdruk;
addEventListener('beforeprint', () => {
    voorAfdruk = { tab: kaartEl.hidden ? 'analyse' : 'kaart', donker };
    document.documentElement.classList.add('afdruk');
    if (donker) zetThema('light');
    toonTab('analyse');
});
addEventListener('afterprint', () => {
    document.documentElement.classList.remove('afdruk');
    if (voorAfdruk.donker) zetThema('dark');
    toonTab(voorAfdruk.tab);
});
document.getElementById('afdrukken').addEventListener('click', () => print());
document.fonts.ready.then(tekenAnalyse);
