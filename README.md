# Citations

The academic references a document cites, beside the document.

`kehikko-references` is this shape for issues and merge requests: a list of the
things an epic is about, filtered and ordered, beside whatever else is on the
canvas. This is the same idea aimed at a bibliography — every entry in a `.bib`,
what the prose does about it, and the two things that are invisible until you
hold the two files up against each other.

    ./run.sh                    # port 7930
    bun run register            # tell a host on this machine where it answers
    bun test                    # 111 tests, no browser
    bun run typecheck

## What it shows

- **Every entry in the bibliography** — author, year, title, venue — in the
  order the file writes them, or by author, year, citation count or key.
- **Which are actually cited.** An entry nothing names compiles fine, is
  invisible in the PDF under most styles, and is either a reading the author
  decided against or a citation they meant to make. Both are worth seeing.
- **Which `\cite`s name an entry that does not exist.** That one is a defect
  rather than a judgement: biblatex prints a `?` where the citation should be
  and buries the warning in a log nobody reads until the PDF is printed.
- **Anything in the `.bib` that could not be read.** A file with an unbalanced
  brace will also fail to compile, and a page silently showing thirty-six of
  thirty-seven entries would be hiding the thing the author most needs to know.

Against the corpus this was written for — a thesis of seven `.tex` files —
that is 37 entries, 80 citation occurrences, 2 entries nothing cites, and no
broken citations.

## Where it reads from

The **same environment variables the paper module reads**, deliberately:

| variable | what it names |
| --- | --- |
| `KEHIKKO_PAPERS_DIR` | a directory holding one folder per epic, each with a `main.tex` |
| `KEHIKKO_ROADMAP_DIR` | a roadmap checkout; `data/papers` is appended |
| `KEHIKKO_THESIS_DIR` | ONE document: a `main.tex` at the top of its own repository |
| `KEHIKKO_THESIS_EPIC` | the slug that document answers to. Default `thesis` |

Reading the same variables is not depending on that module. Nothing here calls
it, imports from it, or needs it running; the two are independent programs
pointed at the same directory the way two editors open the same file. Asking the
paper module over HTTP would make this page blank whenever its port was down,
for data sitting on the same disk this process can already read — and a third
set of variables would mean the same directory configured twice, which is the
kind of thing that gets one of the two wrong and stays wrong for months.

There is no default and no cache. The `.bib` is being edited while this runs;
the whole value of the page is that a reload shows the entry the author just
added.

## The two fences

The confinement is character for character the paper module's, **copied rather
than shared**. A shared fence would be a dependency between two modules on the
security-critical path; a copied one is a fence each module owns and tests, and
changing one means changing the other deliberately.

1. **The shape check.** An epic slug is `^[a-z0-9][a-z0-9-]{0,79}$`, applied
   before any filesystem call, and applied to the slug from `KEHIKKO_THESIS_EPIC`
   as well — a variable is set by somebody standing closer, not by somebody more
   trustworthy.
2. **`realpath` confinement, per root.** `\addbibresource{../../etc/passwd}` and
   `\include{../secret}` are strings an author can write; a symlink inside the
   tree pointing out of it resolves after a plain `resolve()` has already
   declared the string safe. Each root is confined **separately** — a path
   outside every root is refused, and one root can never resolve a path against
   another's.

Only files the document itself names are read: `main.tex`, one level of
`\include`, and the `.bib` named by `\addbibresource` or `\bibliography`. A
scratch `.tex` lying beside the paper is not part of the document, and counting a
citation in one would report a citation that does not appear in the PDF.

## Why a citation does not go in the canvas selection

`kehikko-references` puts the refs you pick into `selection.set` and every module
on the canvas is told. The obvious move is to do the same with a citation key,
and it is wrong.

The protocol's essay on `selection` says what the field is: *"a host can vouch
that these are the refs somebody picked, and cannot vouch for what they ARE,
because it was told and never checked."* The selection carries refs and no kinds
— which works precisely because every module reading it agrees what a ref is.
`graesser2004autotutor` is not a ref. It is a key in one author's `.bib`,
meaningful inside one document and meaningless three containers over. Putting it in
the selection hands every module a string it will look up in a tracker and fail
to find, and that failure is not an error anybody sees: it is References showing
nothing, Journeys highlighting nothing, and a reader concluding the canvas is
broken.

So selection here is local. Pressing a row expands it in place and nothing leaves
this container. The day the protocol can say what KIND of thing a selection holds,
this is the paragraph to come back to.

## What it declares

`epics:read` (enrichment: which epics have no document here at all) and
`state:keep` (the filter and the order, across a reload). **`storage: true` and
no `server.cors`** — the page serves its own `/api`, so a permissive
`Access-Control-Allow-Origin` would invite every page in every tab to read this
origin. It also means `localStorage` is not the mechanism for the filter, which
matters: on an opaque origin `localStorage` does not return nothing, it *throws*.

    curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7930/app | grep -i access-control

must print nothing.

## The MCP door

Two tools, both read-only.

- `bibliography` — every entry with its citation count, or the list of documents
  when no epic is named.
- `problems` — every broken citation, every uncited entry, every unparsed line.
  "Nothing is wrong" is an explicit sentence rather than an empty answer, because
  an empty answer and a failed call look identical to an agent.

## Layout

    bib/parse.ts     the BibTeX reader — pure, brace-aware, no dependencies
    bib/cite.ts      the \cite scanner and the cross-reference — pure
    store.ts         the two roots, the two fences, and reading one document
    doors.ts         /api, /mcp, /healthz — one function, no socket
    manifest.ts      what a host reads, and the essay on the selection refusal
    src/live/        the filter, the order, and what survives a reload
    src/view/        the row and the toolbar
    vite.config.ts   the one server, and the `server.cors` line that is absent

There is no `index.html` and no `build` script: the page is generated per
request by the middleware in `vite.config.ts`, so `vite build` would have no
entry to start from and could only ever fail.
