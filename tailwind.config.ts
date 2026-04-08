import type { Config } from "tailwindcss";

const config: Config = {
	content: [
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			colors: {
				momento: {
					50: "#fff0f6",
					100: "#ffe0ed",
					200: "#ffc2db",
					300: "#ff94bb",
					400: "#ff5594",
					500: "#f43f72",
					600: "#e01a55",
					700: "#bc0f44",
					800: "#9c103b",
					900: "#841136",
				},
			},
			fontFamily: {
				serif: [
					"Georgia",
					"Cambria",
					'"Times New Roman"',
					"Times",
					"serif",
				],
			},
		},
	},
	plugins: [],
};

export default config;
