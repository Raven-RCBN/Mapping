# Oban CarryMap mosaic — 10 October 2026

Status: deployed to `https://mapping.digitalpalm.ai/` on 10 October 2026 at 14:58 Malaysia time, after the user explicitly approved the private imagery transfer. Active API release: `/home/deploy_mapping/app/releases/20261010-carrymap`. Previous API/frontend backup: `/home/deploy_mapping/backups/20261010-before-carrymap`.

The supplied `Oban Carrymap 2024 (20240813).cmf2` contains `Oban_Merge_ecw_v4.ecw` as a nine-level WebP pyramid. The importer validated all 221,531 tile indices, record lengths and WebP signatures. SHA-256: `7653a59ca4c5041a146aa941496eabadc125e54df267d4c0b2575e362e39db7f`. Level zero has 428 × 388 tiles of 256 pixels, roughly 0.11 m raster grid spacing. Grid spacing is not a claim about optical resolution or survey accuracy. The filename is not proof of acquisition date.

Both tile rows and the pixels inside each tile are stored south-to-north. The API reverses the tile row and flips the decoded image. Browser verification against the existing estate boundaries confirmed the orientation and alignment. OpenLayers uses each native WGS84 level's own extent and reprojects into the map view; the padded extents differ between levels.

The existing reference-image asset keeps its identity. Its `file` is a small CarryMap overview for offline use, while its private `mosaic` metadata points to the original CMF2. The public response exposes only dimensions, extents, checksum and the authenticated tile endpoint, never source paths or byte offsets. Each request checks estate access and retirement state. Only the requested tile is read and decoded. Full-detail tiles require connectivity; offline packages retain the overview. Block fills are reduced in Estate mosaic to keep the imagery legible.

Validation: full API/shared/web test suite and frontend production build passed. Local browser preview showed estate alignment and individual palm crowns at close zoom. Unit tests exercise tile addressing, invalid offsets and coordinates, scope, retirement and private caching. The existing reference asset was updated after the full source checksum and prior overview checksum passed. Estate boundaries, blocks and activity records were not modified.

## Deployment and recovery

Private artifacts live in `.deploy/carrymap-20261010/`: source inspection, `mosaic.json`, `overview.webp`, reviewed `update.json`, and browser proof. The local preview runs on `http://127.0.0.1:4197` with the isolated `MappingTest_carrymap_preview` database and `data/carrymap-preview` assets.

For any future redeployment, stage the original source and overview under the paths in `update.json`, outside the public web directory. Deploy the changed API files with a source backup, and run `scripts/deploy/apply-carrymap-mosaic.mjs` first without flags using the private service environment. It verifies the existing overview checksum, new file checksums, estate identity and sample tile decoding. `--apply` saves the previous reference asset in a private backup and updates that single asset conditionally on its unchanged version. Retain the old overview.

Publish the frontend with the existing production build environment (including local sign-in settings), preserve old hashed assets, and replace the entry point last. Verify authenticated tiles, unauthenticated rejection, close zoom, estate switching and the saved offline overview. Rollback restores the saved reference asset and previous API/frontend source; no boundaries or activity records are modified by this change.

## Live verification

The deployed frontend entry point exactly matches the production build. The API reports healthy with independent Mapping sessions. All nine pyramid levels decode to 256 × 256 images from private server storage. An unauthenticated HTTPS tile request returns 401. The new offline overview is 1,719,652 bytes. The production browser session was signed out, so the close-up visual check was performed in the isolated local preview; server and HTTPS checks verified the deployed artifacts.

The user also requested a Git update. Source, tests, importer and deployment documentation are committed together; private imagery and deployment payloads remain ignored and are not pushed to Git.
