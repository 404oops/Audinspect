export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "pure-black": "#000000",
        "international-blue": "#0050FF",
      },
      // family names with spaces must be quoted or the whole declaration is
      // invalid css ("Exo 2" unquoted parses as the identifier Exo plus 2)
      fontFamily: {
        sans: ['"Exo 2 Variable"', '"Exo 2"', "sans-serif"],
        mono: [
          '"JetBrains Mono Variable"',
          '"JetBrains Mono"',
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      // text-12 / text-14 are used throughout but were never defined, so they
      // silently rendered at the 16px default
      fontSize: {
        12: ["12px", { lineHeight: "16px" }],
        14: ["14px", { lineHeight: "20px" }],
      },
      spacing: {
        4: "4px",
        8: "8px",
        16: "16px",
        24: "24px",
        32: "32px",
        48: "48px",
        64: "64px",
        96: "96px",
      },
      strokeWidth: {
        2: "2px",
      },
      borderWidth: {
        2: "2px",
      },
    },
  },
  plugins: [],
};
