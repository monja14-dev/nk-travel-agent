/** @type {import('tailwindcss').Config} */
// Phase 7 (UI): Smart Travel Command Center design tokens.
// Single dark-navy theme — the app does not switch to a light theme, so
// these are applied directly (not behind Tailwind's `dark:` variant).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          bg: "#101B2B", // page background
          surface: "#1B293B", // card / panel background
          elevated: "#223247", // raised surfaces (modals, dropdowns, hovered rows)
          border: "#344155", // hairlines, dividers, input borders
        },
        ink: {
          DEFAULT: "#F5F7FA", // primary text on navy
          muted: "#AAB8C9", // secondary text, captions, labels
          faint: "#91A0B5", // tertiary / disabled text
        },
        accent: {
          DEFAULT: "#D5B67B", // champagne gold — primary accent, CTAs, active states
          hover: "#E2C793",
          muted: "#8A764F", // gold on its own dark surface (icons, subtle highlights)
        },
        success: { DEFAULT: "#5FBF8A", bg: "#17301F", text: "#9BE6B8" },
        warning: { DEFAULT: "#E0B255", bg: "#352708", text: "#F0C97E" },
        danger: { DEFAULT: "#E2706E", bg: "#331514", text: "#F0A3A1" },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)",
        float: "0 12px 32px -8px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
