export const CREDIT_PACKAGES = [
	{ id: "pack_100", credits: 100, priceKrw: 1000, label: "100 크레딧" },
	{ id: "pack_500", credits: 500, priceKrw: 4500, label: "500 크레딧" },
	{ id: "pack_1000", credits: 1000, priceKrw: 8000, label: "1,000 크레딧" },
	{ id: "pack_3000", credits: 3000, priceKrw: 21000, label: "3,000 크레딧" },
] as const;

export type CreditPackageId = (typeof CREDIT_PACKAGES)[number]["id"];
