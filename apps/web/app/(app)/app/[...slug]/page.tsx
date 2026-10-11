import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, pageIcon } from "@/components/app-shell/page-header";
import { findPage } from "@/lib/navigation";

type PlaceholderPageProps = {
  params: Promise<{ slug: string[] }>;
};

export async function generateMetadata({
  params,
}: PlaceholderPageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = findPage(slug.join("/"));

  return {
    title: found
      ? `${found.page.title} · OpenCadence`
      : "Page not found · OpenCadence",
  };
}

export default async function PlaceholderPage({
  params,
}: PlaceholderPageProps) {
  const { slug } = await params;
  const found = findPage(slug.join("/"));

  if (!found) {
    notFound();
  }

  const { page } = found;
  const Icon = pageIcon(page.path);

  return (
    <>
      <PageHeader title={page.title} />
      <Empty className="min-h-[320px] border border-border bg-card/50 px-6 py-12">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="size-9 border border-border bg-card text-primary shadow-xs"
          >
            <Icon strokeWidth={1.6} aria-hidden />
          </EmptyMedia>
          <EmptyTitle className="font-semibold text-foreground text-sm">
            {`${page.title} is not built yet`}
          </EmptyTitle>
          <EmptyDescription className="text-[13px]">
            This screen is part of the shell preview, so there is nothing to
            show here yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
