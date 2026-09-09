// Only the dedicated Vite mode enables fixtures; production cannot opt in via URL.
export const isDemo = import.meta.env.MODE === "demo";
