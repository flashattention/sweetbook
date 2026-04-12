import nodemailer from "nodemailer";

function getTransporter() {
	const host = process.env.SMTP_HOST;
	const port = Number(process.env.SMTP_PORT || 587);
	const user = process.env.SMTP_USER;
	const pass = process.env.SMTP_PASS;
	const secure = process.env.SMTP_SECURE === "true";

	if (!host || !user || !pass) {
		throw new Error(
			"SMTP 환경변수(SMTP_HOST, SMTP_USER, SMTP_PASS)가 설정되지 않았습니다.",
		);
	}

	return nodemailer.createTransport({
		host,
		port,
		secure,
		auth: { user, pass },
	});
}

export async function sendVerificationEmail(
	email: string,
	code: string,
): Promise<void> {
	const from =
		process.env.SMTP_FROM || `"Dreamcatcher" <${process.env.SMTP_USER}>`;
	const transporter = getTransporter();
	await transporter.sendMail({
		from,
		to: email,
		subject: "[Dreamcatcher] 이메일 인증 코드",
		html: `
			<div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 440px; margin: 0 auto; background: #09090b; border-radius: 16px; padding: 40px; color: #fff;">
				<h1 style="font-size: 22px; font-weight: 800; margin: 0 0 8px;">Dreamcatcher</h1>
				<p style="color: #a1a1aa; font-size: 14px; margin: 0 0 32px;">AI 만화·소설 창작 플랫폼</p>
				<hr style="border: none; border-top: 1px solid #27272a; margin-bottom: 32px;" />
				<p style="font-size: 15px; color: #e4e4e7; margin: 0 0 24px;">아래 인증 코드를 입력해주세요.<br/>코드는 <strong>10분</strong>간 유효합니다.</p>
				<div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px;">
					<span style="font-size: 36px; font-weight: 900; letter-spacing: 12px; color: #a78bfa;">${code}</span>
				</div>
				<p style="font-size: 12px; color: #52525b;">이 이메일을 요청하지 않으셨다면 무시하셔도 됩니다.</p>
			</div>
		`,
	});
}
