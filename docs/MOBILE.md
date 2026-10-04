# Native offline maps

React Native 0.83 / React 19.2 matches DigitalPalm mobile. Android and iOS native projects come from the official community template. No WebView request is needed after a map package is downloaded: the viewer JavaScript, styles, geographic features and imagery are local. Network access from the viewer is disabled by its content security policy.

1. Build the bundled map viewer from the repository root: `pnpm mobile:viewer`.
2. Build Android with JDK 17, Android SDK platform/build-tools 36 and NDK 27.1.12297006. Use Android Studio or run `./gradlew assembleDebug` in `apps/mobile/android`. For a standalone test APK (no Metro connection), run `./gradlew assembleFieldPreview -PreactNativeArchitectures=arm64-v8a`; the output is `app/build/outputs/apk/fieldPreview/app-fieldPreview.apk`. This preview uses the public Android debug signing key and is not an app-store release. The debug build is for development; release signing must use your own keystore. A signed distribution is not supplied by this repository.
3. For iOS, use Xcode and run `bundle install` / `bundle exec pod install` in the native project as appropriate, then `pnpm --filter @mapping/mobile ios`. Xcode is required; the local Mac used for development did not have Xcode installed.
4. Enter the HTTPS API host and a valid DigitalPalm mapping access token. Tokens remain in memory, never in the map package.
5. Load estates, select the ones required and download. Every file is checked before replacing the last successful package.
6. Open the saved estates. Change date, activity type or terrain mode without a network connection. The native map is read-only. Use the QField package from the web dashboard to capture field records.

Saved maps are private app documents, with Android backup disabled. Removing downloaded maps clears the active package. Logging in as a different subject removes the previous subject's package. Treat a device with downloaded estate data as a trusted field device; offline grants cannot be remotely revoked until the device reconnects. An offline activity capture/review sync queue is not implemented.

The API's development mode accepts localhost only. Android emulator testing can use `adb reverse tcp:4180 tcp:4180` and `http://127.0.0.1:4180`; for physical devices configure JWT mode and HTTPS. Never expose development mode to the LAN.
