# @worldmonitor/terminal

Embeddable React component for the WorldMonitor intelligence terminal.
Multi-agent OSINT feed · live geo map · chain-of-thought reasoning · tier-gated PII.

Live demo: https://worldmonitor-core.vercel.app

## Install

```bash
npm i @worldmonitor/terminal react react-dom
```

## Use

```jsx
import { WorldMonitor } from '@worldmonitor/terminal';

export default function Page() {
  return <WorldMonitor />;
}
```

For Next.js App Router, mount in a client component:

```tsx
'use client';
import { WorldMonitor } from '@worldmonitor/terminal';
export default function Terminal() { return <WorldMonitor />; }
```

## Live data

Internally seeded by default (deterministic demo). To wire to the live API:

```jsx
<WorldMonitor
  apiUrl="https://worldmonitor-core.vercel.app/api/intelligence"
  streamUrl="https://worldmonitor-core.vercel.app/api/stream"
  tier="PRO"
/>
```

(Props API ships v1.2; current build wraps the standalone prototype.)

## Build

```bash
cd packages/terminal-sdk
npm install
npm run build     # → dist/index.mjs + dist/index.cjs
npm pack          # → @worldmonitor-terminal-1.2.0.tgz
```

## Publish

```bash
npm publish --access public
```

## License

MIT
