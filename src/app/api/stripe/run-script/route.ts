import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const ALLOWED_SCRIPTS = [
  "stripe:view",
  "stripe:add-test-data",
  "stripe:export",
  "stripe:export-pdf",
  "stripe:growth-chart",
  "stripe:sync",
  "stripe:check-trials",
];

export async function POST(req: NextRequest) {
  try {
    const { script } = await req.json();

    if (!script || !ALLOWED_SCRIPTS.includes(script)) {
      return NextResponse.json(
        { error: "Invalid or disallowed script name" },
        { status: 400 }
      );
    }

    const cwd = path.resolve(process.cwd());

    const { stdout, stderr } = await execAsync(`npm run ${script}`, {
      cwd,
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });

    const raw = (stdout || "") + (stderr || "");
    const output = stripAnsi(raw);

    return NextResponse.json({
      success: true,
      output: output.trim() || "✅ Script completed with no output.",
    });
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const raw = ((err.stdout || "") + (err.stderr || "")).trim();
    const output = stripAnsi(raw);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Unknown error",
        output: output || err.message || "Script failed.",
      },
      { status: 500 }
    );
  }
}

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  // Remove ANSI color/style codes
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "")
    .replace(/\x1B\[[0-9;]*m/g, "")
    .replace(/\x1B\[[\d;]*[A-Za-z]/g, "")
    .replace(/\x1b\[[0-9;]*m/gi, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // non-printable chars
    .trim();
}
