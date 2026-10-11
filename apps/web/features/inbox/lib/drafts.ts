const prefix = "opencadence:inbox:draft:";

export function readDraft(threadId: string) {
  try {
    return window.sessionStorage.getItem(`${prefix}${threadId}`) ?? "";
  } catch {
    return "";
  }
}

export function writeDraft(threadId: string, text: string) {
  try {
    if (text === "") {
      window.sessionStorage.removeItem(`${prefix}${threadId}`);
    } else {
      window.sessionStorage.setItem(`${prefix}${threadId}`, text);
    }
  } catch {
    return;
  }
}
