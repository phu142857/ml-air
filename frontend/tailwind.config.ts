import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"]
      },
      fontSize: {
        /** App chrome / logo (topbar) */
        brand: ["1.125rem", { lineHeight: "1.5rem" }],
        /** Route page `<h1>` — was `text-2xl` */
        page: ["1.5rem", { lineHeight: "2rem" }],
        /** Card section `<h2>` / sidebar labels density */
        section: ["0.875rem", { lineHeight: "1.25rem" }],
        /** Default body copy in forms & tables */
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        /** Hints, table meta, compact lists */
        caption: ["0.75rem", { lineHeight: "1rem" }],
        /** Uppercase labels / micro meta (replaces 11px hacks) */
        overline: ["0.6875rem", { lineHeight: "1rem" }]
      },
      colors: {
        // Semantic UI tokens (MLflow-inspired palette) — see app/globals.css
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)"
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)"
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)"
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)"
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)"
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)"
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)"
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",

        /** Sentry-inspired observability sub-canvases (runs / tasks / logs) */
        obs: {
          canvas: "var(--obs-canvas)",
          surface: "var(--obs-surface)",
          border: "var(--obs-border)",
          muted: "var(--obs-muted)",
          log: "var(--obs-log-bg)"
        },

        // Semantic colors using CSS variables
        "bg-page": "var(--bg-page)",
        'bg-surface': 'var(--bg-surface)',
        'bg-muted': 'var(--bg-muted)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-disabled': 'var(--text-disabled)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',
        'color-primary': 'var(--color-primary)',
        'color-success': 'var(--color-success)',
        'color-error': 'var(--color-error)',
        'color-warning': 'var(--color-warning)',
        'color-info': 'var(--color-info)',
        'bg-success': 'var(--bg-success)',
        'bg-error': 'var(--bg-error)',
        'bg-warning': 'var(--bg-warning)',
        'bg-info': 'var(--bg-info)',
        
        // Legacy aliases for backward compatibility
        bg: {
          main: 'var(--bg-page)',
          card: 'var(--bg-surface)',
          muted: 'var(--bg-muted)'
        },
        status: {
          success: 'var(--color-success)',
          failed: 'var(--color-error)',
          running: 'var(--color-info)',
          pending: 'var(--color-warning)'
        }
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)'
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)'
      },
      ringOffsetColor: {
        background: "var(--background)"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
