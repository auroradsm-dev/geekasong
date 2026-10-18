# Friday Night Blind Test

Party music blind test: one host device plays the music, players buzz on their phones.

## Run locally
    npm install
    npm run dev
Then open the address Wrangler prints (e.g. http://192.168.x.x:1999) on the host and on phones (same wifi).

## Put it online (free, Cloudflare)
    npx wrangler login     # first time only, opens the browser
    npm run deploy
You get an https address like https://blindtest.<your-subdomain>.workers.dev

## Files
- src/server.ts   game rooms (one room = one game), runs on Cloudflare
- src/deezer.ts   loads songs from the Deezer API
- src/client.tsx  all screens
- src/types.ts    shared settings (genres, sounds, rounds)
- src/styles.css  look and feel
