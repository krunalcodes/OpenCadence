import { messageCreatedAt, uuidv7, uuidv7Date, uuidv7Floor } from "./uuid";

describe("uuid helpers", () => {
  it("reads the creation time back from a UUIDv7", () => {
    const date = new Date("2026-10-11T08:30:00.123Z");
    const id = uuidv7(date);
    expect(messageCreatedAt(id)).toEqual(date);
    expect(uuidv7Date(id)).toEqual(date);
  });

  it("refuses ids that are not UUIDv7", () => {
    expect(() =>
      messageCreatedAt("5f1c2c0e-6a3b-4c1d-9e2f-0123456789ab"),
    ).toThrow();
    expect(() => messageCreatedAt("nope")).toThrow();
  });

  it("builds the lowest id for a moment in time", () => {
    const date = new Date("2026-10-11T08:30:00.123Z");
    const floor = uuidv7Floor(date);
    expect(uuidv7Date(floor)).toEqual(date);
    expect(floor <= uuidv7(date)).toBe(true);
    expect(uuidv7(new Date(date.getTime() - 1)) < floor).toBe(true);
    expect(floor < uuidv7Floor(new Date(date.getTime() + 1))).toBe(true);
  });
});
