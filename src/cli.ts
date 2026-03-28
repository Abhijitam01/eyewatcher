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
// Banner
// ---------------------------------------------------------------------------

export function printBanner(version: string): void {
  console.log('');
  console.log(brand('  ╔═══════════════════════════╗'));
  console.log(brand('  ║') + '   👁  ' + chalk.cyan.bold('eyeswitch') + '             ' + brand('║'));
  console.log(brand('  ║') + dim(`   v${version}                    `).slice(0, 24) + brand('║'));
  console.log(brand('  ╚═══════════════════════════╝'));
  console.log('');
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
