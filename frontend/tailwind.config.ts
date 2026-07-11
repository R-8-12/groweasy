import type { Config } from "tailwindcss";

const config: Config = {
  // darkMode: 'class' is enforced via @custom-variant in globals.css for Tailwind v4.
  // This file is retained for tooling compatibility and future v3 fallback.
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
};

export default config;
