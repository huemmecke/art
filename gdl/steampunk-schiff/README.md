# Steampunk-Schiff — ArchiCAD GDL

3D-Library-Objekt nach der technischen Zeichnung (Left / Right Side, Front, Rear View).

## Dateien

| Datei | ArchiCAD-Tab |
|-------|----------------|
| `SteampunkSchiff_Parameter.gdl` | Parameter Script |
| `SteampunkSchiff_Master.gdl` | Master Script |
| `SteampunkSchiff_3D.gdl` | 3D Script |
| `SteampunkSchiff_2D.gdl` | 2D Script |
| `referenz-zeichnung.jpg` | Vorlage (Orthogonale) |
| `PARAMETER.md` | Parameter-Anlage |

## Import in ArchiCAD

1. **File → Libraries and Objects → Object** (neues Objekt) bzw. GDL-Editor öffnen.
2. Parameter laut `PARAMETER.md` anlegen (`A=4.20`, `B=2.40`, `ZZYZX=3.20`).
3. Inhalte der vier `.gdl`-Dateien in die entsprechenden Script-Tabs kopieren.
4. **Check Script** / 3D-Vorschau prüfen, speichern als `SteampunkSchiff.gsm` in eine geladene Library.

## Koordinatensystem & Maßstab

- Ursprung: Deckmitte  
- **+X** Bug · **−X** Heck · **+Y** Backbord · **Z** oben  
- Figur auf der Zeichnung ≈ **1,70 m** → Länge ≈ **4,20 m**, Breite ≈ **2,40 m**, Höhe ≈ **3,20 m**

## Modellierte Bauteile

- Schüsselrumpf (`REVOLVE`) mit überlappenden Panzerplatten (Positionen **15** / **6**)
- Kielflosse, Seitenstabilisatoren, Schubdüsen
- Kabine mit Front-/Seitenscheiben, Hecktür, Lamellen
- Dach: Radar, Schornstein, Antennen
- Mast mit Wimpel und Stagen
- Megaphon am Bug, Bug- und Heck-Gasflaschen
- Reling, Anker, Steuerrad
- Maßstabsfigur (ab Detailstufe Mittel)
- Nietreihen (Detailstufe Hoch)

## Detailstufe

- **Einfach** — Rumpf, Kabine, Mast, grobe Anbauten  
- **Mittel** — + Figur, mehr Ausrüstung  
- **Hoch** — + Nietendetail
