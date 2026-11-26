import { fillTemplate } from '../helpers/text.js';
import { displayName } from '../members/accounts.js';
import { addressFor, channelFor } from './channels.js';
import { TEMPLATES } from './templates.js';

/** The SMS provider rejects a text message longer than this. */
const SMS_MAX_LENGTH = 160;
const CUT_MARK = '...';

/**
 * Builds a notice of one kind for a member: { channel, to, subject, body }. The subject is null
 * for a text message, which has none, and its body is cut to what the SMS provider accepts.
 */
export function composeNotice(kind, { member, values }) {
  const template = TEMPLATES[kind];
  if (template === undefined) throw new Error(`Unknown notice kind ${kind}`);
  const channel = channelFor(member);
  const body = fillTemplate(template.body, { name: displayName(member), ...values });
  return {
    channel,
    to: addressFor(member, channel),
    subject: channel === 'email' ? template.subject : null,
    body: channel === 'sms' ? shortenForSms(body) : body,
  };
}

function shortenForSms(text) {
  if (text.length <= SMS_MAX_LENGTH) return text;
  return `${text.slice(0, SMS_MAX_LENGTH - CUT_MARK.length)}${CUT_MARK}`;
}
