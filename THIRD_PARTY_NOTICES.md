# PDF reflow components

SiReader's original code retains its MIT license (see LICENSE). The bundled PDF
reflow implementation also includes the following AGPL components. Distribution
of the combined implementation must comply with those licenses; it is not an
MIT-only bundle.

## Scribe.js layout analysis

- Repository: https://github.com/scribeocr/scribe.js
- Commit: 43c00dc3ccd5612d094317432cdbf94094149ca0
- License: AGPL-3.0-only; full text in src/vendor/scribe-layout/LICENSE.
- Upstream algorithms are unmodified except for a TypeScript checking directive.
- Original files, hashes and provenance are in src/vendor/scribe-layout/UPSTREAM.json.
- The release bundle includes these files under sources/scribe-layout and the
  integration sources under sources/reflow/core and sources/reflow/services.

## MuPDF.js

- Package: mupdf 1.28.1 (Artifex Software)
- Repository: https://github.com/ArtifexSoftware/mupdf
- License: AGPL-3.0-or-later; bundled full text in mupdf/LICENSE.
- The JavaScript and WebAssembly runtime are distributed without modification.
- Source for the packaged version: https://www.npmjs.com/package/mupdf/v/1.28.1
  and https://github.com/ArtifexSoftware/mupdf/tree/1.28.1

SiReader project and build source: https://github.com/mm-o/siyuan-sireader.
Retain the corresponding project sources when distributing modified builds.
