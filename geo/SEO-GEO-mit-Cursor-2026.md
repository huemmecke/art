# SEO & GEO mit Cursor — Leitfaden 2026+

Kurznotiz für Mac & iPad. Stand: Juli 2026.

---

## Kernidee

SEO und GEO sind 2026 kein Keyword-Spiel mehr, sondern:

**Entity + extractable Answers + Crawl-Zugang**

| | Klassisches SEO | GEO (AI Search) |
|---|---|---|
| Ziel | Ranking / Klick | **Zitation** in ChatGPT, Perplexity, AI Overviews, Gemini |
| Einheit | Seite | **Passage** (selbstständige Antwortblöcke) |
| Autorität | Backlinks | **Mentions + Entity-Klarheit** (auch ohne Link) |
| KPI | Position / Traffic | **Citation Rate / Share of Model** pro Engine |

GEO ersetzt SEO nicht — es baut darauf auf. Ohne Crawlbarkeit und Indexierung gibt es keine Zitation.

---

## Der zeitgemäße Stack

### 1. Technische Abrufbarkeit
- Inhalt im HTML (SSR/static), nicht erst nach JavaScript
- AI-Crawler erlauben: `GPTBot`, `ClaudeBot`, `Google-Extended`, `PerplexityBot` u. a.
- Schnell, HTTPS, mobile-freundlich

### 2. Answer-first Content
- Jede wichtige H2 als Frage oder klare Aussage
- Die ersten ~40–60 Wörter = vollständige, zitierfähige Antwort
- Fakten, Zahlen, Quellen, klare Entity-Namen

### 3. Structured Data + Entity
- Schema: `Organization` / `Person` / `CreativeWork` / `FAQPage`
- `sameAs` zu Wikipedia, Social, Verzeichnissen (z. B. Saatchi Art)
- Konsistente Namensschreibung überall

### 4. `llms.txt` + klare Markenbeschreibung
- Kurze, maschinenlesbare Beschreibung der Marke/Person und der wichtigsten URLs
- Analog zu `robots.txt`, aber für LLMs

### 5. Off-site Entity Density
- Erwähnungen auf Plattformen, die Modelle oft zitieren
- Fachmedien, Wikipedia, Reddit, YouTube, Verzeichnisse
- Nicht nur Backlinks zählen

### 6. Messen pro Engine
- Festes Prompt-Set monatlich gegen ChatGPT, Perplexity, AI Overviews, Claude
- Citation-Rate tracken
- Quellen rotieren stark: ein Google-Rank ≠ Zitation überall

---

## Workflow mit Cursor (Agentenmodus)

Statt: „Schreib mir SEO-Text.“

1. **Agent mit klarem Briefing**  
   z. B. „Audit SEO+GEO dieser Site; priorisiere extractable answers, Schema, Crawler-Zugang.“

2. **Repo als Single Source of Truth**  
   Meta, JSON-LD, `robots.txt`, `sitemap.xml`, `llms.txt`, Content-Struktur im Code.

3. **Wiederholbare Checks**  
   Agent prüft: fehlende Canonicals, leere Titles, JS-only Content, inkonsistente Entity-Namen.

4. **Seitenweise Capsules**  
   Agent schreibt/umbaut Abschnitte answer-first, ohne Marketing-Floskeln.

5. **Citation-Monitoring**  
   Separates Prompt-Set (Notion/Sheet) + periodischer Agent-Lauf: „Werde ich bei Prompt X genannt?“

Cursor ist der **Umsetzer und Auditor**, nicht die Ranking-Maschine.  
Sichtbarkeit entsteht durch Inhalt, Struktur und Entity — Cursor macht das schneller und konsistenter.

---

## Checkliste: Was in der Site liegen sollte

- [ ] `<title>` + Meta-Description (einzeln pro Seite)
- [ ] Canonical-URL
- [ ] Open Graph / Social Meta
- [ ] `robots.txt` (AI-Crawler bewusst erlauben oder steuern)
- [ ] `sitemap.xml`
- [ ] `llms.txt`
- [ ] JSON-LD: Person / Organization / CreativeWork / FAQ wo sinnvoll
- [ ] Answer-first Abschnitte auf den wichtigsten Seiten
- [ ] Einheitliche Schreibweise von Name, Ort, Medium, Projekten
- [ ] Monatliches Prompt-Set für Citation-Checks

---

## Beispiel: Künstler-Site (Martin Hümmecke)

Hebel besonders groß bei klarem Personennamen:

1. **Person-Entity** — JSON-LD `Person` mit `sameAs` (Instagram, TikTok, Saatchi Art, …)
2. **Werk-Schema** — `CreativeWork` / `VisualArtwork` für Serien und Arbeiten
3. **Answer-first Biografie/Praxis** — z. B. „Wer ist Martin Hümmecke?“, „Wie entstehen die Zeichnungen?“
4. **`llms.txt`** — kurze Entity-Beschreibung + Linkliste zu Arbeiten und Atelier

Typische Lücken, wenn die SEO/GEO-Schicht noch fehlt:
- keine Meta-Description
- kein Canonical
- kein JSON-LD
- kein `robots` / `sitemap` / `llms.txt`

---

## Nächster praktischer Schritt

Im Cursor-Agenten:

> Setze SEO+GEO-Basis um: Meta, Canonical, JSON-LD Person/CreativeWork, robots.txt, sitemap.xml, llms.txt, und strukturiere Über-mich / Praxis answer-first.

Dann am Mac/iPad weiterarbeiten — Datei liegt idealerweise im Repo oder in iCloud Drive.

---

*Erstellt als Arbeitsnotiz aus dem Cursor Cloud Agent. Zum Speichern in iCloud: Datei öffnen → Teilen → „In Dateien sichern“ → iCloud Drive.*
