import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import {
	randomBytes,
	scrypt as scryptCallback,
	timingSafeEqual,
	createHmac,
} from "crypto";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "sb_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

export interface AuthUser {
	id: string;
	email: string;
	name: string | null;
}

interface SessionPayload {
	uid: string;
	exp: number;
}

function getAuthSecret(): string {
	const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
	if (secret && secret.length >= 16) {
		return secret;
	}
	if (process.env.NODE_ENV === "production") {
		throw new Error("AUTH_SECRET must be set in production.");
	}
	return "dev-only-auth-secret-change-me";
}

function base64UrlEncode(input: string | Buffer): string {
	return Buffer.from(input)
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	return Buffer.from(padded, "base64").toString("utf8");
}

function signPayload(payloadB64: string): string {
	return createHmac("sha256", getAuthSecret())
		.update(payloadB64)
		.digest("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

export function createSessionToken(userId: string): string {
	const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
	const payload: SessionPayload = { uid: userId, exp };
	const payloadB64 = base64UrlEncode(JSON.stringify(payload));
	const signature = signPayload(payloadB64);
	return `${payloadB64}.${signature}`;
}

export function verifySessionToken(
	token: string | null | undefined,
): SessionPayload | null {
	if (!token) {
		return null;
	}
	const [payloadB64, signature] = token.split(".");
	if (!payloadB64 || !signature) {
		return null;
	}

	const expected = signPayload(payloadB64);
	const sigBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);
	if (sigBuffer.length !== expectedBuffer.length) {
		return null;
	}
	if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
		return null;
	}

	try {
		const decoded = JSON.parse(
			base64UrlDecode(payloadB64),
		) as SessionPayload;
		if (!decoded.uid || !decoded.exp) {
			return null;
		}
		if (decoded.exp < Math.floor(Date.now() / 1000)) {
			return null;
		}
		return decoded;
	} catch {
		return null;
	}
}

export function buildSessionCookieOptions() {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
		maxAge: SESSION_MAX_AGE_SECONDS,
	};
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = (await scrypt(password, salt, 64)) as Buffer;
	return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const [algorithm, saltHex, hashHex] = stored.split("$");
	if (algorithm !== "scrypt" || !saltHex || !hashHex) {
		return false;
	}
	const derived = (await scrypt(
		password,
		Buffer.from(saltHex, "hex"),
		64,
	)) as Buffer;
	const original = Buffer.from(hashHex, "hex");
	if (derived.length !== original.length) {
		return false;
	}
	return timingSafeEqual(derived, original);
}

export async function getAuthUserFromRequest(
	req: NextRequest,
): Promise<AuthUser | null> {
	const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
	const payload = verifySessionToken(token);
	if (!payload) {
		return null;
	}
	const user = await prisma.user.findUnique({
		where: { id: payload.uid },
		select: { id: true, email: true, name: true },
	});
	if (!user) {
		return null;
	}
	return user;
}

export async function getAuthUserFromCookies(): Promise<AuthUser | null> {
	const token = cookies().get(SESSION_COOKIE_NAME)?.value;
	const payload = verifySessionToken(token);
	if (!payload) {
		return null;
	}
	const user = await prisma.user.findUnique({
		where: { id: payload.uid },
		select: { id: true, email: true, name: true },
	});
	if (!user) {
		return null;
	}
	return user;
}

export function isStrongEnoughPassword(password: string): boolean {
	if (typeof password !== "string") {
		return false;
	}
	if (password.length < 8) {
		return false;
	}

	const hasAlphabet = /[A-Za-z]/.test(password);
	const hasNumber = /\d/.test(password);
	const hasSpecial = /[^A-Za-z0-9]/.test(password);

	return hasAlphabet && hasNumber && hasSpecial;
}

export function getPasswordPolicyMessage(): string {
	return "비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 모두 포함해야 합니다.";
}
