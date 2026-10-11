import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPost } from "@/features/marketing/components/blog-post";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { getPost, posts } from "@/features/marketing/content/blog";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} · OpenCadence`,
    description: post.description,
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <BlogPost post={post} />
      <FinalCta />
    </>
  );
}
