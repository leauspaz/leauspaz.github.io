# Lexloom

A fast, themeable sentence-based language flashcard app. Built as a cleaner, more feature-rich with a lot of customisation, Good UX, and no dependencies.

**Live:** [leauspaz.github.io](https://leauspaz.github.io)

---

## Features

**Flashcard study**
- Flip between English and your target language, reveal translations one at a time, and navigate with keyboard shortcuts or on-screen controls.

**CEFR level filtering**
- Filter cards by A1 through C2 so you study vocabulary appropriate to your level.

**Language & category filtering**
- Filter by language and topic category simultaneously; categories are auto-detected from your data.

**Text-to-speech**
- Hear the target sentence spoken aloud on reveal or on demand. Auto-play on reveal can be toggled.

**Present Mode**
- A full-screen streamer/classroom view with a progress bar, ideal for projection or live study sessions.

**22 built-in themes**
- 11 dark themes (Terminal, Amber, Arctic, Rose Gold, Obsidian, Dracula, Gruvbox, Catppuccin, Sonokai, Nord, Mocha)
- 11 light themes (Ivory, Paper, Latte, Gruvbox Light, Solarized, Sepia, Rose Light, Sage, Slate, Sand, Mint)
- A fully custom theme editor with per-variable colour controls.

**Custom CSV upload**
- Bring your own sentence data. 
- Drop a CSV with the columns `language, level, english, translation, category` and it loads instantly.

**Remappable keyboard shortcuts**
- Reassign Reveal, Next, Previous, and Speak (TTS) to any key.

**Randomise order**
- Toggle random sentence ordering on or off.

**Adjustable font size**
- Preset sizes from 14–30px or a custom px input.

---

## CSV Format

Your CSV must have a header row with exactly these columns:

```
language, level, english, translation, category
```

| Column        | Values                          |
|---------------|---------------------------------|
| `language`    | Any string, e.g. `German`       |
| `level`       | `A1` `A2` `B1` `B2` `C1` `C2`  |
| `english`     | The English source sentence     |
| `translation` | The target-language translation |
| `category`    | Any string, e.g. `Travel`       |

- Encoding: UTF-8
- Cells containing commas must be wrapped in double quotes

---

## Keyboard Shortcuts (defaults)

| Action  | Key       |
|---------|-----------|
| Reveal  | `Space`   |
| Next    | `→`       |
| Prev    | `←`       |
| Speak   | `S`       |
| Exit    | `Esc`     |

All shortcuts are remappable from Settings.

---

## Running Locally

No build step required. Just clone and open:

```bash
git clone https://github.com/leauspaz/leauspaz.github.io.git
cd leauspaz.github.io
# open index.html in your browser, or use any static server:
npx serve .
```

---

## Tech Stack

Pure HTML, CSS, and vanilla JavaScript. No frameworks, no npm, no build tooling. The entire app ships as three files.

---

## Support

If you find this useful: [☕ Buy Me a Coffee](https://buymeacoffee.com/leauspaz)
