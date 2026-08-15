# Sports 803 Expo App

This is the React Native/Expo port of the Sports 803 live streaming app. The original Flutter implementation remains in the repository; this directory is the Expo build target.

## Install and run

```bash
cd expo
npm install
npx expo start
```

The app reads live events from `s803config/todaysMatches` and Live TV channels from `livetv/channels` in the existing Firebase Realtime Database. It keeps streams inside `react-native-webview`, stores favorites with AsyncStorage, and uses the supplied AdMob production IDs. Development builds use Google test ad IDs automatically when `__DEV__` is true.

## Generate an Android APK with Expo EAS

Install and authenticate with EAS once:

```bash
npm install -g eas-cli
eas login
eas build:configure
```

Then create an installable APK with the configured internal distribution profile:

```bash
cd expo
eas build --platform android --profile preview
```

The `preview` profile uses `android.buildType: apk`, while `production` generates an Android App Bundle for store submission:

```bash
eas build --platform android --profile production
```

EAS builds run on Expo’s build service and require an Expo account plus Android signing credentials. After the build completes, EAS prints a download URL for the APK. No `google-services.json` is required for this Firebase Web SDK implementation; the Realtime Database URL is embedded in `App.js`. The AdMob config plugin is applied during the native prebuild.

## Important production checks

Replace development-only Firebase configuration with the project’s production web configuration if Firebase Authentication or other protected services are added later. Also replace production ad IDs with Google test IDs for local testing on physical devices, and confirm that the stream URLs permit playback in an embedded WebView.
