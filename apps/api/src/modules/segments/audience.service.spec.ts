import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import {
  listsLabel,
  maxAudienceLists,
  parseAudience,
} from "./audience.service";

function failure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpException) {
      return error.getResponse() as {
        statusCode: number;
        code: string;
        field?: string;
      };
    }
    throw error;
  }
  throw new Error("Expected a validation error.");
}

describe("parseAudience", () => {
  it("accepts every contact", () => {
    expect(parseAudience({ type: "all", listIds: ["ignored"] })).toEqual({
      type: "all",
    });
  });

  it("lower-cases and de-duplicates list ids, keeping their order", () => {
    const first = randomUUID();
    const second = randomUUID();
    expect(
      parseAudience({
        type: "lists",
        listIds: [first.toUpperCase(), second, first],
      }),
    ).toEqual({ type: "lists", listIds: [first, second] });
  });

  it("accepts a segment", () => {
    const segmentId = randomUUID();
    expect(
      parseAudience({ type: "segment", segmentId: segmentId.toUpperCase() }),
    ).toEqual({ type: "segment", segmentId });
  });

  it("rejects anything that is not an audience object", () => {
    for (const input of [undefined, null, "all", 7, [], [{ type: "all" }]]) {
      expect(failure(() => parseAudience(input))).toMatchObject({
        statusCode: 400,
        code: "validation",
        field: "audience",
      });
    }
  });

  it("rejects an unknown type", () => {
    for (const type of [undefined, "", "everyone", "list", 1]) {
      expect(failure(() => parseAudience({ type }))).toMatchObject({
        statusCode: 400,
        code: "validation",
        field: "audience.type",
      });
    }
  });

  it("rejects missing, empty, malformed and oversized list ids", () => {
    const tooMany = Array.from({ length: maxAudienceLists + 1 }, () =>
      randomUUID(),
    );
    for (const listIds of [
      undefined,
      [],
      "not-an-array",
      [randomUUID(), "nope"],
      [7],
      tooMany,
    ]) {
      expect(
        failure(() => parseAudience({ type: "lists", listIds })),
      ).toMatchObject({
        statusCode: 400,
        code: "validation",
        field: "audience.listIds",
      });
    }
    const repeated = Array.from(
      { length: maxAudienceLists + 1 },
      () => tooMany[0],
    );
    expect(parseAudience({ type: "lists", listIds: repeated })).toEqual({
      type: "lists",
      listIds: [tooMany[0]],
    });
  });

  it("rejects a missing or malformed segment id", () => {
    for (const segmentId of [undefined, "", "nope", 7]) {
      expect(
        failure(() => parseAudience({ type: "segment", segmentId })),
      ).toMatchObject({
        statusCode: 400,
        code: "validation",
        field: "audience.segmentId",
      });
    }
  });
});

describe("listsLabel", () => {
  it("names up to three lists", () => {
    expect(listsLabel(["Newsletter"])).toBe("Newsletter");
    expect(listsLabel(["A", "B", "C"])).toBe("A, B, C");
  });

  it("counts the rest", () => {
    expect(listsLabel(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });

  it("says when there are none", () => {
    expect(listsLabel([])).toBe("No lists");
  });
});
