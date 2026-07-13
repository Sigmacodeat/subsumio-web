/**
 * Legal Concept → § Mapping — compact hint system.
 * Maps legal concepts to their 1-3 MOST RELEVANT §-numbers.
 * Precision comes from §-extraction + LLM reranking + agentic loop, not exhaustive lists.
 */

export interface ConceptMapping {
  terms: string[];
  law: string;
  jurisdiction: "de" | "at" | "ch";
  sections: (number | string)[];
}

const DE: ConceptMapping[] = [
  // BGB
  { terms: ["sittenwidrig", "sittenwidrigkeit", "gute sitten"], law: "BGB", jurisdiction: "de", sections: [138] },
  { terms: ["geschäftsfähigkeit", "geschäftsfähig"], law: "BGB", jurisdiction: "de", sections: [104, 106] },
  { terms: ["geschäftsunfähig"], law: "BGB", jurisdiction: "de", sections: [104] },
  { terms: ["willenserklärung"], law: "BGB", jurisdiction: "de", sections: [116, 119] },
  { terms: ["anfechtung", "irrtum"], law: "BGB", jurisdiction: "de", sections: [119, 123] },
  { terms: ["täuschung", "arglistige täuschung"], law: "BGB", jurisdiction: "de", sections: [123] },
  { terms: ["drohung"], law: "BGB", jurisdiction: "de", sections: [123] },
  { terms: ["stellvertretung", "vollmacht"], law: "BGB", jurisdiction: "de", sections: [164, 167] },
  { terms: ["verjährung", "verjährt", "verjährungsfrist"], law: "BGB", jurisdiction: "de", sections: [195, 199] },
  { terms: ["regelmäßige verjährung"], law: "BGB", jurisdiction: "de", sections: [195] },
  { terms: ["hemmung der verjährung"], law: "BGB", jurisdiction: "de", sections: [203] },
  { terms: ["frist", "fristablauf"], law: "BGB", jurisdiction: "de", sections: [187, 193] },
  { terms: ["kaufvertrag", "kauf", "gewährleistung"], law: "BGB", jurisdiction: "de", sections: [433, 434] },
  { terms: ["mängel", "sache mangel"], law: "BGB", jurisdiction: "de", sections: [434, 437] },
  { terms: ["rücktritt", "rücktrittsrecht"], law: "BGB", jurisdiction: "de", sections: [346] },
  { terms: ["minderung"], law: "BGB", jurisdiction: "de", sections: [441] },
  { terms: ["schadensersatz"], law: "BGB", jurisdiction: "de", sections: [280, 823] },
  { terms: ["unmöglichkeit"], law: "BGB", jurisdiction: "de", sections: [275] },
  { terms: ["verzug", "leistungsverzug"], law: "BGB", jurisdiction: "de", sections: [286] },
  { terms: ["mietvertrag", "miete", "mieter", "vermieter"], law: "BGB", jurisdiction: "de", sections: [535, 573] },
  { terms: ["werkvertrag"], law: "BGB", jurisdiction: "de", sections: [631, 634] },
  { terms: ["dienstvertrag"], law: "BGB", jurisdiction: "de", sections: [611] },
  { terms: ["darlehen", "kredit"], law: "BGB", jurisdiction: "de", sections: [488] },
  { terms: ["schenkung"], law: "BGB", jurisdiction: "de", sections: [516] },
  { terms: ["unerlaubte handlung", "delikt"], law: "BGB", jurisdiction: "de", sections: [823, 826] },
  { terms: ["gefährdungshaftung"], law: "BGB", jurisdiction: "de", sections: [833] },
  { terms: ["tierhalterhaftung", "tierhalter"], law: "BGB", jurisdiction: "de", sections: [833] },
  { terms: ["widerruf", "widerrufsrecht"], law: "BGB", jurisdiction: "de", sections: [355] },
  { terms: ["kündigung"], law: "BGB", jurisdiction: "de", sections: [314, 573] },
  { terms: ["fristlose kündigung"], law: "BGB", jurisdiction: "de", sections: [314] },
  { terms: ["ungerechtfertigte bereicherung"], law: "BGB", jurisdiction: "de", sections: [812] },
  { terms: ["eigentum", "eigentumsübertragung"], law: "BGB", jurisdiction: "de", sections: [929] },
  { terms: ["besitzschutz"], law: "BGB", jurisdiction: "de", sections: [867] },
  { terms: ["herausgabe"], law: "BGB", jurisdiction: "de", sections: [985] },
  { terms: ["hypothek"], law: "BGB", jurisdiction: "de", sections: [1113] },
  { terms: ["erbrecht", "erbfolge", "testament"], law: "BGB", jurisdiction: "de", sections: [1922, 1937] },
  { terms: ["pflichtteil"], law: "BGB", jurisdiction: "de", sections: [2303] },
  { terms: ["erbvertrag"], law: "BGB", jurisdiction: "de", sections: [2278] },
  { terms: ["ehe", "ehegatte", "ehevertrag"], law: "BGB", jurisdiction: "de", sections: [1353] },
  { terms: ["unterhalt", "unterhaltspflicht"], law: "BGB", jurisdiction: "de", sections: [1601, 1603] },
  { terms: ["sorgerecht", "elterliche sorge"], law: "BGB", jurisdiction: "de", sections: [1626] },
  { terms: ["vormundschaft"], law: "BGB", jurisdiction: "de", sections: [1773] },
  { terms: ["notwehr"], law: "BGB", jurisdiction: "de", sections: [227] },
  { terms: ["notstand"], law: "BGB", jurisdiction: "de", sections: [228] },
  // StGB
  { terms: ["mord"], law: "StGB", jurisdiction: "de", sections: [211] },
  { terms: ["totschlag"], law: "StGB", jurisdiction: "de", sections: [212] },
  { terms: ["fahrlässige tötung"], law: "StGB", jurisdiction: "de", sections: [222] },
  { terms: ["körperverletzung"], law: "StGB", jurisdiction: "de", sections: [223, 226] },
  { terms: ["beleidigung"], law: "StGB", jurisdiction: "de", sections: [185, 186] },
  { terms: ["üble nachrede"], law: "StGB", jurisdiction: "de", sections: [186] },
  { terms: ["verleumdung"], law: "StGB", jurisdiction: "de", sections: [187] },
  { terms: ["diebstahl"], law: "StGB", jurisdiction: "de", sections: [242, 243] },
  { terms: ["schwerer diebstahl"], law: "StGB", jurisdiction: "de", sections: [243, 244] },
  { terms: ["raub"], law: "StGB", jurisdiction: "de", sections: [249, 250] },
  { terms: ["erpressung"], law: "StGB", jurisdiction: "de", sections: [253, 255] },
  { terms: ["betrug"], law: "StGB", jurisdiction: "de", sections: [263] },
  { terms: ["unterschlagung"], law: "StGB", jurisdiction: "de", sections: [246] },
  { terms: ["urkundenfälschung"], law: "StGB", jurisdiction: "de", sections: [267] },
  { terms: ["sachbeschädigung"], law: "StGB", jurisdiction: "de", sections: [303] },
  { terms: ["brandstiftung"], law: "StGB", jurisdiction: "de", sections: [306] },
  { terms: ["nötigung"], law: "StGB", jurisdiction: "de", sections: [240] },
  { terms: ["bedrohung"], law: "StGB", jurisdiction: "de", sections: [241] },
  { terms: ["hausfriedensbruch"], law: "StGB", jurisdiction: "de", sections: [123] },
  { terms: ["bestechung", "bestechlichkeit"], law: "StGB", jurisdiction: "de", sections: [331, 332] },
  { terms: ["geldwäsche"], law: "StGB", jurisdiction: "de", sections: [261] },
  { terms: ["computerbetrug"], law: "StGB", jurisdiction: "de", sections: ["263a"] },
  { terms: ["subventionsbetrug"], law: "StGB", jurisdiction: "de", sections: [264] },
  { terms: ["untreue"], law: "StGB", jurisdiction: "de", sections: [266] },
  { terms: ["versicherungsbetrug"], law: "StGB", jurisdiction: "de", sections: [265] },
  { terms: ["steuerhinterziehung"], law: "StGB", jurisdiction: "de", sections: [370] },
  { terms: ["vollstreckungsvereitelung"], law: "StGB", jurisdiction: "de", sections: [288] },
  { terms: ["meineid", "falschaussage"], law: "StGB", jurisdiction: "de", sections: [154, 156] },
  { terms: ["vorsatz", "vorsätzlich"], law: "StGB", jurisdiction: "de", sections: [15, 16] },
  { terms: ["fahrlässigkeit"], law: "StGB", jurisdiction: "de", sections: [16] },
  { terms: ["schuldunfähigkeit", "schuldunfähig"], law: "StGB", jurisdiction: "de", sections: [19, 20] },
  { terms: ["verminderte schuldfähigkeit"], law: "StGB", jurisdiction: "de", sections: [21] },
  { terms: ["notwehr"], law: "StGB", jurisdiction: "de", sections: [32] },
  { terms: ["notstand"], law: "StGB", jurisdiction: "de", sections: [34, 35] },
  { terms: ["versuch"], law: "StGB", jurisdiction: "de", sections: [22, 24] },
  { terms: ["rücktritt vom versuch"], law: "StGB", jurisdiction: "de", sections: [24] },
  { terms: ["täterschaft"], law: "StGB", jurisdiction: "de", sections: [25] },
  { terms: ["beihilfe"], law: "StGB", jurisdiction: "de", sections: [27] },
  { terms: ["anstiftung"], law: "StGB", jurisdiction: "de", sections: [26] },
  { terms: ["freiheitsstrafe"], law: "StGB", jurisdiction: "de", sections: [38] },
  { terms: ["geldstrafe"], law: "StGB", jurisdiction: "de", sections: [40] },
  { terms: ["unterlassene hilfeleistung"], law: "StGB", jurisdiction: "de", sections: ["323c"] },
  // ZPO
  { terms: ["gerichtsstand", "zuständigkeit"], law: "ZPO", jurisdiction: "de", sections: [12, 13, 32] },
  { terms: ["sachliche zuständigkeit"], law: "ZPO", jurisdiction: "de", sections: [1, 71] },
  { terms: ["allgemeiner gerichtsstand"], law: "ZPO", jurisdiction: "de", sections: [13] },
  { terms: ["gerichtsstand der unerlaubten handlung"], law: "ZPO", jurisdiction: "de", sections: [32] },
  { terms: ["gerichtsstand des vermögens"], law: "ZPO", jurisdiction: "de", sections: [23] },
  { terms: ["klage", "klageschrift", "klageerhebung"], law: "ZPO", jurisdiction: "de", sections: [253] },
  { terms: ["widerklage"], law: "ZPO", jurisdiction: "de", sections: [33] },
  { terms: ["streitwert", "streitgegenstand"], law: "ZPO", jurisdiction: "de", sections: [3] },
  { terms: ["beweis", "beweisaufnahme", "beweislast"], law: "ZPO", jurisdiction: "de", sections: [355, 420] },
  { terms: ["versäumnisurteil"], law: "ZPO", jurisdiction: "de", sections: [330, 331] },
  { terms: ["einstweilige verfügung", "einstweiliger rechtsschutz"], law: "ZPO", jurisdiction: "de", sections: [935, 940] },
  { terms: ["arrest", "dinglicher arrest"], law: "ZPO", jurisdiction: "de", sections: [917, 920] },
  { terms: ["zwangsvollstreckung", "vollstreckung"], law: "ZPO", jurisdiction: "de", sections: [704, 802] },
  { terms: ["berufung", "berufungsfrist"], law: "ZPO", jurisdiction: "de", sections: [511, 517] },
  { terms: ["revision"], law: "ZPO", jurisdiction: "de", sections: [542, 545] },
  { terms: ["beschwerde", "sofortige beschwerde"], law: "ZPO", jurisdiction: "de", sections: [567, 570] },
  { terms: ["prozesskosten", "kosten"], law: "ZPO", jurisdiction: "de", sections: [91, 97] },
  { terms: ["prozesskostenhilfe"], law: "ZPO", jurisdiction: "de", sections: [114] },
  { terms: ["zustellung"], law: "ZPO", jurisdiction: "de", sections: [166, 171] },
  { terms: ["notfrist", "fristsetzung"], law: "ZPO", jurisdiction: "de", sections: [214, 222] },
  { terms: ["wiedereinsetzung in den vorigen stand"], law: "ZPO", jurisdiction: "de", sections: [233, 236] },
  { terms: ["mahnverfahren", "mahnbescheid"], law: "ZPO", jurisdiction: "de", sections: [688, 694] },
  { terms: ["prozessfähigkeit"], law: "ZPO", jurisdiction: "de", sections: [51] },
  { terms: ["postulationsfähigkeit"], law: "ZPO", jurisdiction: "de", sections: [78] },
  // HGB
  { terms: ["kaufmann", "kaufmannseigenschaft"], law: "HGB", jurisdiction: "de", sections: [1, 2, 6] },
  { terms: ["handelsregister"], law: "HGB", jurisdiction: "de", sections: [8, 15] },
  { terms: ["firma", "firmenname"], law: "HGB", jurisdiction: "de", sections: [17, 23] },
  { terms: ["handelsvertreter"], law: "HGB", jurisdiction: "de", sections: [84, 86] },
  { terms: ["prokura"], law: "HGB", jurisdiction: "de", sections: [48, 53] },
  { terms: ["handlungsvollmacht"], law: "HGB", jurisdiction: "de", sections: [54] },
  { terms: ["ohg", "offene handelsgesellschaft"], law: "HGB", jurisdiction: "de", sections: [105, 124] },
  { terms: ["kg", "kommanditgesellschaft"], law: "HGB", jurisdiction: "de", sections: [161, 167] },
  { terms: ["stille gesellschaft"], law: "HGB", jurisdiction: "de", sections: [335, 339] },
  { terms: ["kommissionär"], law: "HGB", jurisdiction: "de", sections: [383, 396] },
  { terms: ["spediteur", "spedition"], law: "HGB", jurisdiction: "de", sections: [453, 458] },
  { terms: ["frachtführer", "fracht"], law: "HGB", jurisdiction: "de", sections: [425, 435] },
  { terms: ["lagerhalter"], law: "HGB", jurisdiction: "de", sections: [467, 475] },
  { terms: ["handelsgewerbe"], law: "HGB", jurisdiction: "de", sections: [1, 2] },
  // AO
  { terms: ["betriebstätte"], law: "AO", jurisdiction: "de", sections: [12] },
  { terms: ["geschäftsleitung"], law: "AO", jurisdiction: "de", sections: [10] },
  { terms: ["ständiger vertreter"], law: "AO", jurisdiction: "de", sections: [13] },
  { terms: ["wohnsitz", "wohnort"], law: "AO", jurisdiction: "de", sections: [19] },
  { terms: ["angehörige"], law: "AO", jurisdiction: "de", sections: [15] },
  { terms: ["steuergeheimnis"], law: "AO", jurisdiction: "de", sections: [30] },
  { terms: ["nebenleistungen"], law: "AO", jurisdiction: "de", sections: [3] },
  { terms: ["steuerschuld", "steuerschuldner"], law: "AO", jurisdiction: "de", sections: [38, 44] },
  { terms: ["haftung", "haftungsbescheid"], law: "AO", jurisdiction: "de", sections: [69, 73] },
  { terms: ["festsetzungsverjährung", "festsetzungsfrist"], law: "AO", jurisdiction: "de", sections: [169, 171] },
  { terms: ["zahlungsverjährung"], law: "AO", jurisdiction: "de", sections: [228] },
  { terms: ["einspruch"], law: "AO", jurisdiction: "de", sections: [347, 354] },
  { terms: ["außenprüfung", "betriebsprüfung"], law: "AO", jurisdiction: "de", sections: [193, 200] },
  { terms: ["schätzung", "schätzungsbescheid"], law: "AO", jurisdiction: "de", sections: [162] },
  { terms: ["steuerbescheid", "bescheid"], law: "AO", jurisdiction: "de", sections: [155, 157] },
  { terms: ["verwaltungsakt"], law: "AO", jurisdiction: "de", sections: [118, 124] },
  { terms: ["frist", "fristsetzung"], law: "AO", jurisdiction: "de", sections: [108, 109] },
  { terms: ["wiedereinsetzung in den vorigen stand"], law: "AO", jurisdiction: "de", sections: [110] },
  { terms: ["zwangsvollstreckung"], law: "AO", jurisdiction: "de", sections: [249, 254] },
  { terms: ["zwangsgeld"], law: "AO", jurisdiction: "de", sections: [328] },
  // StPO
  { terms: ["ermittlungsverfahren", "ermittlungen"], law: "StPO", jurisdiction: "de", sections: [160, 163] },
  { terms: ["staatsanwaltschaft", "staatsanwalt"], law: "StPO", jurisdiction: "de", sections: [152, 160] },
  { terms: ["untersuchungshaft", "haftbefehl"], law: "StPO", jurisdiction: "de", sections: [112, 114] },
  { terms: ["vernehmung"], law: "StPO", jurisdiction: "de", sections: [136, 163] },
  { terms: ["durchsuchung", "durchsuchungsbeschluss"], law: "StPO", jurisdiction: "de", sections: [102, 105] },
  { terms: ["beschlagnahme", "sicherstellung"], law: "StPO", jurisdiction: "de", sections: [94, 98] },
  { terms: ["akteneinsicht"], law: "StPO", jurisdiction: "de", sections: [147] },
  { terms: ["pflichtverteidiger"], law: "StPO", jurisdiction: "de", sections: [141, 144] },
  { terms: ["festnahme", "verhaftung"], law: "StPO", jurisdiction: "de", sections: [127, 129] },
  { terms: ["körperliche untersuchung", "blutprobe"], law: "StPO", jurisdiction: "de", sections: [81, 81] },
  // InsO
  { terms: ["insolvenz", "insolvenzverfahren"], law: "InsO", jurisdiction: "de", sections: [1, 11, 21] },
  { terms: ["insolvenzplan"], law: "InsO", jurisdiction: "de", sections: [217, 221] },
  { terms: ["restschuldbefreiung"], law: "InsO", jurisdiction: "de", sections: [286, 290] },
  { terms: ["insolvenzverwalter"], law: "InsO", jurisdiction: "de", sections: [56, 80] },
  { terms: ["gläubigerversammlung"], law: "InsO", jurisdiction: "de", sections: [74, 76] },
  { terms: ["insolvenzgericht"], law: "InsO", jurisdiction: "de", sections: [3] },
  { terms: ["sanierung"], law: "InsO", jurisdiction: "de", sections: [217] },
  // RVG
  { terms: ["anwaltsvergütung", "rechtsanwaltsvergütung"], law: "RVG", jurisdiction: "de", sections: [1, 13, 23] },
  { terms: ["verfahrensgebühr"], law: "RVG", jurisdiction: "de", sections: [23] },
  { terms: ["terminsgebühr"], law: "RVG", jurisdiction: "de", sections: [23] },
  { terms: ["erfolgsgebühr"], law: "RVG", jurisdiction: "de", sections: [23] },
  // VwGO
  { terms: ["verwaltungsgericht", "verwaltungsgerichtsbarkeit"], law: "VwGO", jurisdiction: "de", sections: [1, 40, 42] },
  { terms: ["anfechtungsklage"], law: "VwGO", jurisdiction: "de", sections: [42] },
  { terms: ["verpflichtungsklage"], law: "VwGO", jurisdiction: "de", sections: [42] },
  { terms: ["feststellungsklage"], law: "VwGO", jurisdiction: "de", sections: [43] },
  { terms: ["vorläufiger rechtsschutz", "einstweiliger rechtsschutz"], law: "VwGO", jurisdiction: "de", sections: [80] },
  // BauGB
  { terms: ["baugenehmigung"], law: "BauGB", jurisdiction: "de", sections: [68, 72] },
  { terms: ["bebauungsplan"], law: "BauGB", jurisdiction: "de", sections: [8, 9] },
  // UWG
  { terms: ["irreführende werbung", "irreführend"], law: "UWG", jurisdiction: "de", sections: [5] },
  { terms: ["unlauterer wettbewerb", "wettbewerbsverstoß"], law: "UWG", jurisdiction: "de", sections: [3] },
  { terms: ["vergleichende werbung"], law: "UWG", jurisdiction: "de", sections: [6] },
  // GG
  { terms: ["grundrecht", "grundrechte"], law: "GG", jurisdiction: "de", sections: [1, 2, 3] },
  { terms: ["menschenwürde"], law: "GG", jurisdiction: "de", sections: [1] },
  { terms: ["gleichheit", "gleichheitsgrundsatz"], law: "GG", jurisdiction: "de", sections: [3] },
  { terms: ["verhältnismäßigkeit"], law: "GG", jurisdiction: "de", sections: [20] },
  { terms: ["bundesverfassungsgericht", "verfassungsgericht"], law: "GG", jurisdiction: "de", sections: [93, 94] },
];

const AT: ConceptMapping[] = [
  // ABGB
  { terms: ["sittenwidrig", "sittenwidrigkeit", "gute sitten"], law: "ABGB", jurisdiction: "at", sections: [879] },
  { terms: ["geschäftsfähigkeit", "geschäftsfähig"], law: "ABGB", jurisdiction: "at", sections: [21, 24] },
  { terms: ["minderjähriger", "minderjährige"], law: "ABGB", jurisdiction: "at", sections: [21, 151] },
  { terms: ["geschäftsunfähig"], law: "ABGB", jurisdiction: "at", sections: [24] },
  { terms: ["willenserklärung"], law: "ABGB", jurisdiction: "at", sections: [863, 867] },
  { terms: ["anfechtung", "irrtum"], law: "ABGB", jurisdiction: "at", sections: [871, 873] },
  { terms: ["täuschung", "arglistige täuschung"], law: "ABGB", jurisdiction: "at", sections: [870, 871] },
  { terms: ["drohung"], law: "ABGB", jurisdiction: "at", sections: [870, 871] },
  { terms: ["stellvertretung", "vollmacht"], law: "ABGB", jurisdiction: "at", sections: [1002, 1009] },
  { terms: ["verjährung", "verjährt", "verjährungsfrist"], law: "ABGB", jurisdiction: "at", sections: [1489, 1493] },
  { terms: ["regelmäßige verjährung"], law: "ABGB", jurisdiction: "at", sections: [1489] },
  { terms: ["hemmung der verjährung"], law: "ABGB", jurisdiction: "at", sections: [1496, 1497] },
  { terms: ["frist", "fristablauf"], law: "ABGB", jurisdiction: "at", sections: [1235, 1239] },
  { terms: ["kaufvertrag", "kauf", "gewährleistung"], law: "ABGB", jurisdiction: "at", sections: [1053, 1063] },
  { terms: ["mängel", "sache mangel", "mangelhaft"], law: "ABGB", jurisdiction: "at", sections: [922, 932] },
  { terms: ["rücktritt", "rücktrittsrecht"], law: "ABGB", jurisdiction: "at", sections: [918, 920] },
  { terms: ["minderung"], law: "ABGB", jurisdiction: "at", sections: [932] },
  { terms: ["schadenersatz"], law: "ABGB", jurisdiction: "at", sections: [1293, 1311] },
  { terms: ["unmöglichkeit"], law: "ABGB", jurisdiction: "at", sections: [879, 920] },
  { terms: ["verzug", "leistungsverzug"], law: "ABGB", jurisdiction: "at", sections: [918, 1318] },
  { terms: ["mietvertrag", "miete", "mieter", "vermieter"], law: "ABGB", jurisdiction: "at", sections: [1080, 1092] },
  { terms: ["werkvertrag"], law: "ABGB", jurisdiction: "at", sections: [1151, 1170] },
  { terms: ["darlehen", "kredit"], law: "ABGB", jurisdiction: "at", sections: [1235, 1237] },
  { terms: ["schenkung"], law: "ABGB", jurisdiction: "at", sections: [1235, 1236] },
  { terms: ["unerlaubte handlung", "delikt"], law: "ABGB", jurisdiction: "at", sections: [1293, 1311] },
  { terms: ["gefährdungshaftung"], law: "ABGB", jurisdiction: "at", sections: [1309, 1311] },
  { terms: ["tierhalterhaftung", "tierhalter"], law: "ABGB", jurisdiction: "at", sections: [1320] },
  { terms: ["haftung"], law: "ABGB", jurisdiction: "at", sections: [1293, 1311] },
  { terms: ["kündigung"], law: "ABGB", jurisdiction: "at", sections: [1092, 1093] },
  { terms: ["ungerechtfertigte bereicherung"], law: "ABGB", jurisdiction: "at", sections: [1431, 1437] },
  { terms: ["eigentum", "eigentumsübertragung"], law: "ABGB", jurisdiction: "at", sections: [353, 361] },
  { terms: ["besitz", "besitzschutz"], law: "ABGB", jurisdiction: "at", sections: [309, 339] },
  { terms: ["herausgabe", "eigentumsschutz"], law: "ABGB", jurisdiction: "at", sections: [366, 372] },
  { terms: ["erbrecht", "erbfolge", "testament"], law: "ABGB", jurisdiction: "at", sections: [531, 562] },
  { terms: ["pflichtteil"], law: "ABGB", jurisdiction: "at", sections: [762, 765] },
  { terms: ["erbvertrag"], law: "ABGB", jurisdiction: "at", sections: [602, 603] },
  { terms: ["ehe", "ehegatte", "ehevertrag"], law: "ABGB", jurisdiction: "at", sections: [44, 72] },
  { terms: ["unterhalt", "unterhaltspflicht"], law: "ABGB", jurisdiction: "at", sections: [140, 143] },
  { terms: ["sorgerecht", "elterliche sorge"], law: "ABGB", jurisdiction: "at", sections: [144, 151] },
  { terms: ["vormundschaft", "vormund"], law: "ABGB", jurisdiction: "at", sections: [211, 225] },
  { terms: ["notwehr"], law: "ABGB", jurisdiction: "at", sections: [3] },
  { terms: ["notstand"], law: "ABGB", jurisdiction: "at", sections: [3] },
  // AT StGB
  { terms: ["mord"], law: "StGB", jurisdiction: "at", sections: [75] },
  { terms: ["totschlag"], law: "StGB", jurisdiction: "at", sections: [76] },
  { terms: ["fahrlässige tötung"], law: "StGB", jurisdiction: "at", sections: [80] },
  { terms: ["körperverletzung"], law: "StGB", jurisdiction: "at", sections: [83, 84] },
  { terms: ["beleidigung"], law: "StGB", jurisdiction: "at", sections: [111, 115] },
  { terms: ["üble nachrede"], law: "StGB", jurisdiction: "at", sections: [111] },
  { terms: ["verleumdung"], law: "StGB", jurisdiction: "at", sections: [297] },
  { terms: ["diebstahl"], law: "StGB", jurisdiction: "at", sections: [127, 129] },
  { terms: ["schwerer diebstahl"], law: "StGB", jurisdiction: "at", sections: [129, 131] },
  { terms: ["raub"], law: "StGB", jurisdiction: "at", sections: [142, 144] },
  { terms: ["erpressung"], law: "StGB", jurisdiction: "at", sections: [144, 146] },
  { terms: ["betrug"], law: "StGB", jurisdiction: "at", sections: [146] },
  { terms: ["unterschlagung"], law: "StGB", jurisdiction: "at", sections: [134, 135] },
  { terms: ["urkundenfälschung"], law: "StGB", jurisdiction: "at", sections: [223, 228] },
  { terms: ["sachbeschädigung"], law: "StGB", jurisdiction: "at", sections: [125] },
  { terms: ["brandstiftung"], law: "StGB", jurisdiction: "at", sections: [169, 170] },
  { terms: ["nötigung"], law: "StGB", jurisdiction: "at", sections: [105, 106] },
  { terms: ["bedrohung"], law: "StGB", jurisdiction: "at", sections: [107] },
  { terms: ["hausfriedensbruch"], law: "StGB", jurisdiction: "at", sections: [109] },
  { terms: ["bestechung", "bestechlichkeit"], law: "StGB", jurisdiction: "at", sections: [304, 305] },
  { terms: ["geldwäsche"], law: "StGB", jurisdiction: "at", sections: [165] },
  { terms: ["untreue"], law: "StGB", jurisdiction: "at", sections: [153] },
  { terms: ["versicherungsbetrug"], law: "StGB", jurisdiction: "at", sections: [151] },
  { terms: ["vorsatz", "vorsätzlich"], law: "StGB", jurisdiction: "at", sections: [5, 6] },
  { terms: ["fahrlässigkeit"], law: "StGB", jurisdiction: "at", sections: [6] },
  { terms: ["schuldunfähigkeit", "schuldunfähig"], law: "StGB", jurisdiction: "at", sections: [11] },
  { terms: ["verminderte schuldfähigkeit"], law: "StGB", jurisdiction: "at", sections: [11] },
  { terms: ["notwehr"], law: "StGB", jurisdiction: "at", sections: [3] },
  { terms: ["notstand"], law: "StGB", jurisdiction: "at", sections: [3] },
  { terms: ["versuch"], law: "StGB", jurisdiction: "at", sections: [15] },
  { terms: ["rücktritt vom versuch"], law: "StGB", jurisdiction: "at", sections: [16] },
  { terms: ["täterschaft"], law: "StGB", jurisdiction: "at", sections: [12] },
  { terms: ["beihilfe"], law: "StGB", jurisdiction: "at", sections: [12] },
  { terms: ["anstiftung"], law: "StGB", jurisdiction: "at", sections: [12] },
  { terms: ["freiheitsstrafe"], law: "StGB", jurisdiction: "at", sections: [17] },
  { terms: ["geldstrafe"], law: "StGB", jurisdiction: "at", sections: [18] },
  // AT ZPO
  { terms: ["gerichtsstand", "zuständigkeit"], law: "ZPO", jurisdiction: "at", sections: [27, 28] },
  { terms: ["sachliche zuständigkeit"], law: "ZPO", jurisdiction: "at", sections: [8, 9] },
  { terms: ["klage", "klageschrift", "klageerhebung"], law: "ZPO", jurisdiction: "at", sections: [236, 237] },
  { terms: ["widerklage"], law: "ZPO", jurisdiction: "at", sections: [242] },
  { terms: ["streitwert", "streitgegenstand"], law: "ZPO", jurisdiction: "at", sections: [54] },
  { terms: ["beweis", "beweisaufnahme", "beweislast"], law: "ZPO", jurisdiction: "at", sections: [266, 276] },
  { terms: ["versäumnisurteil"], law: "ZPO", jurisdiction: "at", sections: [416, 417] },
  { terms: ["einstweilige verfügung", "einstweiliger rechtsschutz"], law: "ZPO", jurisdiction: "at", sections: [381, 382] },
  { terms: ["arrest", "dinglicher arrest"], law: "ZPO", jurisdiction: "at", sections: [377] },
  { terms: ["zwangsvollstreckung", "vollstreckung"], law: "ZPO", jurisdiction: "at", sections: [309, 310] },
  { terms: ["berufung", "berufungsfrist"], law: "ZPO", jurisdiction: "at", sections: [497, 502] },
  { terms: ["revision"], law: "ZPO", jurisdiction: "at", sections: [502, 505] },
  { terms: ["beschwerde", "sofortige beschwerde"], law: "ZPO", jurisdiction: "at", sections: [534, 535] },
  { terms: ["prozesskosten", "kosten"], law: "ZPO", jurisdiction: "at", sections: [274, 275] },
  { terms: ["prozesskostenhilfe"], law: "ZPO", jurisdiction: "at", sections: [63, 64] },
  { terms: ["zustellung"], law: "ZPO", jurisdiction: "at", sections: [110, 111] },
  { terms: ["notfrist", "fristsetzung"], law: "ZPO", jurisdiction: "at", sections: [122, 123] },
  { terms: ["wiedereinsetzung in den vorigen stand"], law: "ZPO", jurisdiction: "at", sections: [146, 147] },
  { terms: ["mahnverfahren", "mahnbescheid"], law: "ZPO", jurisdiction: "at", sections: [244, 245] },
  { terms: ["prozessfähigkeit"], law: "ZPO", jurisdiction: "at", sections: [41] },
  // AT StPO
  { terms: ["ermittlungsverfahren", "ermittlungen"], law: "StPO", jurisdiction: "at", sections: [44] },
  { terms: ["staatsanwaltschaft", "staatsanwalt"], law: "StPO", jurisdiction: "at", sections: [25] },
  { terms: ["untersuchungshaft", "haftbefehl"], law: "StPO", jurisdiction: "at", sections: [180, 181] },
  { terms: ["vernehmung"], law: "StPO", jurisdiction: "at", sections: [50, 51] },
  { terms: ["durchsuchung", "durchsuchungsbeschluss"], law: "StPO", jurisdiction: "at", sections: [116, 117] },
  { terms: ["beschlagnahme", "sicherstellung"], law: "StPO", jurisdiction: "at", sections: [110, 111] },
  { terms: ["akteneinsicht"], law: "StPO", jurisdiction: "at", sections: [49] },
  { terms: ["pflichtverteidiger"], law: "StPO", jurisdiction: "at", sections: [42, 43] },
  { terms: ["festnahme", "verhaftung"], law: "StPO", jurisdiction: "at", sections: [172, 173] },
  { terms: ["körperliche untersuchung", "blutprobe"], law: "StPO", jurisdiction: "at", sections: [126, 127] },
  // AT UGB
  { terms: ["kaufmann", "kaufmannseigenschaft", "unternehmer"], law: "UGB", jurisdiction: "at", sections: [1, 2] },
  { terms: ["handelsregister", "firmenbuch"], law: "UGB", jurisdiction: "at", sections: [8, 10] },
  { terms: ["firma", "firmenname"], law: "UGB", jurisdiction: "at", sections: [17, 18] },
  { terms: ["prokura"], law: "UGB", jurisdiction: "at", sections: [49, 50] },
  { terms: ["handlungsvollmacht"], law: "UGB", jurisdiction: "at", sections: [55] },
  { terms: ["offene handelsgesellschaft", "og"], law: "UGB", jurisdiction: "at", sections: [105, 106] },
  { terms: ["kommanditgesellschaft", "kg"], law: "UGB", jurisdiction: "at", sections: [161, 162] },
  { terms: ["stille gesellschaft"], law: "UGB", jurisdiction: "at", sections: [188, 189] },
  // AT BAO
  { terms: ["betriebstätte"], law: "BAO", jurisdiction: "at", sections: [27] },
  { terms: ["wohnsitz", "wohnort"], law: "BAO", jurisdiction: "at", sections: [26] },
  { terms: ["steuergeheimnis"], law: "BAO", jurisdiction: "at", sections: [45] },
  { terms: ["festsetzungsverjährung", "festsetzungsfrist"], law: "BAO", jurisdiction: "at", sections: [204, 205] },
  { terms: ["einspruch"], law: "BAO", jurisdiction: "at", sections: [244, 245] },
  { terms: ["bescheid", "steuerbescheid"], law: "BAO", jurisdiction: "at", sections: [90, 91] },
  { terms: ["verwaltungsakt"], law: "BAO", jurisdiction: "at", sections: [68, 69] },
  { terms: ["frist", "fristsetzung"], law: "BAO", jurisdiction: "at", sections: [78, 79] },
  { terms: ["wiedereinsetzung in den vorigen stand"], law: "BAO", jurisdiction: "at", sections: [80] },
  { terms: ["zwangsvollstreckung"], law: "BAO", jurisdiction: "at", sections: [229, 230] },
  // AT AVG
  { terms: ["verwaltungsverfahren", "verwaltungsgericht"], law: "AVG", jurisdiction: "at", sections: [1, 2] },
  { terms: ["bescheid"], law: "AVG", jurisdiction: "at", sections: [66, 67] },
  { terms: ["frist", "fristsetzung"], law: "AVG", jurisdiction: "at", sections: [73, 74] },
  { terms: ["wiedereinsetzung in den vorigen stand"], law: "AVG", jurisdiction: "at", sections: [71] },
  { terms: ["parteienstellung", "partei"], law: "AVG", jurisdiction: "at", sections: [8, 9] },
  { terms: ["rechtsschutz"], law: "AVG", jurisdiction: "at", sections: [67, 68] },
  // AT GewO
  { terms: ["gewerbe", "gewerbeberechtigung", "gewerbeausübung"], law: "GewO", jurisdiction: "at", sections: [1, 2] },
  { terms: ["gewerbeanmeldung", "gewerbeantrag"], law: "GewO", jurisdiction: "at", sections: [64, 65] },
  { terms: ["gewerbeentzug", "gewerbeuntersagung"], law: "GewO", jurisdiction: "at", sections: [87] },
  // AT ASVG
  { terms: ["krankenversicherung"], law: "ASVG", jurisdiction: "at", sections: [116, 117] },
  { terms: ["sozialversicherung"], law: "ASVG", jurisdiction: "at", sections: [1, 2] },
  { terms: ["pension", "pensionsversicherung"], law: "ASVG", jurisdiction: "at", sections: [246, 247] },
  { terms: ["mutterschutz", "karenz"], law: "ASVG", jurisdiction: "at", sections: [131, 132] },
  { terms: ["entlassung", "arbeitnehmer"], law: "ASVG", jurisdiction: "at", sections: [116] },
  // AT EheG
  { terms: ["scheidung", "ehescheidung"], law: "EheG", jurisdiction: "at", sections: [43, 44] },
  { terms: ["ehe", "ehegatt", "ehevertrag"], law: "EheG", jurisdiction: "at", sections: [1, 2] },
  { terms: ["unterhalt", "unterhaltspflicht"], law: "EheG", jurisdiction: "at", sections: [66, 67] },
  { terms: ["ehewohnung"], law: "EheG", jurisdiction: "at", sections: [78] },
  // AT KartG
  { terms: ["wettbewerb", "kartell"], law: "KartG", jurisdiction: "at", sections: [1, 7] },
  // AT AsylG
  { terms: ["asyl", "asylverfahren"], law: "AsylG", jurisdiction: "at", sections: [1, 2] },
  // AT JN
  { terms: ["jurisdiktion", "gerichtsorganisation"], law: "JN", jurisdiction: "at", sections: [1, 2] },
  // AT DSG
  { terms: ["datenschutz", "datenverarbeitung"], law: "DSG", jurisdiction: "at", sections: [1, 2] },
  // AT VStG
  { terms: ["verwaltungsstrafe", "verwaltungsübertretung"], law: "VStG", jurisdiction: "at", sections: [1, 2] },
];

const ALL_CONCEPTS = [...DE, ...AT];

/**
 * Extract §-numbers mentioned in a query string.
 * Matches patterns like "§ 138", "§138", "Paragraf 138", "§§ 138, 139".
 */
export function extractSectionNumbers(query: string): number[] {
  if (!query) return [];
  const matches = query.matchAll(/§+\s*(\d+[a-z]?)/gi);
  const nums = new Set<number>();
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n < 10000) nums.add(n);
  }
  return Array.from(nums);
}

/**
 * Find concept mappings that match the query.
 * Returns entries whose terms appear in the query (case-insensitive, word boundary).
 */
export function findConceptMappings(
  query: string,
  jurisdiction?: "de" | "at" | "ch"
): ConceptMapping[] {
  if (!query || query.length < 3) return [];
  const lowerQuery = query.toLowerCase();
  const results: ConceptMapping[] = [];
  for (const c of ALL_CONCEPTS) {
    if (jurisdiction && c.jurisdiction !== jurisdiction) continue;
    for (const term of c.terms) {
      if (lowerQuery.includes(term.toLowerCase())) {
        results.push(c);
        break;
      }
    }
  }
  return results;
}

/**
 * Expand a query with §-number hints from the concept map.
 * Appends "§ <number> <Law>" for each matched concept.
 *
 * Example:
 *   "Wer haftet bei Sittenwidrigkeit?"
 *   → "Wer haftet bei Sittenwidrigkeit? § 138 BGB"
 */
export function expandConceptQuery(
  query: string,
  jurisdiction?: "de" | "at"
): string {
  if (!query || query.length < 3) return query;
  const mappings = findConceptMappings(query, jurisdiction);
  if (mappings.length === 0) return query;

  const additions = new Set<string>();
  for (const m of mappings) {
    for (const s of m.sections) {
      additions.add(`§ ${s} ${m.law}`);
    }
  }
  if (additions.size === 0) return query;

  const terms = Array.from(additions).slice(0, 8);
  return `${query} ${terms.join(" ")}`;
}
