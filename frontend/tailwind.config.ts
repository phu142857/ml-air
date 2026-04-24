import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          main: "#0F172A",
          card: "#1E293B",
          muted: "#111827"
        },
        status: {
          success: "#16A34A",
          failed: "#DC2626",
          running: "#F59E0B",
          pending: "#6B7280"
        }
      },
      borderRadius: {
        xl: "12px"
      }
    }
  },
  plugins: []
};

export default config;
