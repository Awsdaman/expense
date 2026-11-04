// Compiles shortcuts/*.cherri with Cherri, fixes the import questions, signs through HubSign,
// and writes dashboard/shortcuts/*.shortcut for the phone to install.
// Usage: CHERRI=/path/to/cherri node scripts/build-shortcuts.js   (DRY_RUN=1 writes the plists, signs nothing)
// The files hold no URL or token: each Shortcut asks for them when it is added.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'shortcuts');
const OUT = join(ROOT, 'dashboard', 'shortcuts');
const CHERRI = process.env.CHERRI || 'cherri';
const HUBSIGN = 'https://hubsign.routinehub.services/sign';

// Cherri 2.3.0 drops ActionIndex (omitempty on 0, and every question gets 0), so each question is
// pointed at its Text action here, matched by a word in the question and the action's output name.
const QUESTION_TARGETS = [
  { word: 'URL', output: 'url' },
  { word: 'token', output: 'token' },
];

function actionIndexOf(xml, outputName) {
  const actions = xml.split('<key>WFWorkflowActionIdentifier</key>').slice(1);
  const index = actions.findIndex((a) => a.includes(`<key>CustomOutputName</key>\n\t\t\t\t\t<string>${outputName}</string>`));
  if (index < 0) throw new Error(`no action named ${outputName}`);
  return index;
}

function fixQuestions(xml) {
  return xml.replace(/<dict>(\s*<key>Category<\/key>\s*<string>Parameter<\/string>[\s\S]*?)<\/dict>/g, (whole, body) => {
    const target = QUESTION_TARGETS.find((t) => new RegExp(`<key>Text</key>\\s*<string>[^<]*${t.word}`).test(body));
    if (!target) throw new Error('import question without a target');
    return `<dict>\n\t\t\t\t<key>ActionIndex</key>\n\t\t\t\t<integer>${actionIndexOf(xml, target.output)}</integer>${body}</dict>`;
  });
}

async function sign(name, xml) {
  const res = await fetch(HUBSIGN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'cherri/2.3.0' },
    body: JSON.stringify({ shortcutName: name, shortcut: xml }),
  });
  const body = Buffer.from(await res.arrayBuffer());
  if (!res.ok || body.subarray(0, 4).toString() !== 'AEA1') {
    throw new Error(`HubSign failed for ${name}: ${res.status} ${body.subarray(0, 200).toString()}`);
  }
  return body;
}

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.cherri'))) {
  // Cherri writes its debug plist next to the source, so compile a copy in a temp folder.
  const work = mkdtempSync(join(tmpdir(), 'iq-shortcut-'));
  writeFileSync(join(work, file), readFileSync(join(SRC, file)));
  execFileSync(CHERRI, [file, '--skip-sign', '--debug', '--no-ansi'], { cwd: work, stdio: 'pipe' });
  const plist = readdirSync(work).find((f) => f.endsWith('.plist'));
  const name = basename(plist, '.plist');
  let xml = readFileSync(join(work, plist), 'utf8');
  if (xml.includes('WFWorkflowImportQuestions')) xml = fixQuestions(xml);
  if (process.env.DRY_RUN) {
    writeFileSync(join(OUT, `${basename(file, '.cherri')}.plist`), xml);
    console.log(`${name}: plist only (DRY_RUN)`);
    continue;
  }
  const signed = await sign(name, xml);
  // iOS names an added Shortcut after its file, and Log last bank SMS runs "Log Expense" by name.
  const target = join(OUT, `${name}.shortcut`);
  writeFileSync(target, signed);
  console.log(`${name} -> ${target} (${signed.length} bytes)`);
}
