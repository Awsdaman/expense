import { toLines } from './normalize.js';
import { ignoreReason } from './ignore.js';
import { barqParser, barqTransferParser } from './banks/barq.js';
import { alrajhiParser, alrajhiTransferParser } from './banks/alrajhi.js';
import { snbParser } from './banks/snb.js';

const parsers = [barqParser, barqTransferParser, alrajhiParser, alrajhiTransferParser, snbParser];

export function parseSms(text, opts = {}) {
  const lines = toLines(text);
  if (lines.length === 0) return null;

  const reason = ignoreReason(lines.join('\n'));
  if (reason) return { ignored: true, reason };

  const sender = (opts.sender || '').toUpperCase();
  const hinted = parsers.filter((p) => p.senders.some((s) => sender.includes(s)));
  const rest = parsers.filter((p) => !hinted.includes(p));
  for (const parser of [...hinted, ...rest]) {
    if (parser.match(lines)) return parser.parse(lines);
  }
  return null;
}
