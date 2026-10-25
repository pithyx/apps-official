# Editor

The text, Markdown and hex editor of the Pithyx project. It is not part of the system image: an administrator installs it from the Store when the box needs it.

- Several windows, and several files as tabs in each window.
- Open, create and save files in the shared folders through the desktop's file dialogs; files open with the Editor from the Files app ("Open with", or a double click for the types it is the default for).
- Syntax highlighting for Markdown, YAML, TOML, JSON, INI and conf files, systemd units, shell, Dockerfile, nginx, XML and HTML, CSS, JavaScript and TypeScript, Python, SQL and more; the language can be changed in the status bar.
- Markdown with three views: edit, split and preview. The preview is sanitized, code blocks are highlighted, and links open in a new tab.
- A hex editor for binary files and, on request, for any file: overwrite and insert, undo, selection, copy and paste as hex or text, go to an offset, and an inspector for the integer and float values at the cursor.
- Line endings (LF or CRLF) and the UTF-8 byte order mark are kept as they were and can be changed.
- Unsaved changes are asked about before a tab or the window closes, and unsaved text comes back after a reload of the desktop.

## Permissions

| Permission    | Why                                                                    |
| ------------- | ---------------------------------------------------------------------- |
| `files.read`  | read the files the user opens with the Editor or picks in the dialog   |
| `files.write` | save those files, and save new files through the desktop's save dialog |

The Editor has no backend and makes no network connections. It sees only the files the user hands it.

## Limits

- Files up to 64 MB. Text must be UTF-8; other files open in the hex editor.
- A reload of the desktop ends the Editor's access to the files it had open (file handles belong to a window), so those files have to be opened again; unsaved text is kept.

## Keyboard

| Keys                       | Action                    |
| -------------------------- | ------------------------- |
| Ctrl+S                     | Save                      |
| Ctrl+Shift+S               | Save as                   |
| Ctrl+O                     | Open                      |
| Alt+N                      | New file                  |
| Alt+W                      | Close the tab             |
| Alt+Page Up, Alt+Page Down | Previous or next tab      |
| Ctrl+F                     | Find and replace          |
| Ctrl+Alt+G                 | Go to line                |
| Insert (hex editor)        | Switch overwrite / insert |
| Tab (hex editor)           | Switch hex / text column  |

Ctrl+N, Ctrl+W and Ctrl+Tab belong to the browser.

## Development

```sh
npm ci
npm run build    # type check and build into dist/
```

`pithyx validate`, `pithyx pack` and a sideload refuse the reserved id `org.pithyx.editor`; to try the app on a box, pack a copy whose `pithyx.json` has another id (for example `com.example.editor`). The catalog's own check validates the manifest.

## License

MIT. The bundled fonts IBM Plex Sans and JetBrains Mono are under the SIL Open Font License 1.1.
