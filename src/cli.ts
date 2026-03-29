import chalk from 'chalk';
import ora, { type Ora } from 'ora';

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const brand = chalk.cyan.bold;
const dim = chalk.dim;
const success = chalk.green.bold;
const error = chalk.red.bold;
const warn = chalk.yellow.bold;
const info = chalk.blue;
const highlight = chalk.magenta.bold;

// ---------------------------------------------------------------------------
// Launch animation / banner
// ---------------------------------------------------------------------------

export async function printBanner(version: string): Promise<void> {
  // Non-TTY (piped, CI, tests): skip animation, print minimal header
  if (!process.stdout.isTTY) {
    console.log('');
    console.log(brand('  eyeswitch') + dim(`  v${version}`));
    console.log('');
    return;
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // ── eye frames (3 content lines each) ───────────────────────────────────

  const D = chalk.dim.cyan;    // dim border / iris
  const C = chalk.cyan;        // full border
  const W = chalk.white.bold;  // pupil
  const H = chalk.cyan.bold;   // dilated / focused pupil

  const eye = (top: string, mid: string, bot: string): [string, string, string] =>
    [top, mid, bot];

  const PAD = '     ';          // 5-space side padding
  const B17 = '─────────────────'; // 17 dashes → 19-char border with ╭╮

  const frames: [string, string, string][] = [
    // 0 — closed (just a horizontal line)
    eye(
      '',
      PAD + ' ' + D(B17) + ' ' + PAD,
      '',
    ),
    // 1 — cracking open (lids touching)
    eye(
      PAD + C('╭' + B17 + '╮') + PAD,
      PAD + C('╰' + B17 + '╯') + PAD,
      '',
    ),
    // 2 — half-open, no iris
    eye(
      PAD + C('╭' + B17 + '╮') + PAD,
      PAD + C('│') + ' '.repeat(17) + C('│') + PAD,
      PAD + C('╰' + B17 + '╯') + PAD,
    ),
    // 3 — iris appears
    eye(
      PAD + C('╭' + B17 + '╮') + PAD,
      PAD + C('│') + '        ' + D('○') + '        ' + C('│') + PAD,
      PAD + C('╰' + B17 + '╯') + PAD,
    ),
    // 4 — pupil
    eye(
      PAD + C('╭' + B17 + '╮') + PAD,
      PAD + C('│') + '        ' + W('●') + '        ' + C('│') + PAD,
      PAD + C('╰' + B17 + '╯') + PAD,
    ),
    // 5 — focused / dilated
    eye(
      PAD + C('╭' + B17 + '╮') + PAD,
      PAD + C('│') + '        ' + H('◉') + '        ' + C('│') + PAD,
      PAD + C('╰' + B17 + '╯') + PAD,
    ),
  ];

  const delays = [240, 80, 70, 65, 65, 180];
  // Block = 1 blank top + 3 eye lines + 1 title line = 5 rows
  const HEIGHT = 5;

  const renderBlock = ([l0, l1, l2]: [string, string, string], title: string): void => {
    process.stdout.write('\x1b[2K\r\n');            // blank top
    process.stdout.write('\x1b[2K\r' + l0 + '\n'); // eye row 1
    process.stdout.write('\x1b[2K\r' + l1 + '\n'); // eye row 2
    process.stdout.write('\x1b[2K\r' + l2 + '\n'); // eye row 3
    process.stdout.write('\x1b[2K\r' + title + '\n'); // title / blank
  };

  // ── animate ──────────────────────────────────────────────────────────────

  renderBlock(frames[0], '');
  await sleep(delays[0]);

  for (let i = 1; i < frames.length; i++) {
    process.stdout.write(`\x1b[${HEIGHT}A`); // rewind to top of block
    renderBlock(frames[i], '');
    await sleep(delays[i]);
  }

  // Type the title on the bottom line
  process.stdout.write('\x1b[1A\x1b[2K\r'); // go back to title line, clear it
  process.stdout.write('  ');
  for (const char of 'eyeswitch') {
    process.stdout.write(chalk.cyan.bold(char));
    await sleep(32);
  }
  process.stdout.write('  ' + dim(`v${version}`) + '\n\n');
  await sleep(160);
}

// ---------------------------------------------------------------------------
// Semantic output helpers
// ---------------------------------------------------------------------------

export const CLI = {
  success: (msg: string) => console.log(success('✓ ') + msg),
  error: (msg: string) => console.error(error('✗ ') + msg),
  warn: (msg: string) => console.warn(warn('⚠ ') + msg),
  info: (msg: string) => console.log(info('ℹ ') + msg),
  debug: (msg: string) => {
    if (process.env.EYESWITCH_DEBUG) console.log(dim('[debug] ') + dim(msg));
  },
  brand: (msg: string) => console.log(brand(msg)),
  focusSwitch: (from: string | null, to: string) => {
    const fromStr = from ? chalk.dim(from) + ' → ' : '';
    console.log(highlight('⇄ ') + fromStr + chalk.cyan.bold(to));
  },
  calibrationPrompt: (monitorName: string, index: number, total: number) => {
    console.log('');
    console.log(
      chalk.bold(`  [${index}/${total}] `) +
        'Look at ' +
        chalk.cyan.bold(monitorName) +
        ' and press ' +
        chalk.bold('Enter') +
        ' to start sampling…',
    );
  },
  calibrationProgress: (pct: number, spinner: Ora, confidence: number | null = null) => {
    const filled = Math.round(pct * 20);
    const bar =
      chalk.cyan('█').repeat(filled) + chalk.dim('░').repeat(20 - filled);
    const confStr =
      confidence !== null ? chalk.dim(` [face: ${Math.round(confidence * 100)}%]`) : '';
    spinner.text = `  Sampling… ${bar} ${Math.round(pct * 100)}%${confStr}`;
  },
  calibrationResult: (monitorName: string, yaw: number, pitch: number) => {
    console.log(
      success('  ✓ Captured ') +
        chalk.cyan.bold(monitorName) +
        dim(` (yaw: ${yaw.toFixed(1)}°, pitch: ${pitch.toFixed(1)}°)`),
    );
  },
  trackingStatus: (monitorName: string, yaw: number, pitch: number) => {
    process.stdout.write(
      `\r  ${dim('gaze:')} yaw=${chalk.cyan(yaw.toFixed(1).padStart(6))}°` +
        ` pitch=${chalk.cyan(pitch.toFixed(1).padStart(6))}°` +
        `  ${dim('→')} ${chalk.bold(monitorName.padEnd(20))}`,
    );
  },
  newline: () => console.log(''),
  doctorCheck: (label: string, ok: boolean, detail?: string) => {
    const icon = ok ? success('  ✓') : error('  ✗');
    const detailStr = detail ? chalk.dim(`  ${detail}`) : '';
    console.log(`${icon}  ${label.padEnd(28)}${detailStr}`);
  },
} as const;

// ---------------------------------------------------------------------------
// Spinner factory
// ---------------------------------------------------------------------------

export function createSpinner(text: string): Ora {
  return ora({ text, spinner: 'dots' });
}
