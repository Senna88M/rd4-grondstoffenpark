// ---------------------------------------------------------------------------
// Meetdata RD4 Grondstoffenpark Heerlen
// ---------------------------------------------------------------------------

const METING = {
    bezoekers: 170,
    wachttijdSlagboom: 134.4, // seconden, gemiddeld
    openingsuren: 8.5, // ma t/m vr 9:00–17:30 (rd4.nl); op zaterdag 8:00–16:00 = 8
    voertuigen: { "Auto": 100, "Auto + aanhanger": 32, "Busje": 31, "Busje + aanhanger": 7 }
};

// Per afvalstroom: bezoeken, gemiddelde verblijfstijd (s) en
// voertuigen in dezelfde volgorde als METING.voertuigen.
const STROMEN = {
    rest:          { naam: "Restafval",        bezoeken: 47, verblijf: 147.0, voertuigen: [25, 12, 10, 0] },
    papier:        { naam: "Papier & karton",  bezoeken: 33, verblijf: 70.5,  voertuigen: [21, 7, 5, 0] },
    hout:          { naam: "Hout",             bezoeken: 30, verblijf: 94.5,  voertuigen: [12, 10, 4, 4] },
    metaal:        { naam: "Metaal",           bezoeken: 21, verblijf: 93.0,  voertuigen: [10, 4, 5, 2] },
    kunststof:     { naam: "Harde kunststof",  bezoeken: 19, verblijf: 102.0, voertuigen: [10, 4, 5, 0] },
    elektro:       { naam: "Elektronica",      bezoeken: 15, verblijf: 73.0,  voertuigen: [10, 2, 3, 0] },
    schoonpuin:    { naam: "Schoon puin",      bezoeken: 11, verblijf: 182.0, voertuigen: [6, 2, 0, 3] },
    piepschuim:    { naam: "Piepschuim",       bezoeken: 10, verblijf: 73.5,  voertuigen: [7, 2, 1, 0] },
    glas:          { naam: "Glas",             bezoeken: 9,  verblijf: 87.0,  voertuigen: [6, 1, 2, 0] },
    pmd:           { naam: "PMD",              bezoeken: 9,  verblijf: 60.0,  voertuigen: [7, 1, 1, 0] },
    tuin:          { naam: "Tuinafval",        bezoeken: 8,  verblijf: 176.5, voertuigen: [3, 3, 2, 0] },
    grofvuil:      { naam: "Grofvuil",         bezoeken: 7,  verblijf: 101.0, voertuigen: [6, 0, 0, 1] },
    matrassen:     { naam: "Matrassen",        bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] },
    asbest:        { naam: "Asbest",           bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] },
    gips:          { naam: "Gips",             bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] },
    geimpregneerd: { naam: "Geïmpr. hout",     bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] },
    banden:        { naam: "Banden",           bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] },
    dakleer:       { naam: "Dakleer",          bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] },
    tapijt:        { naam: "Tapijt",           bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] },
    vervuildpuin:  { naam: "Vervuild puin",    bezoeken: 0,  verblijf: 0,     voertuigen: [0, 0, 0, 0] }
};

// ---------------------------------------------------------------------------
// Plattegrond, afgeleid van de luchtfoto (1 px ≈ 7,5 cm; ../bronnen/luchtfoto met stromen.png).
// Meters vanaf het midden van het terrein: x = oost, z = zuid.
// ---------------------------------------------------------------------------

const PLATTEGROND = {
    terrein: [-41.8, -30.4, 41.9, 30.4],            // x1, z1, x2, z2
    toegangsweg: [[-41.8, 5.6], [-41.8, 20.6], [-60, 26], [-60, 10]],
    gebouw: [-21.8, 23.8, 14.3, 10.1],               // x, z, breedte, diepte
    slagboom: [-28.5, 12.8],

    // Rijroute (eenrichting) en de binnendoor-route langs de elektronica.
    route: [[-60, 16.9], [-36.4, 15.8], [-28.5, 15.4], [-10.1, 14.0], [1.1, 16.1], [8.6, 19.9],
            [16.1, 19.9], [20.6, 18.4], [22.0, 14.6], [22.0, -13.1], [20.6, -16.9], [17.6, -18.4],
            [-6.4, -18.4], [-21.4, -17.8], [-24.2, -14.6], [-25.1, 1.1], [-26.6, 5.6], [-32.6, 7.9],
            [-41.8, 8.6], [-60, 12.4]],
    binnendoor: [[-7.9, 14.0], [-7.9, -15.8], [-9.4, -18.2]],

    // [stroom (null = onbekend), x, z, lengte, breedte, hoek°, hoogte = 2.2]
    containers: [
        // bovenrij
        ["piepschuim", -31.9, -26.0, 6.4, 2.7, 90],
        [null, -26.6, -26.5, 6.4, 2.1, 90],
        ["papier", -23.1, -26.5, 6.4, 2.3, 90],
        ["papier", -19.7, -26.5, 6.4, 2.6, 90],
        ["pmd", -15.8, -26.0, 6.4, 2.7, 90],
        ["matrassen", -5.6, -28.1, 9.8, 4.1, 0, 1.6],
        ["asbest", 5.0, -28.9, 10.5, 2.6, 0, 1.6],
        [null, 4.6, -22.8, 6.6, 1.6, 0, 1.2],
        [null, 12.2, -23.6, 7.7, 2.9, 0],
        ["gips", 19.9, -23.8, 7.5, 3.2, 0],
        // linkerkant
        ["glas", -36.4, -19.1, 7.3, 2.2, 0],
        ["glas", -36.4, -16.6, 7.3, 2.4, 0],
        ["schoonpuin", -36.8, -9.0, 6.0, 2.2, 0],
        ["vervuildpuin", -36.8, -6.5, 6.0, 2.5, 0],
        // elektronica-blok
        ["elektro", -15.2, -8.9, 6.0, 2.2, 0, 2.6],
        ["elektro", -15.2, -6.4, 6.0, 2.2, 0, 2.6],
        ["elektro", -15.2, -3.9, 6.0, 2.2, 0, 2.6],
        ["elektro", -15.2, -1.5, 6.0, 2.2, 0, 2.6],
        ["elektro", -15.2, 1.0, 6.0, 2.2, 0, 2.6],
        ["elektro", -15.2, 3.5, 6.0, 2.2, 0, 2.6],
        // middenblok
        ["banden", 3.2, -13.7, 6.1, 2.6, 0],
        ["dakleer", 10.6, -13.7, 6.2, 2.5, 0],
        [null, 2.5, -10.8, 6.5, 2.4, 0],
        [null, 9.2, -10.8, 6.0, 2.4, 0],
        [null, -0.4, -7.9, 6.4, 2.6, 0],
        [null, 6.8, -7.9, 6.1, 2.5, 0],
        [null, 6.6, -5.1, 6.2, 2.6, 0],
        [null, 6.3, 1.6, 6.8, 2.7, 90],
        ["tapijt", 16.7, -11.4, 6.6, 2.4, 121],
        ["grofvuil", 15.5, -4.1, 6.7, 2.4, 117],
        [null, 16.3, 2.4, 5.9, 2.4, 125],
        [null, 10.9, 15.4, 6.6, 2.9, 0],
        [null, 18.2, 10.3, 9.8, 1.9, 90, 1.6],
        // rechterrij (schuin)
        ["geimpregneerd", 27.4, -19.2, 6.6, 2.4, 57],
        ["rest", 28.8, -12.4, 7.2, 2.9, 47],
        ["hout", 30.2, -5.4, 8.5, 3.0, 49],
        [null, 28.3, 1.2, 8.0, 2.7, 50],
        ["kunststof", 28.9, 7.7, 7.2, 2.9, 51],
        ["metaal", 28.7, 14.1, 7.1, 2.9, 54],
        [null, 27.0, 20.7, 7.0, 2.9, 138],
        // onderkant
        ["tuin", 13.9, 25.5, 11.2, 3.6, 0, 1.2],
        [null, -9.2, 22.1, 4.9, 4.5, 0, 1.2]
    ]
};
