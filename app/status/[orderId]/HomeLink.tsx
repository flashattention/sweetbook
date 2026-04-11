"use client";

export default function HomeLink({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	function handleClick(e: React.MouseEvent) {
		e.preventDefault();
		window.location.href = "/";
	}

	return (
		<a href="/" onClick={handleClick} className={className}>
			{children}
		</a>
	);
}
