import type { Metadata } from "next";
import { FormEditor } from "@/features/forms/components/form-editor";
import { FormUnavailable } from "@/features/forms/components/form-unavailable";
import type { FormBrand } from "@/features/forms/lib/forms";
import {
  getCustomFields,
  getForm,
  getLists,
  getSources,
} from "@/features/forms/queries/forms";
import { brandDefaults } from "@/lib/brand";
import { loadBrand } from "@/lib/brand-server";
import { getActiveWorkspace } from "@/lib/session";

type FormPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Forms · ${workspace.name}` : "Forms",
  };
}

export default async function FormPage({ params }: FormPageProps) {
  const { id } = await params;
  const result = await getForm(id);

  if (result.state !== "ready") {
    return <FormUnavailable />;
  }

  const [brand, lists, sources, customFields] = await Promise.all([
    loadBrand(),
    getLists(),
    getSources(),
    getCustomFields(),
  ]);

  const formBrand: FormBrand = {
    name: brand?.brandName ?? "",
    logoUrl: brand?.logo?.url ?? null,
    primaryColor: brand?.primaryColor ?? brandDefaults.primaryColor,
    backgroundColor: brand?.backgroundColor ?? brandDefaults.backgroundColor,
    contentColor: brand?.contentColor ?? brandDefaults.contentColor,
    textColor: brand?.textColor ?? brandDefaults.textColor,
    fontFamily: brand?.fontFamily ?? brandDefaults.fontFamily,
  };

  return (
    <FormEditor
      key={result.form.id}
      form={result.form}
      brand={formBrand}
      lists={lists}
      sources={sources}
      customFields={customFields}
    />
  );
}
