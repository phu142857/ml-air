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
        // Semantic colors using CSS variables
        'bg-page': 'var(--bg-page)',
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
      }
    }
  },
  plugins: []
};

export default config;
