# gamming_bettle

Lucky Hit red/black game built as a Node.js and React monorepo with MongoDB.

## Run locally

```bash
npm install
cp apps/server/.env.example apps/server/.env
npm run dev
```

Client: http://localhost:5173  
API: http://localhost:3090

New users receive ₹30. The server owns the 30-second round timer and result cron, so all devices read the same round state from `/api/game/state`.
