"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Project, ShippingInfo } from "@/types";

interface Props {
	project: Project;
}

function formatPhone(raw: string): string {
	const digits = raw.replace(/\D/g, "").slice(0, 11);
	if (digits.startsWith("02")) {
		if (digits.length <= 2) return digits;
		if (digits.length <= 5)
			return `${digits.slice(0, 2)}-${digits.slice(2)}`;
		if (digits.length <= 9)
			return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
		return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
	}
	if (digits.length <= 3) return digits;
	if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
	if (digits.length <= 10)
		return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
	return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function toValidPrice(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

export default function OrderClient({ project }: Props) {
	const router = useRouter();
	const [estimate, setEstimate] = useState<{
		totalPrice: number;
		unitPrice: number | null;
		shippingFee: number;
		currency: string;
	} | null>(null);
	const [estimating, setEstimating] = useState(false);
	const [ordering, setOrdering] = useState(false);
	const [error, setError] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [shipping, setShipping] = useState<ShippingInfo>({
		recipientName: project.title || "수령인",
		recipientPhone: "",
		postalCode: "",
		address1: "",
		address2: "",
		shippingMemo: "부재 시 경비실에 맡겨주세요",
	});
	const estimateHint = !project.bookUid
		? "출판이 완료되지 않아 견적을 조회할 수 없습니다. 메인에서 '출판 재시도'를 눌러주세요."
		: !estimating && !estimate
			? "샌드박스 견적 조회에 실패했습니다. 잠시 후 다시 시도해 주세요."
			: "";

	// 가격 견적 조회
	useEffect(() => {
		if (!project.bookUid) return;
		setEstimating(true);
		setEstimate(null);
		fetch("/api/orders/estimate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ bookUid: project.bookUid, quantity }),
		})
			.then((r) => r.json())
			.then((j) => {
				if (!j?.success) return;
				const price = toValidPrice(j?.data?.totalPrice);
				if (price === null) return;
				const unitPrice = toValidPrice(j?.data?.unitPrice);
				const shippingFee = toValidPrice(j?.data?.shippingFee) ?? 0;
				setEstimate({
					totalPrice: price,
					unitPrice,
					shippingFee,
					currency:
						typeof j?.data?.currency === "string"
							? j.data.currency
							: "KRW",
				});
			})
			.finally(() => setEstimating(false));
	}, [project.bookUid, quantity]);

	async function handleOrder(e: React.FormEvent) {
		e.preventDefault();
		if (!project.bookUid) {
			setError(
				"출판이 완료되지 않아 주문할 수 없습니다. 메인에서 '출판 재시도'를 진행해 주세요.",
			);
			return;
		}
		setOrdering(true);
		setError("");
		try {
			const res = await fetch("/api/orders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: project.id,
					bookUid: project.bookUid,
					quantity,
					shipping,
				}),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || "주문 실패");
			router.push(`/status/${json.data.orderUid}`);
		} catch (err: unknown) {
			setError(
				err instanceof Error
					? err.message
					: "주문 중 오류가 발생했습니다.",
			);
		} finally {
			setOrdering(false);
		}
	}

	const coverImage =
		project.coverImageUrl ||
		project.pages[0]?.imageUrl ||
		`https://picsum.photos/seed/${project.id}/400/300`;

	const createdDate = new Date(project.createdAt).toLocaleDateString(
		"ko-KR",
		{
			year: "numeric",
			month: "long",
			day: "numeric",
		},
	);
	const unitPriceText =
		estimate?.unitPrice != null
			? ` (개당 ${estimate.unitPrice.toLocaleString()}원)`
			: "";

	return (
		<div className="min-h-screen bg-zinc-950 p-6">
			<div className="max-w-4xl mx-auto">
				<div className="mb-6">
					<div className="flex items-center justify-between gap-3">
						<a
							href={`/view/${project.id}`}
							className="text-violet-400 text-sm hover:underline"
						>
							← 보기로 돌아가기
						</a>
						<a
							href={`/editor/${project.id}`}
							className="text-sm font-semibold text-violet-400 hover:text-violet-300"
						>
							✏️ 수정하기
						</a>
					</div>
					<h1 className="text-3xl font-bold text-white mt-3">
						주문하기
					</h1>
				</div>

				<div className="grid md:grid-cols-2 gap-6">
					{/* ─── 왼쪽: 포토북 요약 ─── */}
					<div className="bg-zinc-900 rounded-2xl shadow-sm border border-white/[0.08] overflow-hidden">
						<div className="relative h-56">
							<Image
								src={coverImage}
								alt={project.title}
								fill
								className="object-cover"
								unoptimized
							/>
							<div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
							<div className="absolute bottom-4 left-4 text-white">
								<p className="font-serif text-xl font-bold">
									{project.title}
								</p>
								<p className="text-sm text-white/80">
									{project.projectType === "COMIC"
										? "만화책"
										: project.projectType === "NOVEL"
											? "소설"
											: "자유 주제 포토북"}
								</p>
							</div>
						</div>
						<div className="p-5 space-y-3">
							<InfoRow label="생성일" value={createdDate} />
							<InfoRow
								label="페이지 수"
								value={`${project.pages.length}p`}
							/>
							<InfoRow
								label="판형"
								value="정사각형 양장본 (스퀘어북 HC)"
							/>
							{project.bookUid && (
								<InfoRow
									label="Book UID"
									value={project.bookUid.slice(0, 20) + "…"}
									mono
								/>
							)}

							{/* 수량 */}
							<div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
								<span className="text-sm font-semibold text-zinc-300">
									수량
								</span>
								<div className="flex items-center gap-2">
									<button
										onClick={() =>
											setQuantity((q) =>
												Math.max(1, q - 1),
											)
										}
										className="w-7 h-7 rounded-full border border-white/[0.1] text-zinc-400 hover:border-violet-500 text-sm"
									>
										-
									</button>
									<span className="text-sm font-bold w-6 text-center text-white">
										{quantity}
									</span>
									<button
										onClick={() =>
											setQuantity((q) => q + 1)
										}
										className="w-7 h-7 rounded-full border border-white/[0.1] text-zinc-400 hover:border-violet-500 text-sm"
									>
										+
									</button>
								</div>
							</div>

							<div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
								<span className="text-sm text-zinc-400">
									수량{unitPriceText}
								</span>
								<span className="text-sm font-semibold text-zinc-200">
									{quantity}개
								</span>
							</div>

							<div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
								<span className="text-sm text-zinc-400">
									배송비
								</span>
								<span className="text-sm font-semibold text-zinc-200">
									{estimate
										? `${estimate.shippingFee.toLocaleString()}원`
										: "—"}
								</span>
							</div>

							{/* 가격 */}
							<div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
								<span className="text-sm font-semibold text-zinc-300">
									실제 샌드박스 견적
								</span>
								<span className="text-lg font-bold text-violet-400">
									{estimating
										? "조회 중…"
										: estimate
											? `${estimate.totalPrice.toLocaleString()}원`
											: !project.bookUid
												? "(출판 미완료: Book UID 없음)"
												: "—"}
								</span>
							</div>
							{estimateHint ? (
								<p className="text-xs text-amber-400 pt-1 border-t border-white/[0.06]">
									{estimateHint}
								</p>
							) : null}
						</div>
					</div>

					{/* ─── 오른쪽: 배송 정보 ─── */}
					<div className="bg-zinc-900 rounded-2xl shadow-sm border border-white/[0.08] p-6">
						<h2 className="text-lg font-bold text-white mb-5">
							배송 정보
						</h2>
						<form onSubmit={handleOrder} className="space-y-4">
							<Field
								label="받는 분"
								name="recipientName"
								value={shipping.recipientName}
								onChange={(v) =>
									setShipping((s) => ({
										...s,
										recipientName: v,
									}))
								}
								required
							/>
							<Field
								label="연락처"
								name="recipientPhone"
								type="tel"
								placeholder="010-0000-0000"
								value={shipping.recipientPhone}
								onChange={(v) =>
									setShipping((s) => ({
										...s,
										recipientPhone: formatPhone(v),
									}))
								}
								required
							/>
							<Field
								label="우편번호"
								name="postalCode"
								placeholder="예: 06100"
								value={shipping.postalCode}
								onChange={(v) =>
									setShipping((s) => ({
										...s,
										postalCode: v,
									}))
								}
								required
							/>
							<Field
								label="주소"
								name="address1"
								placeholder="시/도, 구/군, 도로명 주소"
								value={shipping.address1}
								onChange={(v) =>
									setShipping((s) => ({ ...s, address1: v }))
								}
								required
							/>
							<Field
								label="상세 주소"
								name="address2"
								placeholder="동/호수, 층"
								value={shipping.address2}
								onChange={(v) =>
									setShipping((s) => ({ ...s, address2: v }))
								}
							/>
							<Field
								label="배송 메모"
								name="shippingMemo"
								placeholder="부재 시 요청사항"
								value={shipping.shippingMemo || ""}
								onChange={(v) =>
									setShipping((s) => ({
										...s,
										shippingMemo: v,
									}))
								}
							/>

							{error && (
								<div className="bg-red-900/20 border border-red-800/30 text-red-400 text-sm px-4 py-3 rounded-lg">
									{error}
								</div>
							)}

							<button
								type="submit"
								disabled={ordering}
								className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors mt-2"
							>
								{ordering
									? "주문 처리 중..."
									: `💳 주문하기${estimate ? ` (${estimate.totalPrice.toLocaleString()}원)` : ""}`}
							</button>
						</form>
					</div>
				</div>
			</div>
		</div>
	);
}

function InfoRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-sm text-zinc-400">{label}</span>
			<span
				className={`text-sm font-medium text-zinc-200 ${mono ? "font-mono text-xs" : ""}`}
			>
				{value}
			</span>
		</div>
	);
}

function Field({
	label,
	name,
	type = "text",
	placeholder,
	value,
	onChange,
	required,
}: {
	label: string;
	name: string;
	type?: string;
	placeholder?: string;
	value: string;
	onChange: (v: string) => void;
	required?: boolean;
}) {
	return (
		<div>
			<label className="block text-sm font-semibold text-zinc-300 mb-1">
				{label} {required && <span className="text-violet-400">*</span>}
			</label>
			<input
				name={name}
				type={type}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				required={required}
				className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
			/>
		</div>
	);
}
