/**
 * Vite resolves a `?url` import to a hashed asset URL (a string). Used to hand
 * pdf.js the bundled location of its web worker. Declared locally since the app's
 * tsconfig sets `"types": []` (no auto-included ambient `vite/client`).
 */
declare module '*?url' {
  const src: string
  export default src
}
