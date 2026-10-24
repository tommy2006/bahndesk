// Vercel entry point. Every /api/* request is rewritten here (see vercel.json) and handled
// by the same code as the local server; the page itself is served from public/.
export { handler as default } from '../server.mjs';
