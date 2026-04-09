/**
 * scripts/smoke-test.js
 *
 * 샌드박스 환경에서 대표 템플릿 조합의 발행 가능 여부를 자동으로 검증합니다.
 *
 * 사용법:
 *   node scripts/smoke-test.js
 *
 * 사전 조건:
 *   - .env 에 SWEETBOOK_API_KEY, SWEETBOOK_ENV=sandbox 설정
 *   - Node.js 18+
 */

"use strict";

require("dotenv/config");

const API_KEY = process.env.SWEETBOOK_API_KEY;
const ENV = process.env.SWEETBOOK_ENV || "sandbox";
const BASE_URL =
	ENV === "sandbox"
		? "https://api-sandbox.sweetbook.com/v1"
		: "https://api.sweetbook.com/v1";

const TEST_IMAGE_URL = "https://picsum.photos/seed/smoke/800/600";
const BOOK_SPEC = "SQUAREBOOK_HC";
const NOW = new Date();
const YEAR = String(NOW.getFullYear());
const MONTH = String(NOW.getMonth() + 1).padStart(2, "0");
const DAY = String(NOW.getDate()).padStart(2, "0");
const DATE_LABEL = `${MONTH}.${DAY}`;
const DATE_RANGE = `${YEAR}.${MONTH}.01 - ${YEAR}.${MONTH}.31`;
const MONTH_YEAR = `${YEAR}.${MONTH}`;

// ── 테스트 케이스 정의 ────────────────────────────────────────────────────────
// 각 케이스는 표지 1장 + 내지 3장으로 책을 만들고 삭제합니다.
// coverParams/coverFile: 표지 API에 넘길 parameters와 file 필드명
// contentParams/contentFile: 내지 API에 넘길 parameters와 file 필드명
const TEST_CASES = [
	{
		name: "기본 표지(childName/schoolName) + 기본 내지(monthNum/dayNum/diaryText)",
		coverTemplateUid: "39kySqmyRhhs",
		contentTemplateUid: "46VqZhVNOfAp",
		coverParams: {
			childName: "스모크 테스트",
			schoolName: "Momento",
			volumeLabel: "Vol.1",
			periodText: `${YEAR}.${MONTH}.${DAY}`,
		},
		coverFileField: "coverPhoto",
		contentParams: {
			monthNum: MONTH,
			dayNum: DAY,
			diaryText: "스모크 테스트 일기 본문입니다.",
		},
		contentFileField: "photo",
	},
	{
		name: "subtitle+dateRange 표지 + 빈내지(bookTitle/year/month)",
		coverTemplateUid: "4Fy1mpIlm1ek",
		contentTemplateUid: "6grRwZsJ0GJk",
		coverParams: {
			subtitle: "우리의 소중한 기억",
			dateRange: DATE_RANGE,
		},
		coverFileField: "coverPhoto",
		contentParams: {
			bookTitle: "스모크 테스트",
			year: YEAR,
			month: MONTH,
		},
		contentFileField: "photo",
	},
	{
		name: "dateRange+spineTitle 표지 + dayLabel 내지",
		coverTemplateUid: "4MY2fokVjkeY",
		contentTemplateUid: "79LHkH32MLH1",
		coverParams: {
			dateRange: DATE_RANGE,
			spineTitle: "스모크 테스트",
		},
		coverFileField: "coverPhoto",
		contentParams: {
			dayLabel: DATE_LABEL,
			hasDayLabel: "true",
		},
		contentFileField: "photo",
	},
	{
		name: "title+dateRange 표지 + 날짜+제목+일기 내지",
		coverTemplateUid: "79yjMH3qRPly",
		contentTemplateUid: "33b8MVBTO3Pg",
		coverParams: {
			title: "스모크 테스트",
			dateRange: DATE_RANGE,
		},
		coverFileField: "coverPhoto",
		contentParams: {
			date: DATE_LABEL,
			title: "스모크 테스트",
			diaryText: "스모크 테스트 일기 본문입니다.",
		},
		contentFileField: "photo",
	},
	{
		name: "기본 표지 + monthHeader 구분지(monthYearLabel) + 기본 내지",
		coverTemplateUid: "39kySqmyRhhs",
		separatorTemplateUid: "4B0Nc4myZ17u",
		contentTemplateUid: "46VqZhVNOfAp",
		coverParams: {
			childName: "스모크 테스트",
			schoolName: "Momento",
			volumeLabel: "Vol.1",
			periodText: `${YEAR}.${MONTH}.${DAY}`,
		},
		coverFileField: "coverPhoto",
		separatorParams: {
			monthYearLabel: MONTH_YEAR,
		},
		contentParams: {
			monthNum: MONTH,
			dayNum: DAY,
			diaryText: "스모크 테스트 일기 본문입니다.",
		},
		contentFileField: "photo",
	},
	{
		name: "기본 표지 + 알림장 내지(year/month/dayOfWeek/weather/meal/nap)",
		coverTemplateUid: "39kySqmyRhhs",
		contentTemplateUid: "22cuXuCxZiD0",
		coverParams: {
			childName: "스모크 테스트",
			schoolName: "Momento",
			volumeLabel: "Vol.1",
			periodText: `${YEAR}.${MONTH}.${DAY}`,
		},
		coverFileField: "coverPhoto",
		contentParams: {
			year: YEAR,
			month: MONTH,
			monthNum: MONTH,
			monthNameCapitalized: getMonthName(NOW.getMonth() + 1),
			monthColor: "#3B82F6",
			bookTitle: "스모크 테스트",
			date: DATE_LABEL,
			dayOfWeek: getDayOfWeekEn(NOW),
			dayOfWeekX: getDayOfWeekKo(NOW),
			weather: "맑음",
			meal: "좋음",
			nap: "좋음",
			hasParentComment: "true",
			hasTeacherComment: "true",
			parentComment: "오늘도 즐거운 하루였어요.",
			teacherComment: "활동에 적극적으로 참여했어요.",
			pointColor: "#3B82F6",
		},
		contentFileField: "photo",
	},
];

// ── 유틸 함수 ─────────────────────────────────────────────────────────────────

function getMonthName(month) {
	return [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	][month - 1];
}

function getDayOfWeekEn(date) {
	return [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	][date.getDay()];
}

function getDayOfWeekKo(date) {
	return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
}

async function apiFetch(path, options = {}) {
	const url = `${BASE_URL}${path}`;
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${API_KEY}`,
			...(options.headers || {}),
		},
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = { _raw: text };
	}
	if (!res.ok) {
		const msg =
			json?.message ||
			json?.error ||
			json?.data?.message ||
			text.slice(0, 200);
		throw Object.assign(new Error(`HTTP ${res.status}: ${msg}`), {
			status: res.status,
			body: json,
		});
	}
	return json;
}

async function fetchImageBlob(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
	return res.blob();
}

function buildFormData(params, fileField, blob) {
	const form = new FormData();
	form.append("parameters", JSON.stringify(params));
	if (blob && fileField) {
		form.append(fileField, blob, "image.jpg");
	}
	return form;
}

async function createBook(title) {
	const res = await apiFetch("/Books", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			bookSpecUid: BOOK_SPEC,
			title,
			creationType: "NORMAL",
		}),
	});
	return res?.data?.bookUid || res?.bookUid;
}

async function deleteBook(bookUid) {
	try {
		await apiFetch(`/Books/${bookUid}`, { method: "DELETE" });
	} catch {
		// 삭제 실패는 무시
	}
}

async function applyCover(bookUid, templateUid, params, fileField, blob) {
	const form = buildFormData(params, fileField, blob);
	form.append("templateUid", templateUid);
	await apiFetch(`/Books/${bookUid}/cover`, { method: "POST", body: form });
}

async function addContent(
	bookUid,
	templateUid,
	params,
	fileField,
	blob,
	breakBefore = "page",
) {
	const form = buildFormData(params, fileField, blob);
	form.append("templateUid", templateUid);
	await apiFetch(`/Books/${bookUid}/contents?breakBefore=${breakBefore}`, {
		method: "POST",
		body: form,
	});
}

// ── 메인 실행 ─────────────────────────────────────────────────────────────────

async function main() {
	if (!API_KEY) {
		console.error("❌ SWEETBOOK_API_KEY 미설정. .env 파일을 확인하세요.");
		process.exit(1);
	}

	console.log(`🔧 환경: ${ENV}  (${BASE_URL})`);
	console.log(`📋 테스트 케이스: ${TEST_CASES.length}개\n`);

	const imageBlob = await fetchImageBlob(TEST_IMAGE_URL).catch((err) => {
		console.error("이미지 사전 다운로드 실패:", err.message);
		process.exit(1);
	});

	let passed = 0;
	let failed = 0;
	const results = [];

	for (let i = 0; i < TEST_CASES.length; i++) {
		const tc = TEST_CASES[i];
		const label = `[${i + 1}/${TEST_CASES.length}] ${tc.name}`;
		process.stdout.write(`${label}\n  → `);

		let bookUid = null;
		try {
			bookUid = await createBook(`smoke-${Date.now()}`);
			process.stdout.write(`📚 book=${bookUid}  `);

			// 표지
			await applyCover(
				bookUid,
				tc.coverTemplateUid,
				tc.coverParams,
				tc.coverFileField,
				imageBlob,
			);
			process.stdout.write("표지✅  ");

			// 구분지(선택)
			if (tc.separatorTemplateUid) {
				await addContent(
					bookUid,
					tc.separatorTemplateUid,
					tc.separatorParams,
					null,
					null,
					"page",
				);
				process.stdout.write("구분지✅  ");
			}

			// 내지 3장
			for (let p = 1; p <= 3; p++) {
				await addContent(
					bookUid,
					tc.contentTemplateUid,
					tc.contentParams,
					tc.contentFileField,
					imageBlob,
					"page",
				);
			}
			process.stdout.write("내지✅\n");

			passed++;
			results.push({ label, status: "PASS" });
		} catch (err) {
			process.stdout.write(`\n  ❌ 실패: ${err.message}\n`);
			failed++;
			results.push({ label, status: "FAIL", error: err.message });
		} finally {
			if (bookUid) {
				await deleteBook(bookUid);
			}
		}
	}

	console.log("\n─────────────────────────────────────────────");
	console.log(
		`결과: PASS ${passed} / FAIL ${failed} / TOTAL ${TEST_CASES.length}`,
	);
	if (failed > 0) {
		console.log("\n실패 목록:");
		for (const r of results.filter((r) => r.status === "FAIL")) {
			console.log(`  ✗ ${r.label}`);
			console.log(`    ${r.error}`);
		}
		process.exit(1);
	} else {
		console.log("\n✅ 모든 테스트 통과");
	}
}

main().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
