# Publishing Astro Websites - Claude Code Agentic Skill

A comprehensive Claude Code skill for building and deploying static websites with the Astro framework.

## Overview

This skill provides guidance for Astro static site generation (SSG), covering:

- **Content Collections** - Legacy patterns, Content Layer API (Astro 5.0), Custom Loaders
- **Syntax Highlighting** - Shiki configuration, Transformers, Expressive Code
- **Diagram Integration** - Mermaid, PlantUML, dark mode theming strategies
- **Client-Side Search** - Pagefind (granular controls, weighting), Fuse.js comparison
- **Versioned Documentation** - Starlight framework, multi-version patterns
- **Internationalization** - i18n routing, fallback logic for missing translations
- **Common Patterns** - Pagination, tag archives, RSS feeds, forms, JSON-LD, dark mode
- **Performance** - Prefetching, Critical CSS (astro-critters), partial hydration
- **Testing** - Vitest component testing, Playwright E2E, link checking
- **Deployment** - Firebase, Netlify, Vercel, GitHub Pages, GCS + Cloud CDN

## Installation

Clone this repository into your Claude Code skills directory:

```bash
cd ~/.claude/skills
git clone https://github.com/SpillwaveSolutions/publishing-astro-websites-agentic-skill.git
```

Or add as a Git submodule to your existing skills:

```bash
git submodule add https://github.com/SpillwaveSolutions/publishing-astro-websites-agentic-skill.git
```

## Usage

Once installed, Claude Code will automatically use this skill when you ask about:

- "Create an Astro site"
- "Deploy Astro to Firebase"
- "Set up content collections"
- "Add Mermaid diagrams to Astro"
- "Configure Astro i18n"
- "Build a static blog"
- "Astro markdown setup"

## Structure

```
publishing-astro-websites-agentic-skill/
├── .claude-plugin/
│   └── marketplace.json
├── publishing-astro-websites/
│   ├── SKILL.md
│   └── references/
│       ├── deployment-platforms.md
│       └── markdown-deep-dive.md
├── .gitignore
└── README.md
```

## Requirements

- Claude Code CLI
- Node.js 18+ (for Astro projects)

## License

MIT

## Author

Richard Hightower - [SpillwaveSolutions](https://github.com/SpillwaveSolutions)
