const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(process.cwd(), "prisma", "dev.db");
const backupDir = path.resolve(process.cwd(), "prisma", "backups");
const keepCount = Number(process.env.DB_BACKUP_KEEP_COUNT || 30);

function timestamp() {
	const now = new Date();
	const pad = (v) => String(v).padStart(2, "0");
	return (
		[now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join(
			"",
		) +
		"-" +
		[
			pad(now.getHours()),
			pad(now.getMinutes()),
			pad(now.getSeconds()),
		].join("")
	);
}

function ensureBackupDir() {
	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}
}

function pruneOldBackups() {
	const files = fs
		.readdirSync(backupDir)
		.filter((name) => /^dev-\d{8}-\d{6}\.db$/.test(name))
		.sort((a, b) => (a < b ? 1 : -1));

	const expired = files.slice(Math.max(keepCount, 0));
	for (const file of expired) {
		fs.rmSync(path.join(backupDir, file));
	}
	return expired.length;
}

function main() {
	if (!fs.existsSync(dbPath)) {
		console.error(`[db:backup] DB file not found: ${dbPath}`);
		process.exit(1);
	}

	ensureBackupDir();

	const fileName = `dev-${timestamp()}.db`;
	const target = path.join(backupDir, fileName);
	fs.copyFileSync(dbPath, target);
	const removed = pruneOldBackups();

	console.log(`[db:backup] created ${target}`);
	if (removed > 0) {
		console.log(`[db:backup] pruned ${removed} old backup(s)`);
	}
}

main();
