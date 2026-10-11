export const copy = {
  metaTitle: "Email preferences",
  fallbackSender: "this sender",
  ask: {
    titleForList: (listName: string) => `Unsubscribe from ${listName}?`,
    titleForAll: (sender: string) => `Unsubscribe from ${sender}?`,
    address: (email: string) => `These emails are sent to ${email}.`,
    listAction: "Unsubscribe from this list",
    allAction: (sender: string) => `Unsubscribe from all emails from ${sender}`,
    onlyAction: "Unsubscribe",
    allNote:
      "You will still get receipts, password resets and other emails about your account.",
  },
  done: {
    title: "You are unsubscribed",
    list: (email: string, listName: string) =>
      `${email} will not get emails from ${listName} any more.`,
    all: (email: string, sender: string) =>
      `${email} will not get marketing emails from ${sender} any more.`,
    already: (email: string, sender: string) =>
      `${email} is not getting marketing emails from ${sender}.`,
    mistake: "Unsubscribed by mistake?",
    undoAction: "Subscribe again",
  },
  again: {
    title: "You are subscribed again",
    body: (email: string, sender: string) =>
      `${email} will keep getting emails from ${sender}. Nothing else changed.`,
    changeMind: "Changed your mind?",
  },
  invalid: {
    title: "This link does not work any more",
    body: "It may be incomplete, or the email it came from may be too old. To stop the emails, open a newer one and use its unsubscribe link, or reply and ask the sender to remove you.",
  },
  failed: {
    title: "That did not go through",
    busy: "Too many requests came from your network in the last minute. Wait a minute, then try again.",
    offline:
      "We could not reach the server, so nothing was changed. Check your connection and try again.",
    retryAction: "Try again",
  },
  pending: "Working on it",
};
