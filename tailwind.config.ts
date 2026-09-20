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
          hover: "hsl(var(--primary-hover))",
          active: "hsl(var(--primary-active))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          hover: "hsl(var(--destructive-hover))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        // `accent` is shadcn's hover fill, so DEFAULT is the palest step of the
        // ramp. The numbered steps are the design system's own 100-900 scale,
        // generated in OKLCH on one shared lightness ramp — reach for a step
        // rather than mixing an ad-hoc tint.
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          // Theme-aware, unlike the numbered steps below: `strong` is the
          // pressed state of an accent tint and `deep` is the accent at text
          // weight. The shared primitives use these, so they follow the
          // register's moss and clay instead of painting it red.
          strong: "hsl(var(--accent-strong))",
          deep: "hsl(var(--accent-deep))",
          100: "#fff2ef",
          200: "#ffe0d9",
          300: "#ffc4b8",
          400: "#ff9783",
          500: "#ff563c",
          600: "#dd2b0f",
          700: "#ae1800",
          800: "#7c1405",
          900: "#4d170e",
        },
        // The accent at full strength — what the design system actually runs
        // red: the active rail marker, a leading section rule, a kicker. It
        // follows the scoped theme, so inside the register it is clay.
        rule: "hsl(var(--rule-accent))",
        ink: {
          100: "#f8f4f4",
          200: "#eae7e7",
          300: "#d7d3d3",
          400: "#bab6b6",
          500: "#9b9797",
          600: "#7d7979",
          700: "#605d5d",
          800: "#444141",
          900: "#2d2b2b",
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
          kicker: "hsl(var(--sidebar-kicker))",
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
      // Modernist barely lifts anything — "nothing floats" — so these are
      // reached for rarely and are softer than Tailwind's defaults. The
      // defaults are replaced rather than added to, so the shadow utilities
      // already scattered through the app land on the system's values.
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        register: "var(--register-shadow)",
      },
      // Modernist is 0px everywhere, but the register sits at 0.75rem, so the
      // steps still have to subtract without going negative — `max()` keeps a
      // 0 radius at 0 instead of resolving to -2px, which some browsers treat
      // as invalid and drop (taking the whole declaration with it).
      borderRadius: {
        lg: "var(--radius)",
        md: "max(0px, calc(var(--radius) - 2px))",
        sm: "max(0px, calc(var(--radius) - 4px))",
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
