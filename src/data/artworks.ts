export const FRAMED_BASE = '/uploads/huemmecke-art/inbox/framed/';

export interface HeroSlide {
  src: string;
  alt: string;
  caption: string;
}

// Hero slider on the homepage — cycles through every framed piece.
export const FRAMED: HeroSlide[] = [
  { file: 'MH_artcards-scan_2024_Vol01_harbour01_framed.png', alt: 'Gerahmte Zeichnung – Harbour 01', caption: 'Harbour 01 — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol01_harbour02_framed.png', alt: 'Gerahmte Zeichnung – Harbour 02', caption: 'Harbour 02 — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol01_shipyard01_framed.png', alt: 'Gerahmte Zeichnung – Shipyard 01', caption: 'Shipyard 01 — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol02_mindofwool_framed.png', alt: 'Gerahmte Zeichnung – Mind of Wool', caption: 'Mind of Wool — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol02_woolhead01_framed.png', alt: 'Gerahmte Zeichnung – Woolhead 01', caption: 'Woolhead 01 — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol02_woolpack02_framed.png', alt: 'Gerahmte Zeichnung – Woolpack 02', caption: 'Woolpack 02 — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol02_woolwalk01_framed.png', alt: 'Gerahmte Zeichnung – Woolwalk 01', caption: 'Woolwalk 01 — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol03_arrowmind_framed.png', alt: 'Gerahmte Zeichnung – Arrowmind', caption: 'Arrowmind — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol03_butterflies_framed.png', alt: 'Gerahmte Zeichnung – Butterflies', caption: 'Butterflies — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol03_confusion_framed.png', alt: 'Gerahmte Zeichnung – Confusion', caption: 'Confusion — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol03_elegance_framed.png', alt: 'Gerahmte Zeichnung – Elegance', caption: 'Elegance — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol03_pipemiracle_framed.png', alt: 'Gerahmte Zeichnung – Pipemiracle', caption: 'Pipemiracle — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol03_silentfish_framed.png', alt: 'Gerahmte Zeichnung – Silentfish', caption: 'Silentfish — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol03_spiralmind_framed.png', alt: 'Gerahmte Zeichnung – Spiralmind', caption: 'Spiralmind — Kraftkarton, gerahmt' },
  { file: 'MH_artcards-scan_2024_Vol07_smoking-wool_framed.png', alt: 'Gerahmte Zeichnung – Smoking Wool', caption: 'Smoking Wool — Kraftkarton, gerahmt' },
  { file: 'MH_print_fall01_framed.png', alt: 'Gerahmte Zeichnung – Fall 01', caption: 'Fall 01 — Print, gerahmt' },
  { file: 'MH_print_red-warrior01_framed.png', alt: 'Gerahmte Zeichnung – Red Warrior 01', caption: 'Red Warrior 01 — Print, gerahmt' },
  { file: 'MH_print_red-warrior03_framed.png', alt: 'Gerahmte Zeichnung – Red Warrior 03', caption: 'Red Warrior 03 — Print, gerahmt' },
].map((entry) => ({ src: FRAMED_BASE + entry.file, alt: entry.alt, caption: entry.caption }));

export interface GalleryImage {
  src: string;
  alt: string;
  framed?: boolean;
}

// "Rote Serie" gallery on /arbeiten
export const ROTE_SERIE: GalleryImage[] = [
  { file: 'MH_print_red-warrior01_framed.png', alt: 'Rote Serie – Red Warrior 01 (gerahmt)' },
  { file: 'MH_print_red-warrior03_framed.png', alt: 'Rote Serie – Red Warrior 03 (gerahmt)' },
  { file: 'MH_print_fall01_framed.png', alt: 'Rote Serie – Fall 01 (gerahmt)' },
].map((entry) => ({ src: FRAMED_BASE + entry.file, alt: entry.alt }));

// "Kraftkarton" carousel on /arbeiten
const KRAFTKARTON_FILES: { file: string; title: string }[] = [
  { file: 'MH_artcards-scan_2024_Vol01_harbour01_framed.png', title: 'Harbour 01' },
  { file: 'MH_artcards-scan_2024_Vol01_harbour02_framed.png', title: 'Harbour 02' },
  { file: 'MH_artcards-scan_2024_Vol01_shipyard01_framed.png', title: 'Shipyard 01' },
  { file: 'MH_artcards-scan_2024_Vol02_mindofwool_framed.png', title: 'Mind of Wool' },
  { file: 'MH_artcards-scan_2024_Vol02_woolhead01_framed.png', title: 'Woolhead 01' },
  { file: 'MH_artcards-scan_2024_Vol02_woolpack02_framed.png', title: 'Woolpack 02' },
  { file: 'MH_artcards-scan_2024_Vol02_woolwalk01_framed.png', title: 'Woolwalk 01' },
  { file: 'MH_artcards-scan_2024_Vol03_arrowmind_framed.png', title: 'Arrowmind' },
  { file: 'MH_artcards-scan_2024_Vol03_butterflies_framed.png', title: 'Butterflies' },
  { file: 'MH_artcards-scan_2024_Vol03_confusion_framed.png', title: 'Confusion' },
  { file: 'MH_artcards-scan_2024_Vol03_elegance_framed.png', title: 'Elegance' },
  { file: 'MH_artcards-scan_2024_Vol03_pipemiracle_framed.png', title: 'Pipemiracle' },
  { file: 'MH_artcards-scan_2024_Vol03_silentfish_framed.png', title: 'Silentfish' },
  { file: 'MH_artcards-scan_2024_Vol03_spiralmind_framed.png', title: 'Spiralmind' },
  { file: 'MH_artcards-scan_2024_Vol07_smoking-wool_framed.png', title: 'Smoking Wool' },
];

export const KRAFTKARTON: GalleryImage[] = KRAFTKARTON_FILES.map((entry) => ({
  src: FRAMED_BASE + entry.file,
  alt: 'Kraftkarton – ' + entry.title + ' (gerahmt)',
  framed: true,
}));
