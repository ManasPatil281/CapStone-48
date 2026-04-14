import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6366f1",
          muted: "#a5b4fc",
          dim: "#4f46e5",
          faint: "rgba(99,102,241,0.08)"
        },
        mastery: {
          mastered: "#22c55e",
          progress: "#f59e0b",
          idle: "#94a3b8",
          danger: "#ef4444"
        }
      },
      fontFamily: {
        sans: ["Inter", ...fontFamily.sans],
        mono: ["JetBrains Mono", "Fira Code", ...fontFamily.mono]
      },
      letterSpacing: {
        label: "0.08em"
      },
      boxShadow: {
        "brand-glow": "0 0 24px 0 rgba(99,102,241,0.15)",
        "card": "0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.3)"
      },
      backgroundImage: {
        "grid-subtle": "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)"
      },
      backgroundSize: {
        "grid-32": "32px 32px"
      }
    }
  },
  plugins: []
};

export default config;
