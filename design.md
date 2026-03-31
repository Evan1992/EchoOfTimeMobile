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

### Mechanisms

| Mechanism | Where | How |
|---|---|---|
| **Firebase SSE subscriptions** | Both | Server-pushed `put`/`patch` events update state automatically whenever any client writes |
| Pull-to-refresh | Mobile (`LapContext`) | User-triggered REST re-fetch; confirms latest snapshot and resets SSE-derived state |
| Token-aware refresh | Both | Detects expired tokens (401 / 55-min threshold) and refreshes before retrying |

SSE subscriptions replace tab visibility refetch on the web and close the stale-read gap on mobile: both apps now detect changes from any other client automatically, without user action.

### Firebase SSE Subscriptions

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
