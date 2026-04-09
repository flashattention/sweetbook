import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "sb_session";

const protectedPagePrefixes = [
	"/create",
	"/editor",
	"/order",
	"/status",
	"/view",
];
const protectedApiPrefixes = ["/api/projects", "/api/orders", "/api/upload"];

function isProtectedPath(pathname: string, prefixes: string[]) {
	return prefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

export function middleware(req: NextRequest) {
	const { pathname, search } = req.nextUrl;
	const session = req.cookies.get(SESSION_COOKIE_NAME)?.value;
	const hasSession = Boolean(session);

	if (isProtectedPath(pathname, protectedApiPrefixes) && !hasSession) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	if (isProtectedPath(pathname, protectedPagePrefixes) && !hasSession) {
		const loginUrl = req.nextUrl.clone();
		loginUrl.pathname = "/login";
		loginUrl.searchParams.set("next", `${pathname}${search}`);
		return NextResponse.redirect(loginUrl);
	}

	if ((pathname === "/login" || pathname === "/signup") && hasSession) {
		const homeUrl = req.nextUrl.clone();
		homeUrl.pathname = "/";
		homeUrl.search = "";
		return NextResponse.redirect(homeUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/create",
		"/create/:path*",
		"/editor/:path*",
		"/order/:path*",
		"/status/:path*",
		"/view/:path*",
		"/login",
		"/signup",
		"/api/projects/:path*",
		"/api/orders/:path*",
		"/api/upload",
	],
};
