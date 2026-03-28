# EchoOfTime Mobile — Design Document

## Tech Stack

### React Native + TypeScript

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Swift | Best native performance, deep Apple integration | iOS-only, no code sharing |
| **React Native + TypeScript** | Large ecosystem (npm), cross-platform, strong TS tooling, large hiring pool | Slightly below native performance |
| Flutter | Excellent UI consistency, near-native performance | Dart (smaller talent pool), smaller package ecosystem |

### Rationale

React Native + TypeScript was selected for the following reasons:

- **Cross-platform**: Targets both iOS and Android from a single codebase (~70–90% shared code)
- **TypeScript**: Provides static typing, better tooling, and safer refactoring compared to plain JavaScript
- **Ecosystem**: Access to the npm ecosystem — the largest package registry available
- **Developer availability**: Easiest stack to hire for; large community and abundant learning resources
- **Web synergy**: Potential to share logic with a future web app built in React

## Framework

**Expo** (managed workflow) over bare React Native CLI.

- App starts iOS-only, with Android compatibility planned for the future
- Expo handles cross-platform builds via EAS — no Xcode/Android Studio required locally
- Covers all needs for this app; bare workflow available if native modules are ever needed

## Navigation

**React Navigation** (`@react-navigation/native` + `@react-navigation/bottom-tabs`) over Expo Router.

- Expo Router is file-system based and adds conventions that aren't needed for a small app
- React Navigation gives explicit, code-first control over the tab structure
- Bottom tab navigator with two tabs: **Today** (stopwatch) and **Tasks**

## Project Structure

- `screens/` — one file per screen (e.g. `TodayScreen.tsx`, `TasksScreen.tsx`)
- `App.tsx` — navigation setup only; no business logic
- `AppStyles.ts` — styles extracted from `App.tsx` into a sibling file to keep components focused on logic

## App

- **Name**: EchoOfTimeMobile
- **Type**: Stopwatch timer with lap tracking
