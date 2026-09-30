// Werkt ook zonder wifi op het park: eerst het netwerk (dus altijd de nieuwste versie),
// lukt dat niet, dan wat er de vorige keer binnenkwam. Bij de eerste keer alvast alles ophalen.
const CACHE = 'rd4-park';
const BESTANDEN = [
    './', 'index.html', 'style.css', 'data.js', 'script.js', 'grafieken.js', 'spel.js', 'sim.js', 'omgeving.js', 'rit/rit.js', 'rit/rit.css', 'rit/hulp.js', 'rit/wereld.js', 'rit/auto.js', 'rit/invoer.js', 'rit/hud.js', 'rit/doelen.js', 'rit/verkeer.js', 'rit/model.js', 'img/logord4.png',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(BESTANDEN)).catch(() => { })); // lukt het niet, dan vult de cache zich bij gebruik
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
    // no-cache: altijd bij de server navragen (304 als er niets veranderde); anders mengt de browser
    // na een update oude en nieuwe bestanden, en die passen niet op elkaar.
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(antwoord => {
        if (antwoord.ok || antwoord.type === 'opaque') { // geen foutpagina's bewaren
            const kopie = antwoord.clone();
            caches.open(CACHE).then(c => c.put(e.request, kopie));
        }
        return antwoord;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
