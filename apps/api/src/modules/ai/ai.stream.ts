const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

function withoutThinking(text: string) {
  const trimmed = text.trimStart();
  if (!trimmed.toLowerCase().startsWith(THINK_OPEN)) {
    return { pending: false, text };
  }
  const end = trimmed.toLowerCase().indexOf(THINK_CLOSE);
  if (end === -1) {
    return { pending: true, text: "" };
  }
  return {
    pending: false,
    text: trimmed.slice(end + THINK_CLOSE.length).trimStart(),
  };
}

function mayStartThinking(text: string) {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.length < THINK_OPEN.length && THINK_OPEN.startsWith(trimmed);
}

export async function* skipThinking(source: AsyncIterable<string>) {
  let buffer = "";
  let started = false;
  for await (const chunk of source) {
    if (started) {
      yield chunk;
      continue;
    }
    buffer += chunk;
    if (mayStartThinking(buffer)) {
      continue;
    }
    const result = withoutThinking(buffer);
    if (result.pending) {
      continue;
    }
    started = true;
    buffer = "";
    if (result.text !== "") {
      yield result.text;
    }
  }
  if (!started) {
    const rest = withoutThinking(buffer);
    if (!rest.pending && rest.text.trim() !== "") {
      yield rest.text;
    }
  }
}

export async function* startAt(source: AsyncIterable<string>, marker: string) {
  let buffer = "";
  let started = false;
  for await (const chunk of source) {
    if (started) {
      yield chunk;
      continue;
    }
    buffer += chunk;
    const index = buffer.lastIndexOf(marker);
    if (index === -1) {
      continue;
    }
    started = true;
    const text = buffer.slice(index);
    buffer = "";
    yield text;
  }
  if (!started) {
    const rest = withoutThinking(buffer);
    if (!rest.pending && rest.text.trim() !== "") {
      yield rest.text;
    }
  }
}

export async function prime(
  source: AsyncGenerator<string>,
): Promise<{ first: string; rest: AsyncGenerator<string> } | null> {
  while (true) {
    const next = await source.next();
    if (next.done) {
      return null;
    }
    if (next.value !== "") {
      return { first: next.value, rest: source };
    }
  }
}
