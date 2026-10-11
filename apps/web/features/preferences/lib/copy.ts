export const copy = {
  metaTitle: "Email preferences",
  fallbackSender: "this sender",
  title: "Email preferences",
  intro: (sender: string, email: string) =>
    `Choose which emails ${sender} sends to ${email}.`,
  listsLegend: "Emails you can get",
  save: "Save preferences",
  pending: "Working on it",
  noLists: {
    body: (sender: string) =>
      `${sender} has no lists you can pick from. You can still stop every marketing email below.`,
  },
  noContact: {
    body: (email: string) =>
      `${email} is not on any list any more, so there is nothing to choose.`,
  },
  saved: {
    title: "Your preferences are saved",
    body: "The changes apply to the next email that is sent.",
  },
  all: {
    title: "You are unsubscribed from everything",
    body: (email: string, sender: string) =>
      `${email} will not get marketing emails from ${sender} any more.`,
    again: "Changed your mind? Tick the emails you want and save.",
    note: "You will still get receipts, password resets and other emails about your account.",
  },
  everything: {
    heading: "Want none of these?",
    action: "Unsubscribe from everything",
    note: "This stops all marketing emails. You will still get receipts, password resets and other emails about your account.",
  },
  invalid: {
    title: "This link does not work any more",
    body: "It may be incomplete, or the email it came from may be too old. Open a newer email and use its preferences link, or reply and ask the sender to change what you get.",
  },
  failed: {
    title: "That did not go through",
    loadTitle: "Your preferences could not be loaded",
    busy: "Too many requests came from your network in the last minute. Wait a minute, then try again.",
    offline:
      "We could not reach the server, so nothing was changed. Check your connection and try again.",
    retryAction: "Try again",
  },
};
