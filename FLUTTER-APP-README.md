# Sports 803 Flutter App

This directory contains a production-oriented Flutter client for the Sports 803 live sports and Live TV experience. It preserves the repository’s existing Firebase data contract while moving the user experience into a native dark-mode app.

## Implemented experience

The app has four bottom-navigation destinations: **Home**, **Live TV**, **Favorites**, and **More**. Home reads `s803config/todaysMatches`, displays only live events, filters categories locally, supports pull-to-refresh, and provides native event cards with team logos, scores, stream buttons, and local favorites. Live TV reads `livetv/channels` and opens every channel inside an in-app WebView. The player keeps the selected stream in-app, supports source switching, displays match details, and prepares an interstitial when the user navigates back.

## Local setup

Install Flutter 3.24 or newer, then run:

```bash
flutter pub get
flutter create . --platforms=android,ios
```

The second command may regenerate platform boilerplate. If it does, re-apply the Android application ID and AdMob metadata from `android/app/src/main/AndroidManifest.xml`.

For Android, place the Firebase configuration file downloaded from the Firebase Console at `android/app/google-services.json`. For iOS, add `GoogleService-Info.plist` to the Runner target in Xcode. The Realtime Database URL is already configured by the Firebase project and is documented in `lib/services/firebase_service.dart`.

Run the app with:

```bash
flutter run
flutter build apk --release
flutter build ipa --release
```

## Firebase rules

The client needs read access to `s803config/todaysMatches`, `livetv/channels`, and optionally `postReactions`. Use the supplied `database.rules.json` as a starting point. Public read access is intentionally limited to those paths; writes remain denied so that event publishing continues to use the repository’s authenticated automation workflow.

## AdMob

The exact production IDs supplied in the brief are wired into the app. Replace them with Google test IDs while developing or testing on physical devices. The Android application ID is in the manifest, Home and Player use their respective banner units, Live TV uses its banner unit, and Player prepares the specified interstitial on back navigation.

## Notes

The repository did not include an installed Flutter SDK in the build environment, so the code was created and reviewed statically rather than compiled here. The first local Flutter build will generate platform files and confirm SDK-specific Gradle compatibility. The existing Blogger theme, automation scripts, and documentation remain untouched.
