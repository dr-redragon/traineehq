import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  future: {
    // Only apply `hover:` styles on pointers that can actually hover.
    //
    // A phone has no hover, so it fakes one: tapping a button leaves it in
    // :hover until you touch something else. On a set of toggle buttons that
    // is not cosmetic — `variant="outline"`'s hover background is very close
    // to the selected `variant="default"`, so the last button you tapped went
    // on looking selected whether it was or not, and the year filters in the
    // reports tab appeared to stick.
    //
    // This is Tailwind v4's default behaviour, brought forward.
    hoverOnlyWhenSupported: true,
  },
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Read through the CSS variables rather than naming the families here,
      // so a scoped palette can swap them: the teaching register sets
      // --font-display to Georgia and everything under `font-display` follows.
      fontFamily: {
        display: ["var(--font-display)", "Sora", "sans-serif"],
        body: ["var(--font-body)", "Manrope", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          muted: "hsl(var(--sidebar-muted))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        // The teaching register's own accents — the deep masthead, the gold
        // rule under it, and the clay it points with. See `.register-theme`
        // in index.css.
        register: {
          deep: "hsl(var(--register-deep))",
          "deep-foreground": "hsl(var(--register-deep-foreground))",
          "deep-muted": "hsl(var(--register-deep-muted))",
          ink: "hsl(var(--register-ink))",
          clay: "hsl(var(--register-clay))",
          "clay-soft": "hsl(var(--register-clay-soft))",
          "clay-ink": "hsl(var(--register-clay-ink))",
          gold: "hsl(var(--register-gold))",
        },
      },
      boxShadow: {
        register: "var(--register-shadow)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "slide-in-left": "slide-in-left 0.3s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
