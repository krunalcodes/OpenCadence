import { describe, expect, it } from "vitest";
import { contactMergeKeys, findMergeTags, renderMergeTags } from "./merge-tags";

describe("findMergeTags", () => {
  it("finds tags with and without whitespace", () => {
    const input = "Hi {{first_name}}, {{ company }} and {{  brand.name  }}.";
    expect(findMergeTags(input)).toEqual([
      {
        raw: "{{first_name}}",
        key: "first_name",
        fallback: null,
        start: 3,
        end: 17,
      },
      {
        raw: "{{ company }}",
        key: "company",
        fallback: null,
        start: 19,
        end: 32,
      },
      {
        raw: "{{  brand.name  }}",
        key: "brand.name",
        fallback: null,
        start: 37,
        end: 55,
      },
    ]);
  });

  it("reads a trimmed fallback and treats an empty one as none", () => {
    expect(
      findMergeTags(
        "{{ first_name | there }}{{last_name|}}{{city|  New York }}",
      ),
    ).toMatchObject([
      { key: "first_name", fallback: "there" },
      { key: "last_name", fallback: null },
      { key: "city", fallback: "New York" },
    ]);
  });

  it("reports positions that slice back to the raw tag", () => {
    const input = "a {{email}} b {{ fields.plan | free }} c";
    for (const tag of findMergeTags(input)) {
      expect(input.slice(tag.start, tag.end)).toBe(tag.raw);
    }
  });

  it("accepts custom field and system keys", () => {
    expect(
      findMergeTags("{{fields.plan_2}} {{unsubscribe_url}}").map(
        (tag) => tag.key,
      ),
    ).toEqual(["fields.plan_2", "unsubscribe_url"]);
  });

  it("ignores keys that do not match the syntax", () => {
    const input =
      "{{First}} {{1st}} {{a.b.c}} {{a.}} {{.a}} {{a b}} {{}} {first_name} {{a-b}}";
    expect(findMergeTags(input)).toEqual([]);
  });

  it("finds the inner tag when braces are doubled up", () => {
    expect(findMergeTags("{{{first_name}}}").map((tag) => tag.key)).toEqual([
      "first_name",
    ]);
  });

  it("returns fresh results on repeated calls", () => {
    expect(findMergeTags("{{email}}")).toHaveLength(1);
    expect(findMergeTags("{{email}}")).toHaveLength(1);
  });
});

describe("renderMergeTags", () => {
  it("replaces tags with values", () => {
    expect(
      renderMergeTags("Hi {{ first_name }} from {{brand.name}}", {
        first_name: "Ada",
        "brand.name": "Northwind",
      }),
    ).toBe("Hi Ada from Northwind");
  });

  it("uses the fallback for a missing, null, or blank value", () => {
    const input = "Hi {{first_name | there}}";
    expect(renderMergeTags(input, {})).toBe("Hi there");
    expect(renderMergeTags(input, { first_name: null })).toBe("Hi there");
    expect(renderMergeTags(input, { first_name: "  " })).toBe("Hi there");
    expect(renderMergeTags(input, { first_name: "Ada" })).toBe("Hi Ada");
  });

  it("renders an empty string when there is no value and no fallback", () => {
    expect(renderMergeTags("Hi {{first_name}}!", {})).toBe("Hi !");
  });

  it("renders numbers and booleans, including zero and false", () => {
    expect(
      renderMergeTags("{{fields.seats|none}} {{fields.active|unknown}}", {
        "fields.seats": 0,
        "fields.active": false,
      }),
    ).toBe("0 false");
  });

  it("does not escape by default", () => {
    expect(renderMergeTags("{{company}}", { company: "A & B <Co>" })).toBe(
      "A & B <Co>",
    );
  });

  it("escapes values and fallbacks for html", () => {
    expect(
      renderMergeTags(
        '<p>{{company}} {{city | <b>"here"</b>}}</p>',
        { company: "A & B <script>'x'</script>" },
        { escape: "html" },
      ),
    ).toBe(
      "<p>A &amp; B &lt;script&gt;&#39;x&#39;&lt;/script&gt; &lt;b&gt;&quot;here&quot;&lt;/b&gt;</p>",
    );
  });

  it("does not render tags that arrive inside a value", () => {
    expect(
      renderMergeTags("{{first_name}}", {
        first_name: "{{email}}",
        email: "ada@example.com",
      }),
    ).toBe("{{email}}");
  });

  it("ignores inherited properties of the values object", () => {
    expect(renderMergeTags("{{constructor|x}} {{to_string|y}}", {})).toBe(
      "x y",
    );
  });

  it("leaves text that is not a tag untouched", () => {
    const input = "{{ Not A Tag }} and { single } and {{a.b.c}}";
    expect(renderMergeTags(input, { a: "1" })).toBe(input);
  });
});

describe("contactMergeKeys", () => {
  it("lists the contact keys from the contract", () => {
    expect(contactMergeKeys).toEqual([
      "email",
      "first_name",
      "last_name",
      "company",
      "job_title",
      "phone",
      "city",
      "country",
    ]);
  });
});
