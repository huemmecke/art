# GEO Status App

Internes Statusboard für SEO & Generative Engine Optimization (GEO).

## Daten = Flatfiles

| Pfad | Inhalt |
|---|---|
| `config/entity.json` | Person/Marke, sameAs, Answer Capsule |
| `config/prompts.json` | Prompt-Set für Citation-Checks |
| `config/foundation.json` | Checkliste technische Bausteine |
| `results/YYYY-MM-DD.json` | Historischer Check |
| `results/latest.json` | Aktueller Stand (von der App gelesen) |

## App öffnen

- Lokal: `npx serve .` im Repo-Root, dann `/geo/`
- Live (nach Deploy): `https://www.huemmecke.art/geo/`

`file://` funktioniert nicht zuverlässig, weil die App JSON per `fetch` lädt.

## Citation-Check aktualisieren

1. Prompts aus `config/prompts.json` in ChatGPT, Perplexity, AI Overviews, Claude prüfen
2. Neues File `results/YYYY-MM-DD.json` anlegen
3. Inhalt nach `results/latest.json` kopieren (oder ersetzen)
4. Optional: Foundation-Status in `config/foundation.json` anpassen

Cursor-Prompt:

> Lies `geo/config/prompts.json`, aktualisiere `geo/results/latest.json` mit Citation-Results und setze `nextActions`.
