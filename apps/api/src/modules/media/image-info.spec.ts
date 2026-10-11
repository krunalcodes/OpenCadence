import { inspectImage, safeFileName } from "./image-info";

function png(width: number, height: number) {
  const body = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(body);
  body.writeUInt32BE(13, 8);
  body.write("IHDR", 12, "latin1");
  body.writeUInt32BE(width, 16);
  body.writeUInt32BE(height, 20);
  return body;
}

function jpeg(width: number, height: number) {
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const frame = Buffer.from([
    0xff, 0xc2, 0x00, 0x0b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x11,
    0x00,
  ]);
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, frame]);
}

function gif(width: number, height: number) {
  const body = Buffer.alloc(13);
  body.write("GIF89a", 0, "latin1");
  body.writeUInt16LE(width, 6);
  body.writeUInt16LE(height, 8);
  return body;
}

function webp(chunk: "VP8 " | "VP8L" | "VP8X", width: number, height: number) {
  const body = Buffer.alloc(32);
  body.write("RIFF", 0, "latin1");
  body.writeUInt32LE(24, 4);
  body.write("WEBP", 8, "latin1");
  body.write(chunk, 12, "latin1");
  if (chunk === "VP8X") {
    body.writeUIntLE(width - 1, 24, 3);
    body.writeUIntLE(height - 1, 27, 3);
  } else if (chunk === "VP8L") {
    body[20] = 0x2f;
    body.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  } else {
    body[23] = 0x9d;
    body[24] = 0x01;
    body[25] = 0x2a;
    body.writeUInt16LE(width, 26);
    body.writeUInt16LE(height, 28);
  }
  return body;
}

describe("inspectImage", () => {
  it("reads the type and size of each supported format", () => {
    expect(inspectImage(png(640, 480))).toEqual({
      contentType: "image/png",
      width: 640,
      height: 480,
    });
    expect(inspectImage(jpeg(1200, 630))).toEqual({
      contentType: "image/jpeg",
      width: 1200,
      height: 630,
    });
    expect(inspectImage(gif(88, 31))).toEqual({
      contentType: "image/gif",
      width: 88,
      height: 31,
    });
    for (const chunk of ["VP8 ", "VP8L", "VP8X"] as const) {
      expect(inspectImage(webp(chunk, 300, 200))).toEqual({
        contentType: "image/webp",
        width: 300,
        height: 200,
      });
    }
  });

  it("keeps the type and gives no size when the header is cut short", () => {
    expect(inspectImage(png(10, 10).subarray(0, 12))).toEqual({
      contentType: "image/png",
      width: null,
      height: null,
    });
    expect(inspectImage(jpeg(10, 10).subarray(0, 22))).toEqual({
      contentType: "image/jpeg",
      width: null,
      height: null,
    });
    expect(inspectImage(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0xff]))).toEqual({
      contentType: "image/jpeg",
      width: null,
      height: null,
    });
  });

  it("rejects SVG, HTML, and anything else", () => {
    expect(
      inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(inspectImage(Buffer.from("<!doctype html><script>"))).toBeNull();
    expect(inspectImage(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(inspectImage(Buffer.alloc(0))).toBeNull();
    expect(inspectImage(Buffer.from("RIFF0000WAVEfmt "))).toBeNull();
  });
});

describe("safeFileName", () => {
  it("keeps a clean name and sets the extension from the type", () => {
    expect(safeFileName("Summer%20Sale%20Hero.PNG", "image/png")).toBe(
      "summer-sale-hero.png",
    );
    expect(safeFileName("photo.jpeg", "image/jpeg")).toBe("photo.jpg");
    expect(safeFileName("logo.svg", "image/png")).toBe("logo.png");
    expect(safeFileName("archive.tar.gz", "image/gif")).toBe("archive.tar.gif");
  });

  it("drops paths and characters outside the safe set", () => {
    expect(
      safeFileName(encodeURIComponent("../../etc/passwd"), "image/png"),
    ).toBe("passwd.png");
    expect(
      safeFileName(
        encodeURIComponent("C:\\Users\\a\\é t é.webp"),
        "image/webp",
      ),
    ).toBe("e-t-e.webp");
    expect(
      safeFileName(encodeURIComponent('"><script>.png'), "image/png"),
    ).toBe("script.png");
  });

  it("falls back to a default name", () => {
    expect(safeFileName(undefined, "image/gif")).toBe("image.gif");
    expect(safeFileName("%E0%A4%A", "image/png")).toBe("image.png");
    expect(safeFileName("...", "image/jpeg")).toBe("image.jpg");
    expect(safeFileName(encodeURIComponent("日本語.png"), "image/png")).toBe(
      "image.png",
    );
  });

  it("caps the length", () => {
    const name = safeFileName(`${"a".repeat(500)}.png`, "image/png");
    expect(name).toBe(`${"a".repeat(80)}.png`);
  });
});
