import { validateContact } from "@/features/marketing/lib/contact";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, errors: { form: "Send the request body as valid JSON." } },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json(
      { ok: false, errors: { form: "Send the form fields as a JSON object." } },
      { status: 400 },
    );
  }

  const honeypot = (body as Record<string, unknown>).website;
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return Response.json({ ok: true });
  }

  const result = validateContact(body);
  if (!result.ok) {
    return Response.json({ ok: false, errors: result.errors }, { status: 400 });
  }

  return Response.json({ ok: true });
}
