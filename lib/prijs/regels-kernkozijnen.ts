// GEGENEREERD door scripts/genereer-prijsregels.mjs uit configurator/index.html. Niet met de hand aanpassen.
// Dit zijn de prijsregels van KernKozijnen. Later komen ze per bedrijf uit de database.
import type { Prijsregels } from "./types";

export const REGELS_KERNKOZIJNEN: Prijsregels = {
  "producten": {
    "raam": {
      "label": "Raamkozijn",
      "base": 2100,
      "stdM2": 1.2,
      "perM2": 385,
      "kind": "window",
      "priceMax": 3000,
      "wMin": 500,
      "wMax": 3000,
      "hMin": 500,
      "hMax": 2400,
      "wDef": 1000,
      "hDef": 1200,
      "indeling": "Raamindeling",
      "variants": [
        {
          "key": "draaikiep",
          "label": "Draai-kiep",
          "mult": 1,
          "cols": [
            "tiltturn"
          ]
        },
        {
          "key": "vast",
          "label": "Vast glas",
          "mult": 0.8,
          "cols": [
            "fixed"
          ]
        },
        {
          "key": "draai",
          "label": "Draairaam",
          "mult": 0.96,
          "cols": [
            "turnR"
          ]
        },
        {
          "key": "valraam",
          "label": "Valraam",
          "mult": 0.92,
          "cols": [
            "tilt"
          ]
        },
        {
          "key": "draai_vast",
          "label": "Draai + vast",
          "mult": 1.5,
          "cols": [
            "turnL",
            "fixed"
          ]
        },
        {
          "key": "vast_dk",
          "label": "Vast + draai-kiep",
          "mult": 1.55,
          "cols": [
            "fixed",
            "tiltturn"
          ]
        },
        {
          "key": "stolp",
          "label": "Stolpraam",
          "mult": 1.55,
          "cols": [
            "turnR",
            "turnL"
          ],
          "stolp": true
        },
        {
          "key": "driedelig",
          "label": "3-delig",
          "mult": 2.15,
          "cols": [
            "fixed",
            "tiltturn",
            "fixed"
          ]
        },
        {
          "key": "vierdelig",
          "label": "4-delig",
          "mult": 2.7,
          "cols": [
            "fixed",
            "tiltturn",
            "tiltturn",
            "fixed"
          ]
        },
        {
          "key": "bovenlicht",
          "label": "Met bovenlicht",
          "mult": 1.3,
          "cols": [
            "tiltturn"
          ],
          "topLight": true
        },
        {
          "key": "draaikiep2",
          "label": "Draai-kiep (2×)",
          "mult": 1.6,
          "cols": [
            "tiltturn",
            "tiltturn"
          ]
        },
        {
          "key": "valraam_vast",
          "label": "Valraam (L) + vast",
          "mult": 1.47,
          "cols": [
            "tilt",
            "fixed"
          ]
        },
        {
          "key": "vast_valraam",
          "label": "Valraam (R) + vast",
          "mult": 1.47,
          "cols": [
            "fixed",
            "tilt"
          ]
        },
        {
          "key": "vast2",
          "label": "Vast glas (2 vakken)",
          "mult": 1.35,
          "cols": [
            "fixed",
            "fixed"
          ]
        },
        {
          "key": "vast3",
          "label": "Vast glas (3 vakken)",
          "mult": 1.9,
          "cols": [
            "fixed",
            "fixed",
            "fixed"
          ]
        },
        {
          "key": "dk_lr_vast",
          "label": "Draai-kiep (L&R) + vast",
          "mult": 2.15,
          "cols": [
            "tiltturn",
            "fixed",
            "tiltturn"
          ]
        },
        {
          "key": "dk_l_vast3",
          "label": "Draai-kiep (L) + 2× vast",
          "mult": 2.1,
          "cols": [
            "tiltturn",
            "fixed",
            "fixed"
          ]
        },
        {
          "key": "dk_l_boven",
          "label": "Draai-kiep (L) + bovenlicht + vast",
          "mult": 2.4,
          "cols": [
            "tiltturn",
            "fixed",
            "fixed"
          ],
          "topLight": true
        },
        {
          "key": "dk_b",
          "label": "Draai-kiep (B) + borstwering",
          "mult": 1.25,
          "cols": [
            "tiltturn"
          ],
          "bottomLight": true
        },
        {
          "key": "vast_stapel",
          "label": "Vast glas gestapeld",
          "mult": 1.35,
          "stack": [
            "fixed",
            "fixed"
          ]
        },
        {
          "key": "vast6",
          "label": "Vast glas (6 vakken)",
          "mult": 3.55,
          "grid": {
            "r": 2,
            "c": 3
          }
        }
      ]
    },
    "voordeur": {
      "label": "Voordeur",
      "base": 4700,
      "stdM2": 2.07,
      "perM2": 510,
      "kind": "door",
      "priceMax": 6400,
      "wMin": 800,
      "wMax": 2800,
      "hMin": 2000,
      "hMax": 2400,
      "wDef": 1000,
      "hDef": 2300,
      "indeling": "Deurmodel",
      "variants": [
        {
          "key": "dicht",
          "label": "Dicht paneel",
          "mult": 1,
          "blade": "panel"
        },
        {
          "key": "glasstrook",
          "label": "Met glasstrook",
          "mult": 1.1,
          "blade": "glassStrip"
        },
        {
          "key": "bovenlicht",
          "label": "Met bovenlicht",
          "mult": 1.2,
          "blade": "panel",
          "top": true
        },
        {
          "key": "zijlicht",
          "label": "Met zijlicht",
          "mult": 1.35,
          "blade": "glassStrip",
          "sideL": true
        },
        {
          "key": "zijboven",
          "label": "Zijlicht + bovenlicht",
          "mult": 1.6,
          "blade": "glassStrip",
          "sideL": true,
          "top": true
        },
        {
          "key": "tweezijlicht",
          "label": "2 zijlichten",
          "mult": 1.85,
          "blade": "glassStrip",
          "sideL": true,
          "sideR": true
        },
        {
          "key": "zijborst_r",
          "label": "Zijlicht + borstwering (R)",
          "mult": 1.4,
          "blade": "glassStrip",
          "nR": 1,
          "sideBorst": true
        },
        {
          "key": "zijborst_l",
          "label": "Zijlicht + borstwering (L)",
          "mult": 1.4,
          "blade": "glassStrip",
          "nL": 1,
          "sideBorst": true
        },
        {
          "key": "dubbelzij_r",
          "label": "Dubbel zijlicht (R)",
          "mult": 1.7,
          "blade": "glassStrip",
          "nR": 2
        },
        {
          "key": "dubbelzij_l",
          "label": "Dubbel zijlicht (L)",
          "mult": 1.7,
          "blade": "glassStrip",
          "nL": 2
        },
        {
          "key": "tweezij_boven",
          "label": "2 zijlichten + bovenlicht",
          "mult": 2.05,
          "blade": "glassStrip",
          "sideL": true,
          "sideR": true,
          "top": true
        }
      ]
    },
    "achterdeur": {
      "label": "Achterdeur",
      "base": 3800,
      "stdM2": 1.89,
      "perM2": 475,
      "kind": "door",
      "priceMax": 6400,
      "wMin": 800,
      "wMax": 2800,
      "hMin": 2000,
      "hMax": 2300,
      "wDef": 900,
      "hDef": 2100,
      "indeling": "Deurmodel",
      "variants": [
        {
          "key": "half",
          "label": "Half glas",
          "mult": 1,
          "blade": "halfglass"
        },
        {
          "key": "vol",
          "label": "Vol glas",
          "mult": 1.1,
          "blade": "fullglass"
        },
        {
          "key": "bovenlicht",
          "label": "Met bovenlicht",
          "mult": 1.18,
          "blade": "halfglass",
          "top": true
        },
        {
          "key": "zijlicht",
          "label": "Met zijlicht (L)",
          "mult": 1.3,
          "blade": "halfglass",
          "sideL": true
        },
        {
          "key": "zijlicht_r",
          "label": "Met zijlicht (R)",
          "mult": 1.3,
          "blade": "halfglass",
          "nR": 1
        },
        {
          "key": "zijborst_r",
          "label": "Zijlicht + borstwering (R)",
          "mult": 1.35,
          "blade": "halfglass",
          "nR": 1,
          "sideBorst": true
        },
        {
          "key": "zijborst_l",
          "label": "Zijlicht + borstwering (L)",
          "mult": 1.35,
          "blade": "halfglass",
          "nL": 1,
          "sideBorst": true
        },
        {
          "key": "boven_zij",
          "label": "Bovenlicht + zijlicht",
          "mult": 1.48,
          "blade": "halfglass",
          "sideL": true,
          "top": true
        }
      ]
    },
    "schuifpui": {
      "label": "Schuifpui",
      "base": 6000,
      "stdM2": 6.9,
      "perM2": 440,
      "kind": "slider",
      "priceMax": 10600,
      "wMin": 2000,
      "wMax": 6500,
      "hMin": 2000,
      "hMax": 2700,
      "wDef": 3000,
      "hDef": 2300,
      "indeling": "Aantal delen",
      "variants": [
        {
          "key": "2delig",
          "label": "2-delig",
          "mult": 1,
          "panels": 2
        },
        {
          "key": "3delig",
          "label": "3-delig",
          "mult": 1.45,
          "panels": 3
        },
        {
          "key": "4delig",
          "label": "4-delig",
          "mult": 1.85,
          "panels": 4
        },
        {
          "key": "hef",
          "label": "Hefschuif premium",
          "mult": 1.35,
          "panels": 2,
          "hef": true
        }
      ]
    },
    "tuindeuren": {
      "label": "Tuindeuren",
      "base": 6400,
      "stdM2": 3.5,
      "perM2": 510,
      "kind": "french",
      "priceMax": 10600,
      "wMin": 1200,
      "wMax": 3200,
      "hMin": 2000,
      "hMax": 2400,
      "wDef": 1600,
      "hDef": 2200,
      "indeling": "Uitvoering",
      "variants": [
        {
          "key": "dubbel",
          "label": "Dubbele deuren",
          "mult": 1,
          "leaves": 2
        },
        {
          "key": "dubbel_borst",
          "label": "Met borstwering",
          "mult": 1.1,
          "leaves": 2,
          "borst": true
        },
        {
          "key": "dubbel_boven",
          "label": "Met bovenlicht",
          "mult": 1.2,
          "leaves": 2,
          "top": true
        },
        {
          "key": "dubbel_boven_borst",
          "label": "Bovenlicht + borstwering",
          "mult": 1.3,
          "leaves": 2,
          "top": true,
          "borst": true
        },
        {
          "key": "dubbel_zij",
          "label": "Met zijlichten",
          "mult": 1.4,
          "leaves": 2,
          "sidelights": true
        },
        {
          "key": "dubbel_zij_borst",
          "label": "Zijlichten + borstwering",
          "mult": 1.5,
          "leaves": 2,
          "sidelights": true,
          "borst": true
        },
        {
          "key": "dubbel_zij_boven",
          "label": "Zijlichten + bovenlicht",
          "mult": 1.6,
          "leaves": 2,
          "sidelights": true,
          "top": true
        },
        {
          "key": "dubbel_vol",
          "label": "Bovenlicht + zijlichten + borstwering",
          "mult": 1.7,
          "leaves": 2,
          "sidelights": true,
          "top": true,
          "borst": true
        }
      ]
    },
    "balkondeur": {
      "label": "Balkondeur",
      "base": 3800,
      "stdM2": 2.3,
      "perM2": 465,
      "kind": "window",
      "priceMax": 6400,
      "wMin": 700,
      "wMax": 3000,
      "hMin": 2000,
      "hMax": 2500,
      "wDef": 1000,
      "hDef": 2300,
      "indeling": "Uitvoering",
      "variants": [
        {
          "key": "enkel",
          "label": "Balkondeur",
          "mult": 1,
          "cols": [
            "tiltturn"
          ],
          "bottomLight": true
        },
        {
          "key": "boven",
          "label": "Met bovenlicht",
          "mult": 1.13,
          "cols": [
            "tiltturn"
          ],
          "topLight": true,
          "bottomLight": true
        },
        {
          "key": "l_vast",
          "label": "(L) + vast glas",
          "mult": 1.28,
          "cols": [
            "tiltturn",
            "fixed"
          ],
          "bottomLight": true
        },
        {
          "key": "r_vast",
          "label": "(R) + vast glas",
          "mult": 1.28,
          "cols": [
            "fixed",
            "tiltturn"
          ],
          "bottomLight": true
        },
        {
          "key": "m_vast",
          "label": "(M) + vast glas",
          "mult": 1.53,
          "cols": [
            "fixed",
            "tiltturn",
            "fixed"
          ],
          "bottomLight": true
        },
        {
          "key": "l_boven",
          "label": "(L) + vast + bovenlicht",
          "mult": 1.41,
          "cols": [
            "tiltturn",
            "fixed"
          ],
          "topLight": true,
          "bottomLight": true
        },
        {
          "key": "r_boven",
          "label": "(R) + vast + bovenlicht",
          "mult": 1.41,
          "cols": [
            "fixed",
            "tiltturn"
          ],
          "topLight": true,
          "bottomLight": true
        },
        {
          "key": "vak1",
          "label": "1 vak (vol glas)",
          "mult": 1,
          "cols": [
            "tiltturn"
          ]
        }
      ]
    }
  },
  "glas": {
    "hrpp": {
      "label": "HR++ glas",
      "mult": 1,
      "isdeLow": 23,
      "isdeHigh": 46
    },
    "triple": {
      "label": "Triple glas",
      "mult": 1.25,
      "isdeLow": 111,
      "isdeHigh": 222
    }
  },
  "kleuren": {
    "wit": {
      "label": "Wit · RAL 9010",
      "mult": 1,
      "frame": "#f3f2ec",
      "stroke": "#d8d7cf"
    },
    "creme": {
      "label": "Crème · RAL 9001",
      "mult": 1.05,
      "frame": "#e6ddc8",
      "stroke": "#ccc3ac"
    },
    "antraciet": {
      "label": "Antraciet · RAL 7016",
      "mult": 1.15,
      "frame": "#383e42",
      "stroke": "#262b2e"
    },
    "zwartgrijs": {
      "label": "Zwart Grijs · RAL 7021",
      "mult": 1.15,
      "frame": "#2b2f31",
      "stroke": "#1a1d1f"
    },
    "staalblauw": {
      "label": "Staalblauw · RAL 5011",
      "mult": 1.18,
      "frame": "#1c3040",
      "stroke": "#11202b"
    },
    "dennengroen": {
      "label": "Dennengroen · RAL 6009",
      "mult": 1.18,
      "frame": "#27352a",
      "stroke": "#1a241d"
    }
  },
  "beslag": {
    "rc2": {
      "label": "RC2 sluitwerk",
      "mult": 1
    },
    "rc3": {
      "label": "RC3 sluitwerk",
      "mult": 1.1
    }
  },
  "binnen": {
    "witglad": {
      "label": "Wit glad",
      "mult": 1
    },
    "cremeglad": {
      "label": "Crème glad",
      "mult": 1
    },
    "structuur": {
      "label": "Houtnerf of kleur",
      "mult": 1.15
    }
  },
  "profielen": {
    "schuco": {
      "label": "Schüco LivIng",
      "mult": 1,
      "levertijd": "6 – 8 weken"
    },
    "aluplast": {
      "label": "Aluplast Ideal 7000 NL",
      "mult": 0.9,
      "levertijd": "3 à 4 weken"
    }
  },
  "vak": {
    "fixed": {
      "label": "Vast glas",
      "kort": "vast glas",
      "f": 0.8
    },
    "tiltturnR": {
      "label": "Draai-kiep — scharnier links",
      "kort": "draai-kiep (scharnier L)",
      "f": 1
    },
    "tiltturn": {
      "label": "Draai-kiep — scharnier rechts",
      "kort": "draai-kiep (scharnier R)",
      "f": 1
    },
    "turnR": {
      "label": "Draairaam — scharnier links",
      "kort": "draairaam (scharnier L)",
      "f": 0.96
    },
    "turnL": {
      "label": "Draairaam — scharnier rechts",
      "kort": "draairaam (scharnier R)",
      "f": 0.96
    },
    "tilt": {
      "label": "Valraam — kiept open",
      "kort": "valraam",
      "f": 0.92
    }
  },
  "vakVolgorde": [
    "fixed",
    "tiltturnR",
    "tiltturn",
    "turnR",
    "turnL",
    "tilt"
  ],
  "vakDemping": 0.8
};
