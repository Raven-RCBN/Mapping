# Offline field PWA

MapIntel is installable as a standalone PWA with 192/512 px maskable icons, a versioned service-worker shell and private, checksum-verified estate packages. Android users can use the install prompt/browser menu; iOS users use Safari → Share → Add to Home Screen. Download the estate package from within the installed app; browser and installed-app storage may differ.

The download preserves the previous valid package until the complete replacement has passed checksums. Device quota is checked before download, and persistent storage is requested when available. Browser/OS eviction remains possible; check the saved package before fieldwork. Online map tiles are not bulk cached. Save estate imagery/reference mosaics for an offline background. Uploaded georeferenced overlays are dated assets and enter future offline packages. Document extraction and report publication require a connection.

GPS uses an explicit Locate me action and browser permission, HTTPS, `watchPosition`, high accuracy and a 5-second maximum cached fix. The map shows the position, accuracy circle, coordinates, timestamp, device-provided movement heading/speed/altitude, and optional follow mode. Dragging the map pauses follow. Fixes older than 30 seconds turn stale and do not drive navigation. Stop GPS clears the watch; unmounting also clears it. Position is held in memory only and is not sent to the server or saved in an offline package.

Users can navigate to a selected block centre/label or a typed WGS 84 coordinate. Distance and true bearing are computed on-device, including antimeridian handling. The dashed line is direct guidance, not a road route. DAFA PDF label points are explicitly approximate. Terrain, rivers, fences and access restrictions are not modelled. No false “arrived” state is inferred from an inaccurate fix.

This is foreground navigation. Phone browsers may suspend GPS when backgrounded or the screen locks; continuous background recording would need a native app with OS location capabilities. A phone with a GNSS receiver can locate offline; Wi-Fi-only devices may not. Physical-device GPS accuracy/permission behavior must be field-tested on the intended iPhone/Android device.

Reference behavior reviewed: Avenza Navigation Tool (https://support.avenzamaps.com/hc/en-us/articles/5050640334100-Navigation-Tool), MDN watchPosition and PWA installation guidance. The implemented scope is position/follow and destination bearing, not Avenza's full track recording/editor or routed road navigation.
