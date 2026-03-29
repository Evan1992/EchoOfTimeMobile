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

## Data Synchronization

This app shares a Firebase Realtime Database with the EchoOfTime web app. Both apps read and write the same user data under `/{userId}/active_plan/`.

### Conflict Risk

Write conflicts between mobile and web are unlikely in practice: the mobile app always fetches the latest server state before performing any write (optimistic-read pattern). The primary concern is **stale reads** — the mobile app displaying outdated data after the web app has made changes.

### Existing Approaches

| Mechanism | Where | How |
|---|---|---|
| Pull-to-refresh | Mobile (`LapContext`) | User-triggered full re-fetch of `today_plans` and `daily_plans` in parallel |
| Tab visibility refetch | Web (`App.js`) | Listens to `visibilitychange`; re-fetches active plan when tab regains focus |
| Token-aware refresh | Both | Detects expired tokens (401 / 55-min threshold) and refreshes before retrying |

These cover the common case (user switches between apps) but leave a gap: the mobile app has no automatic way to detect changes made on the web while the mobile screen is already open.

### Planned: Firebase Realtime Subscriptions

To close the stale-read gap, the mobile app will replace one-shot REST fetches with **Firebase SSE (Server-Sent Events)** listeners on the nodes it reads.

**Decision**: Use Firebase's `?event=put` streaming endpoint to receive server-pushed diffs whenever any client writes to the subscribed path.

**Rationale over alternatives**:
- *Polling*: wastes battery and bandwidth; delivers stale data between intervals
- *Manual refresh only*: requires user action; silent staleness is confusing for a timer app
- *Full conflict resolution*: unnecessary given the low write-collision risk (see above)

**Scope**: Subscribe to `/{userId}/active_plan/today/today_plans` and `/{userId}/active_plan/short_term_plan/daily_plans` — the two nodes the mobile app displays and mutates.

**Implementation notes**:
- Requires `react-native-sse` (polyfill for `EventSource`, not available in React Native's JS runtime)
- Token refresh while a subscription is open: close, refresh token, reopen with new token
- Subscriptions should be opened after auth is confirmed and torn down on sign-out or unmount
