export type SampleWorkspace = {
  id: string;
  name: string;
  initial: string;
  plan: "Free" | "Pro";
};

export const sampleWorkspaces: SampleWorkspace[] = [
  { id: "ws_01northwind", name: "Northwind Studio", initial: "N", plan: "Pro" },
  {
    id: "ws_02harbor",
    name: "Harbor Coffee Roasters",
    initial: "H",
    plan: "Pro",
  },
  { id: "ws_03lumen", name: "Lumen Fitness", initial: "L", plan: "Free" },
  {
    id: "ws_04juniper",
    name: "Juniper Dental Care",
    initial: "J",
    plan: "Pro",
  },
  {
    id: "ws_05tideline",
    name: "Tideline Surf School",
    initial: "T",
    plan: "Free",
  },
  { id: "ws_06marigold", name: "Marigold Bakery", initial: "M", plan: "Free" },
  {
    id: "ws_07fernwood",
    name: "Fernwood Architects",
    initial: "F",
    plan: "Pro",
  },
  {
    id: "ws_08brightside",
    name: "Brightside Pet Clinic",
    initial: "B",
    plan: "Pro",
  },
  {
    id: "ws_09oakline",
    name: "Oakline Furniture Workshop",
    initial: "O",
    plan: "Free",
  },
  {
    id: "ws_10saffron",
    name: "Saffron Table Catering",
    initial: "S",
    plan: "Pro",
  },
];

export const sampleUser = {
  name: "Krunal Shah",
  initials: "KS",
  role: "Owner",
};

export function findSampleWorkspace(id: string) {
  return sampleWorkspaces.find((workspace) => workspace.id === id) ?? null;
}
