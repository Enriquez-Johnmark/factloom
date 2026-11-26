import { fillTemplate } from '../helpers/text.js';
import { displayName } from '../members/accounts.js';
import { addressFor, channelFor } from './channels.js';
import { TEMPLATES } from './templates.js';

/**
 * Builds a notice of one kind for a member: { channel, to, subject, body }. The subject is null
 * for a text message, which has none.
 */
export function composeNotice(kind, { member, values }) {
  const template = TEMPLATES[kind];
  if (template === undefined) throw new Error(`Unknown notice kind ${kind}`);
  const channel = channelFor(member);
  return {
    channel,
    to: addressFor(member, channel),
    subject: channel === 'email' ? template.subject : null,
    body: fillTemplate(template.body, { name: displayName(member), ...values }),
  };
}
