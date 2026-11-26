/** Returns how a member hears from the library: 'sms' when they chose it and gave a phone number, else 'email'. */
export function channelFor(member) {
  return member.notify === 'sms' && member.phone ? 'sms' : 'email';
}

/** Returns where a notice by this channel goes: the member's phone number or email address. */
export function addressFor(member, channel) {
  return channel === 'sms' ? member.phone : member.email;
}
