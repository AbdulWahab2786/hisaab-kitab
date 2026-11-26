# Project Guidelines: Hisaab Kitab

## Identity & Branding
- Application ID / Package Name: `com.hisaabkitab.app`
- App Name: Hisaab Kitab
- Clean professional identity: no personal developer names in user-facing package names, app titles, or APK labels.

## User Interface & Language Standards
- **Strict English UI**: All text, buttons, alerts, headings, dialogs, and labels in the web application and Android app must be in 100% clean, professional English (no Hinglish or Hindi strings in code or UI).
- Bilingual/Hinglish communication with the project owner in chat is welcome, but code and UI remain strictly English.

## Android Build & Signing Standards
- Framework: Capacitor 7 with Java 21 LTS (`temurin`).
- Release Keystore: `hisaabkitab-release.jks` (Alias: `hisaabkitab`, Owner: `CN=Hisaab Kitab, O=Hisaab Kitab, C=IN`).
- Secrets in GitHub Actions: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Both v1 (JAR) and v2 (Full APK) signing schemes must remain enabled.
- All future updates must be signed with this exact keystore to avoid Android package signature conflicts.

## Ledger & Core Calculations
- Urban Company calculation rules (service commission, material deductions, tips, incentives) in `ledger-core.js` and all test suites in `tests/ledger-core.test.cjs` (14/14 tests) must pass on every change.
- Automated backup exports target `Documents/HisaabKitab/` on Android devices via `@capacitor/filesystem`.
