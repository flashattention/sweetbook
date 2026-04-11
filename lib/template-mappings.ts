/**
 * template-mappings.ts
 *
 * 템플릿 UID별 텍스트 파라미터 고정 매핑 테이블.
 * publish/route.ts의 핵심 로직과 분리하여 관리 편의성을 높입니다.
 *
 * 새 템플릿 추가 시 이 파일의 TEMPLATE_UID_TEXT_OVERRIDES 상수만 수정하면 됩니다.
 */

export type TemplateKind = "cover" | "content";

export interface TemplateProjectContext {
	title: string;
	coverCaption: string | null;
	synopsis: string | null;
	storyCharacters: string | null;
	genre: string | null;
	bookSpecUid: string | null;
	projectType: string;
}

export interface TemplatePageContext {
	pageOrder: number;
	caption: string;
}

export interface TemplateTextRuntimeContext {
	templateUid: string;
	templateName: string;
	templateKind: TemplateKind;
	project: TemplateProjectContext;
	page?: TemplatePageContext;
	createdDate: Date;
	periodText: string;
	year: string;
	month: string;
	monthPadded: string;
	dayOfMonth: string;
	pageNumber: string;
	pageNumberPadded: string;
	monthNameCapitalized: string;
	monthYearLabel: string;
	dateLabel: string;
	dateRange: string;
	fallbackText: string;
	coverSubtitle: string;
	spineTitle: string;
	dayOfWeek: string;
	dayOfWeekKorean: string;
	monthColor: string;
	pointColor: string;
}

export type TemplateOverrideValue =
	| string
	| ((runtime: TemplateTextRuntimeContext) => string);

export type TemplateUidTextRule = Record<string, TemplateOverrideValue>;

export function pickFirstString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) {
			return value;
		}
	}
	return null;
}

function estimateDateLabelVisualWidth(label: string): number {
	const text = String(label || "");
	let width = 0;
	for (const ch of text) {
		// Hangul/CJK glyphs are typically wider than latin digits or punctuation.
		if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龥]/.test(ch)) {
			width += 24;
		} else if (/\d/.test(ch)) {
			width += 12;
		} else if (/\s/.test(ch)) {
			width += 8;
		} else {
			width += 10;
		}
	}
	return width;
}

function computeDayOfWeekX(dateLabel: string): string {
	const baseX = 300;
	const gap = 14;
	const width = estimateDateLabelVisualWidth(dateLabel);
	return String(baseX + width + gap);
}

function buildTemplateUidTextOverrides(): Record<string, TemplateUidTextRule> {
	const map: Record<string, TemplateUidTextRule> = {};
	const assign = (uids: string[], rule: TemplateUidTextRule) => {
		for (const uid of uids) {
			map[uid] = rule;
		}
	};

	// ── 표지: childName / schoolName / volumeLabel / periodText ──────────────
	assign(["39kySqmyRhhs", "7ku8dliMDsch", "idbMArRHrKTo"], {
		childName: (runtime) => runtime.project.title,
		schoolName: "Momento",
		volumeLabel: "Vol.1",
		periodText: (runtime) => runtime.periodText,
	});

	// ── 표지: dateRange + spineTitle ─────────────────────────────────────────
	assign(["4MY2fokVjkeY", "71f3baDvjGkQ", "4QNiQs0CmBNZ"], {
		dateRange: (runtime) => runtime.dateRange,
		spineTitle: (runtime) => runtime.spineTitle,
	});

	// ── 표지: subtitle + dateRange ───────────────────────────────────────────
	assign(
		[
			"4Fy1mpIlm1ek",
			"6OhURGHdlI6y",
			"1Es0DP4oARn8",
			"1dTGvR4NivrD",
			"3S1ceGaglj5i",
			"ZMO2mMvk3fin",
			"41U3TvRGNqyU",
			"3LOb3hWAxSjQ",
			"7CO28K1SttwL",
		],
		{
			subtitle: (runtime) => runtime.coverSubtitle,
			dateRange: (runtime) => runtime.dateRange,
		},
	);

	// ── 표지: title + dateRange ──────────────────────────────────────────────
	assign(["79yjMH3qRPly", "3sVKHg6kk7w0", "31LOxBQzsVwo"], {
		title: (runtime) => runtime.project.title,
		dateRange: (runtime) => runtime.dateRange,
	});

	// ── 내지 a: monthNum / dayNum / diaryText ────────────────────────────────
	assign(["46VqZhVNOfAp", "3EM5xgRpQhK1", "3nWJ4wtPSQOb"], {
		monthNum: (runtime) => runtime.monthPadded,
		dayNum: (runtime) => runtime.pageNumberPadded,
		diaryText: (runtime) => runtime.fallbackText,
	});

	// ── 내지 b: monthNum / dayNum / diaryText (갤러리형 포함) ────────────────
	assign(["6fWlpfO42nV3", "3mjKd8kcaVzT", "5B4ds6i0Rywx"], {
		monthNum: (runtime) => runtime.monthPadded,
		dayNum: (runtime) => runtime.pageNumberPadded,
		diaryText: (runtime) => runtime.fallbackText,
	});

	// ── 빈내지: bookTitle / year / month ─────────────────────────────────────
	assign(
		[
			"6grRwZsJ0GJk",
			"1GtF7gRSeKAX",
			"5u1tq5WzYsOO",
			"2lpHl6oLAYss",
			"6MlSfJt0VwJT",
			"269L7PAwTUSS",
			"cDbVR3GSFDE9",
			"6h1Zcwn00pGO",
			"3tQ8WjQZOgId",
		],
		{
			bookTitle: (runtime) => runtime.project.title,
			year: (runtime) => runtime.year,
			month: (runtime) => runtime.month,
		},
	);

	// ── dayLabel 내지: dayLabel + hasDayLabel ────────────────────────────────
	assign(["79LHkH32MLH1", "1XtN1225R7wN", "5ADDkCtrodEJ"], {
		dayLabel: (runtime) => runtime.dateLabel,
		hasDayLabel: "true",
	});

	// ── monthHeader 구분지: monthYearLabel ───────────────────────────────────
	assign(["4B0Nc4myZ17u", "7kV0VVvWlwNI", "50f9kmXxelPG"], {
		monthYearLabel: (runtime) => runtime.monthYearLabel,
	});

	// ── dateLabel 내지 ───────────────────────────────────────────────────────
	assign(["6vUcK4Efowmh", "jZJCsrTDnTY0", "eNxNlWKPdlZn"], {
		dateLabel: (runtime) => runtime.dateLabel,
	});

	// ── dateA/B 내지: dayLabel ───────────────────────────────────────────────
	assign(["3T09l6GEd0AL", "1UbWOuoHeNkF", "5NOAvNYRxKVM"], {
		dayLabel: (runtime) => runtime.dateLabel,
	});

	// ── dateA/B 내지: monthYearLabel ─────────────────────────────────────────
	assign(["1vuzMfUnCkXS", "5ZpsyEJW5PZW", "4UJiQc6ZJzvX"], {
		monthYearLabel: (runtime) => runtime.monthYearLabel,
	});

	// ── 날짜+제목+일기 내지 ──────────────────────────────────────────────────
	assign(
		[
			"33b8MVBTO3Pg",
			"4Bew6giLhZp6",
			"2qld1DLewXv9",
			"58edh76I0rYa",
			"3DGPZzdQwVKE",
			"2NnpiJDM5Dar",
			"2R8uMwVgTrpc",
			"3FhSEhJ94c0T",
			"vHA59XPPKqak",
		],
		{
			date: (runtime) => runtime.dateLabel,
			title: (runtime) => runtime.project.title,
			diaryText: (runtime) => runtime.fallbackText,
		},
	);

	// ── 갤러리 내지 ──────────────────────────────────────────────────────────
	assign(
		[
			"ebGpPDmn6EJ5",
			"msFsr6Ult7qw",
			"79onaaAr56X7",
			"bclIBHO30JTf",
			"y5Ih0Uo7tuQ3",
			"6c2HU8tipz1l",
		],
		{
			monthNum: (runtime) => runtime.monthPadded,
			dayNum: (runtime) => runtime.pageNumberPadded,
			date: (runtime) => runtime.dateLabel,
		},
	);

	// ── 알림장 / 복합 내지 ───────────────────────────────────────────────────
	assign(
		[
			"22cuXuCxZiD0",
			"24i8WZm836UJ",
			"1Tjgb7UpvetN",
			"2rSDdrabgqlr",
			"1aHHt1g7uHjw",
			"4OfPX6DXS0zU",
			"4slyauW5rkUE",
			"7o7MwAUT5qCY",
			"6YuhM8awvNsQ",
			"1lAx3XrHlrTt",
			"4IIoG68v4M8I",
			"Bg9bEPX3zQll",
			"YAIzgKC8ihEk",
			"4L7iSJfutQGm",
			"5GrAypwGbUgI",
			"3A5rJSXRRUeT",
			"2Ndy5Kgd8Oj5",
			"kEVfcU6Aa0Qo",
			"6Ly3CJrHodJv",
		],
		{
			year: (runtime) => runtime.year,
			month: (runtime) => runtime.month,
			monthNum: (runtime) => runtime.monthPadded,
			monthNameCapitalized: (runtime) => runtime.monthNameCapitalized,
			monthColor: (runtime) => runtime.monthColor,
			bookTitle: (runtime) => runtime.project.title,
			date: (runtime) => runtime.dateLabel,
			dayOfWeek: (runtime) => runtime.dayOfWeek,
			dayOfWeekX: (runtime) => computeDayOfWeekX(runtime.dateLabel),
			weather: "맑음",
			meal: "좋음",
			nap: "좋음",
			weatherLabelX: "52",
			weatherValueX: "176",
			mealLabelX: "52",
			mealValueX: "176",
			napLabelX: "52",
			napValueX: "176",
			hasParentComment: "true",
			hasTeacherComment: "true",
			parentComment: (runtime) =>
				pickFirstString(
					runtime.page?.caption,
					runtime.project.coverCaption,
				) || "오늘도 즐거운 하루였어요.",
			teacherComment: (runtime) =>
				pickFirstString(
					runtime.project.synopsis,
					runtime.project.genre,
				) || "활동에 적극적으로 참여했어요.",
			pointColor: (runtime) => runtime.pointColor,
		},
	);

	return map;
}

/**
 * 템플릿 UID → 필드명 → 값(또는 값 생성 함수) 매핑 테이블.
 * publish/route.ts의 resolveTemplateUidOverrideTextValue() 에서 최우선으로 참조됩니다.
 */
export const TEMPLATE_UID_TEXT_OVERRIDES = buildTemplateUidTextOverrides();
