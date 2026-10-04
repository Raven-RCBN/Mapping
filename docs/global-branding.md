# AgriNexus branding

Estate Atlas reads the public AgriNexus setting at `/api/public/settings/global-branding` and displays its **Minor Logo** above the existing gold map icon in the green sidebar. The Major Logo is not used.

Hosted builds use the same origin. Standalone development builds read the public setting from `https://agrinexus.digitalpalm.ai`. The request sends no authentication token. Upload metadata (`FilePath` and `BaseUrl`) is resolved to the configured image URL; no copy is stored in the estate database or imagery folders.

The setting refreshes on page load, window focus and AgriNexus branding change events. The last URL is retained locally during connection failures; a missing or unavailable image is hidden. Existing media HTTP caching handles the logo download.

Validation: production build, `/EstateAtlas/` asset/service-worker scope check, and signed-in browser inspection of the logo above the map icon.
