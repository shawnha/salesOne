import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#0d9488",
          light: "rgba(13, 148, 136, 0.08)",
          dark: "#2dd4bf",
        },
        surface: {
          light: "#ffffff",
          dark: "#16161a",
        },
        bg: {
          light: "#f8f9fa",
          dark: "#0a0a0c",
        },
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "28px",
      },
    },
  },
  plugins: [],
};
export default config;
