/** Base URL for API calls. Empty string in dev (uses Vite proxy), full URL in production. */
export const API = import.meta.env.VITE_API_URL || '';
