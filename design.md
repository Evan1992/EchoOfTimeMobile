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

## Lock Screen Timer (Live Activities)

Live Activities are used to display the running timer on the iOS lock screen and Dynamic Island, matching the behaviour of the iPhone's built-in Clock timer.

### Options Considered

| Option | Pros | Cons |
|---|---|---|
| Ongoing notification (expo-notifications) | No new dependencies, works in Expo Go | Generic notification look; requires periodic JS updates; no native ticking timer |
| `expo-live-activity` (Software Mansion) | No Swift required; JS-only API | Pre-built SwiftUI template with fixed layout; no native count-up timer — only countdown via `ProgressView(timerInterval:)`; subtitle must be updated manually every ~30s |
| **Custom Swift** | Full SwiftUI control; native `Text(timerInterval:, countsDown: false)` ticks every second without any JS updates; Dynamic Island support | Requires Expo prebuild + Xcode; Swift code in repo |

### Decision: Custom Swift

**Rationale**:

- `expo-live-activity`'s pre-built template does not expose a count-up timer. Its `date` field maps to `ProgressView(timerInterval:)` which is a **countdown** progress bar, not an elapsed-time display. Achieving a ticking count-up timer would have required either forking the library or pushing JS updates every second — both worse than writing Swift directly.
- Custom Swift allows using SwiftUI's `Text(timerInterval: startDate...Date.distantFuture, countsDown: false)`, which ticks natively on the device with zero JS involvement after the activity is started.
- The one-time cost (Expo prebuild + Widget Extension setup) is low and unblocks other native capabilities in the future.

### Implementation

- **`ios/EchoOfTimeMobile/TimerActivityAttributes.swift`** — `ActivityAttributes` struct shared between the main app and widget targets; holds `taskName`, `startDate` (effective start = `Date.now() - elapsed`), and `isRunning`
- **`ios/EchoOfTimeMobile/EchoTimerModule.m` + `EchoTimerModule.swift`** — `RCTBridgeModule` native module exposing `startActivity`, `updateActivity`, `stopActivity` to JavaScript
- **`ios/TimerWidget/TimerLiveActivity.swift`** — SwiftUI lock screen and Dynamic Island views; uses `Text(timerInterval:, countsDown: false)` for the native ticking display
- **`ios/TimerWidget/TimerWidgetBundle.swift`** — Widget extension entry point
- **`services/EchoTimer.ts`** — Thin JS wrapper around the native module; no-ops on Android

**Key design detail**: `startDate` is passed as `Date.now() - elapsed` (the timer's effective epoch), not the wall-clock time the button was pressed. This means iOS computes the correct elapsed time natively even after pauses, with no further updates from JS.

### How JS and Swift are connected

The connection goes through React Native's **Native Module Bridge**:

```
TodayScreen.tsx
  └─ calls startLiveActivity("Deep Work", 1234567890)
       └─ services/EchoTimer.ts
            └─ NativeModules.EchoTimerModule.startActivity(...)
                 └─ [Bridge]
                      └─ EchoTimerModule.m  ← registers the Swift class with RN
                           └─ EchoTimerModule.swift  ← actually runs
                                └─ ActivityKit.Activity.request(...)
                                     └─ iOS renders TimerLiveActivity.swift on lock screen
```

**`NativeModules.EchoTimerModule`** (`services/EchoTimer.ts`) — React Native's `NativeModules` object is populated at runtime with every registered native module. Calling it is identical to calling any JS object.

**`EchoTimerModule.m`** — The `RCT_EXTERN_MODULE` and `RCT_EXTERN_METHOD` macros register the Swift class with the bridge at app startup. Without this file, `NativeModules.EchoTimerModule` does not exist. This file is the only reason `.m` is needed — Swift cannot self-register with the bridge because the bridge is Objective-C under the hood.

**`EchoTimerModule.swift`** — The actual implementation. The bridge serialises JS arguments (strings, numbers, booleans), calls this Swift function on a background thread, and the Swift code calls ActivityKit.

**`TimerLiveActivity.swift`** — Not connected to the bridge. iOS calls this SwiftUI code directly whenever it needs to render the lock screen widget. The link to the module is through the shared `TimerActivityAttributes` struct: the native module writes state into it via ActivityKit, and the widget reads from it.

## Data Synchronization

This app shares a Firebase Realtime Database with the EchoOfTime web app. Both apps read and write the same user data under `/{userId}/active_plan/`.

### Conflict Risk

Write conflicts between mobile and web are unlikely in practice: the mobile app always fetches the latest server state before performing any write (optimistic-read pattern). The primary concern is **stale reads** — the mobile app displaying outdated data after the web app has made changes.

### Mechanisms

| Mechanism | Where | How |
|---|---|---|
| **Firebase SSE subscriptions** | Both | Server-pushed `put`/`patch` events update state automatically whenever any client writes |
| Pull-to-refresh | Mobile (`LapContext`) | User-triggered REST re-fetch; confirms latest snapshot and resets SSE-derived state |
| Token-aware refresh | Both | Detects expired tokens (401 / 55-min threshold) and refreshes before retrying |

SSE subscriptions replace tab visibility refetch on the web and close the stale-read gap on mobile: both apps now detect changes from any other client automatically, without user action.

### Firebase SSE (Server Sent Events) Subscriptions

The mobile app subscribes to two Firebase nodes via **Server-Sent Events (SSE)**, receiving server-pushed diffs whenever any client writes to those paths.

**Decision**: Use Firebase's REST streaming endpoint (`Accept: text/event-stream`) over the Firebase JS SDK or polling.

**Rationale over alternatives**:
- *Polling*: wastes battery and bandwidth; delivers stale data between intervals
- *Manual refresh only*: requires user action; silent staleness is confusing for a timer app
- *Full conflict resolution*: unnecessary given the low write-collision risk (see above)
- *Firebase JS SDK (`firebase` npm package)*: the SDK's realtime listeners (`onValue`) use a persistent WebSocket and would solve the stale-read problem, but introduce disproportionate cost for this use case:
  - Adds ~200 KB to the bundle for features this app does not need (Firestore, Storage, Analytics, offline cache, write queue)
  - Requires migrating all existing REST writes to SDK calls — a large refactor with no functional gain, since write conflicts are already low-risk
  - The SDK manages token refresh internally, which would conflict with the app's existing token-refresh logic; reconciling them adds complexity without benefit
  - SSE is a natural, minimal extension of the existing REST approach: same URLs, same auth tokens, same write path — only the read response changes from one-shot to streaming

**Subscribed nodes**:
- `/{userId}/active_plan/today/today_plans`
- `/{userId}/active_plan/short_term_plan/daily_plans`

**Connection model**:

SSE and writes use two independent channels. The client always initiates both, but they serve opposite directions:

```
┌─────────┐                          ┌──────────┐
│  Client │                          │ Firebase │
└────┬────┘                          └────┬─────┘
     │                                    │
     │── GET /path.json (SSE) ──────────► │  ← client opens once, stays open
     │◄─ event: put   ────────────────── │  ← server pushes on any write
     │◄─ event: patch ────────────────── │
     │◄─ event: patch ────────────────── │
     │                                    │
     │── PATCH /path.json (write) ──────► │  ← separate short-lived request
     │◄─ 200 OK ──────────────────────── │    closes immediately after
     │                                    │
     │── PATCH /path.json (write) ──────► │  ← another separate request
     │◄─ 200 OK ──────────────────────── │
```

The SSE connection is long-lived and passive — the client only listens on it. All writes are independent short-lived HTTP requests, identical to the existing REST write path.

**Implementation**:
- `hooks/useFirebaseSSE.ts` — generic hook; opens the SSE connection, routes `put`/`patch`/`cancel` events to caller-supplied callbacks, closes on unmount or when `path`/`token` changes
- `LapContext.tsx` — mounts two `useFirebaseSSE` instances (one per node); applies incoming diffs to raw Firebase state via `applyPut`/`applyPatch`, then re-derives `Lap[]` via `computeLaps`; preserves the active task selection across updates by remapping plan IDs
- `react-native-sse` — polyfill for `EventSource`, which is not available in React Native's JS runtime
- Token refresh: Firebase sends a `cancel` event when the token expires; the handler calls `getToken()` (which refreshes the token) and updates `sseToken` state, which causes both connections to close and reopen with the new token
- Connections open after auth is confirmed and tear down on sign-out or unmount
