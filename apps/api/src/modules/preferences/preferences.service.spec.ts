import { describe, expect, it } from "vitest";
import { shownLists } from "./preferences.service";

const catalog = [
  {
    id: "a",
    name: "Internal A",
    isPublic: true,
    publicName: " Weekly news ",
    publicDescription: " Every Friday ",
  },
  {
    id: "b",
    name: "Product updates",
    isPublic: true,
    publicName: null,
    publicDescription: "  ",
  },
  {
    id: "c",
    name: "VIP",
    isPublic: false,
    publicName: "Hidden",
    publicDescription: null,
  },
  {
    id: "d",
    name: "Old customers",
    isPublic: false,
    publicName: null,
    publicDescription: null,
  },
  {
    id: "e",
    name: "Beta",
    isPublic: false,
    publicName: null,
    publicDescription: null,
  },
];

describe("shownLists", () => {
  it("shows public lists and the private ones the contact is subscribed to", () => {
    const lists = shownLists(catalog, {
      lists: [
        { id: "a", name: "Internal A", status: "unsubscribed" },
        { id: "c", name: "VIP", status: "subscribed" },
        { id: "d", name: "Old customers", status: "unsubscribed" },
      ],
    });
    expect(lists).toEqual([
      {
        id: "a",
        name: "Weekly news",
        description: "Every Friday",
        subscribed: false,
        member: true,
      },
      {
        id: "b",
        name: "Product updates",
        description: null,
        subscribed: false,
        member: false,
      },
      {
        id: "c",
        name: "Hidden",
        description: null,
        subscribed: true,
        member: true,
      },
    ]);
  });

  it("shows nothing without a contact", () => {
    expect(shownLists(catalog, null)).toEqual([]);
  });
});
