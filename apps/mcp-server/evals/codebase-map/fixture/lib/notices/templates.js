/** The text of each kind of notice; {name} and the other placeholders are filled in when it is sent. */
export const TEMPLATES = {
  holdReady: {
    subject: 'Your hold is ready',
    body: 'Hello {name}, "{title}" is waiting for you at {branch}. Please collect it by {deadline}.',
  },
  dueSoon: {
    subject: 'An item is due soon',
    body: 'Hello {name}, "{title}" is due back on {dueOn}. You can renew it online.',
  },
  overdue: {
    subject: 'An item is overdue',
    body: 'Hello {name}, "{title}" was due back on {dueOn}. Please return it to any branch.',
  },
};
