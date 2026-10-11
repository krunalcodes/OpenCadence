import "server-only";

import { cache } from "react";
import { apiRequest } from "@/lib/api-server";
import { type Brand, parseBrand } from "@/lib/brand";

export const loadBrand = cache(async (): Promise<Brand | null> => {
  const { status, data } = await apiRequest("/brand");
  return status === 200 ? parseBrand(data) : null;
});
