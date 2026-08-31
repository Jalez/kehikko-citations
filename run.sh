#!/usr/bin/env bash
#
# The one name every module ships this under, so a host that offers to start one
# has a script to run rather than a command line to build.
#
#   - No arguments. A registration names a directory and one script inside it,
#     never a command line: a string a host handed to a shell would make a
#     registration file a place to write shell.
#   - No port on the `vite` line, and no `--strictPort`. Both used to be there,
#     with 7930 written here and again in `register.ts` — 7820 through 7960
#     belong to the other modules on this machine — so moving this one meant two
#     edits and then remembering that the file in `~/.roadmap/modules` still
#     named the old address. It is said once now, beside the id, as
#     `PREFERRED_PORT` in `manifest.ts`.
#
#     $PORT is still honoured, by `serves()` in `vite.config.ts` rather than by
#     this line, and for the reason this bullet always gave: whoever starts this
#     chose the port, and an app that picked its own would answer somewhere
#     nobody is looking. A host passes the port from the registration when it
#     spawns this script, which is the address it is about to go and read.
#
#     What `--strictPort` bought was an app that DIED on a taken port rather than
#     one answering quietly somewhere else, and that was the only honest option
#     while nothing handled a collision. `serves()` handles it: a free 7930 is
#     taken in silence, this module already answering there ends the start
#     cleanly instead of making a second copy, and anything else is a loud move
#     with the registration rewritten to the port actually bound.
#   - `exec`, and the foreground. A script that forks and returns leaves whoever
#     started it holding a pid that stops nothing, and Stop is only ever offered
#     for what a host started.
#   - `cd` to this script's own directory, so `page/` and `bib/` are found
#     however this was invoked.
#
# ## The one thing this program needs told
#
# Where the documents are, and it reads the SAME variables the paper module
# reads: `KEHIKKO_PAPERS_DIR` (a directory of one folder per epic), or
# `KEHIKKO_ROADMAP_DIR` with `data/papers` under it, or `KEHIKKO_THESIS_DIR`
# naming one document at the top of its own repository.
#
# Reading the same variables is not depending on that module. Nothing here calls
# it, imports from it, or needs it running; the two are independent programs
# pointed at the same directory the way two editors open the same file. A third
# set of variables would mean the same directory configured twice, which is the
# kind of thing that gets one of the two wrong and stays wrong for months.
#
# There is deliberately no default. Unset, this still starts, still serves, and
# says on its own page what to set — a misconfiguration that announces itself is
# worth far more than one that renders an empty world convincingly.
#
# It does NOT register a module that had none. Registration is a deliberate act
# by a person — see `register.ts` — and a start script that quietly wrote into
# somebody's home directory would be doing it on their behalf. That argument is
# untouched. What the Vite plugin now writes on every start is this module's
# ADDRESS, which is a different sentence: the person decided to be framed, they
# did not decide to be framed at 7930 in particular, and a registration still
# naming a port this app has drifted off is one the host sweeps to find nothing.
#
# ## There is no build here, and no `dist`
#
# The argument for one is that starting should be starting: a start that shells
# out to a build is a start that fails when the network is down. The argument is
# fine and the shape is still wrong, because this program is not deployed — it
# runs on the machine of the person editing it. What `dist` actually buys is a
# STALE page served with a 200, every symptom of a working app and none of the
# changes. A missing build announces itself; a stale one does not. There is
# therefore no `build` script in `package.json` either, and no `index.html`:
# the page is generated per request by the middleware in `vite.config.ts`, so
# `vite build` would have no entry to start from and could only ever fail.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing…" >&2
  bun install >&2
fi

if [ -z "${KEHIKKO_PAPERS_DIR:-}" ] && [ -z "${KEHIKKO_ROADMAP_DIR:-}" ] && [ -z "${KEHIKKO_THESIS_DIR:-}" ]; then
  echo "citations: none of KEHIKKO_PAPERS_DIR, KEHIKKO_ROADMAP_DIR or KEHIKKO_THESIS_DIR is set." >&2
  echo "citations: starting anyway; the page will say so rather than pretending there are no documents." >&2
fi

exec bunx vite
