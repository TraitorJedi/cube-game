# Cubesque-Ape

The live game at `/` is the React/Three implementation in `src/main.js`. The
preserved DOM/CSS implementation remains available at `/legacy` from
`legacy/app.js`.
An isometric cube-puzzle game whose player is a voxel ape. The ape is built
from cuboids and fits entirely inside one 1 × 1 × 1 cell of the active 4 × 4 × 4
interior grid.

It uses [iamthecu.be](https://iamthecu.be/) as a reference starting point for the concept, interaction style, and overall direction, but the source code in this repository was recreated independently for this project.

## Run locally

Run `npm run dev`, then open `/` for the current React game or `/legacy` for the
preserved implementation.

