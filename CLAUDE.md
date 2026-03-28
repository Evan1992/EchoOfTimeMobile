# EchoOfTimeMobile — Claude Instructions

## Stack
- React Native + TypeScript, using Expo (managed workflow)
- Node.js >= 20.19.4 required

## Commands

| Command | Purpose |
|---------|---------|
| `npm run start` | Start Expo dev server |
| `npm run ios` | Start on iOS simulator |
| `npm run android` | Start on Android emulator |
| `npm run web` | Start in browser |

## Project Structure

```
EchoOfTimeMobile/
├── App.tsx          # Root component
├── index.ts         # Entry point
├── app.json         # Expo config (name, icons, splash)
├── tsconfig.json    # TypeScript config
├── assets/          # Images, fonts, icons
└── design.md        # Architecture and tech stack decisions
```

## Conventions
- TypeScript strict mode — no `any`, always type props and state
- Functional components with hooks only — no class components
- Keep `App.tsx` lean; extract components into a `components/` directory as the app grows
