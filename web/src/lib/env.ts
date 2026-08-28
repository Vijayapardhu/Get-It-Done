export const env = {
  VITE_API_URL: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  VITE_WS_URL: import.meta.env.VITE_WS_URL ?? "http://localhost:4000",
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME ?? "The Cooperative Desk",
}