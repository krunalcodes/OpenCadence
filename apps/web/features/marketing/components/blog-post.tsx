import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  author,
  formatPostDate,
  getPostContent,
  getRelatedPosts,
  type Post,
} from "@/features/marketing/content/blog";
import { features } from "@/features/marketing/lib/features";

const prose = cn(
  "max-w-[60ch] text-[17px] text-foreground leading-[1.75]",
  "[&_p]:mt-5 [&_p]:text-pretty [&>p:first-child]:mt-0",
  "[&_h2]:mt-14 [&_h2]:scroll-mt-28 [&_h2]:text-balance [&_h2]:font-semibold [&_h2]:text-[1.625rem] [&_h2]:leading-tight [&_h2]:tracking-[-0.02em]",
  "[&_h3]:mt-9 [&_h3]:scroll-mt-28 [&_h3]:font-semibold [&_h3]:text-xl [&_h3]:tracking-[-0.01em]",
  "[&_ol]:mt-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_li]:mt-2.5 [&_li]:pl-1 [&_li]:marker:text-muted-foreground [&_ol>li]:marker:font-mono [&_ol>li]:marker:text-sm",
  "[&_strong]:font-semibold",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/40 [&_a]:underline-offset-4 [&_a]:outline-none [&_a]:hover:decoration-primary [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-ring",
  "[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_figure]:mt-8 [&_figure]:border [&_figure]:border-border [&_figure]:bg-card",
  "[&_figcaption]:flex [&_figcaption]:items-center [&_figcaption]:gap-2 [&_figcaption]:border-border [&_figcaption]:border-b [&_figcaption]:px-4 [&_figcaption]:py-2.5 [&_figcaption]:font-mono [&_figcaption]:text-muted-foreground [&_figcaption]:text-xs [&_figcaption]:leading-5",
  "[&_figcaption]:before:size-[7px] [&_figcaption]:before:shrink-0 [&_figcaption]:before:border [&_figcaption]:before:border-primary [&_figcaption]:before:bg-live [&_figcaption]:before:content-['']",
  "[&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-6",
  "[&_figure>div]:overflow-x-auto [&_table]:w-full [&_table]:min-w-[28rem] [&_table]:border-collapse [&_table]:text-left [&_table]:text-[15px] [&_table]:leading-6",
  "[&_th]:border-border [&_th]:border-b [&_th]:px-4 [&_th]:py-2.5 [&_th]:font-mono [&_th]:font-normal [&_th]:text-muted-foreground [&_th]:text-xs",
  "[&_td]:border-border-subtle [&_td]:border-b [&_td]:px-4 [&_td]:py-2.5 [&_td]:align-top [&_tr:last-child>td]:border-b-0 [&_td:first-child]:font-mono [&_td:first-child]:text-sm",
  "[&_aside]:mt-8 [&_aside]:border-primary [&_aside]:border-l-2 [&_aside]:bg-muted [&_aside]:px-5 [&_aside]:py-4 [&_aside]:font-medium [&_aside]:text-lg [&_aside]:leading-relaxed [&_aside_p]:mt-0",
);

function MetaLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-muted-foreground text-xs">{children}</p>;
}

function BlogPost({ post }: { post: Post }) {
  const content = getPostContent(post.slug);
  const related = getRelatedPosts(post.slug);
  const feature = features.find((item) => item.slug === post.feature);

  if (!content) {
    return null;
  }

  const { Body, sections } = content;

  return (
    <>
      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row px-6 pt-36 pb-12 md:px-10 md:pt-44 md:pb-16">
            <p className="flex items-center gap-2 font-mono text-primary text-xs">
              <span
                aria-hidden="true"
                className="size-[7px] border border-primary bg-live"
              />
              {post.category}
            </p>
            <h1 className="mt-5 max-w-4xl text-balance font-semibold text-4xl tracking-[-0.035em] md:text-6xl md:leading-[1.04]">
              {post.title}
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
              {post.description}
            </p>
            <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-muted-foreground text-xs">
              <span>{author}</span>
              <span aria-hidden="true">/</span>
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              <span aria-hidden="true">/</span>
              <span>{post.readingMinutes} min read</span>
            </p>
          </div>
        </div>
      </section>

      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row grid lg:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="hidden border-border border-r lg:block">
              <div className="sticky top-28 px-10 py-16">
                <nav aria-label="On this page">
                  <MetaLabel>On this page</MetaLabel>
                  <ol className="mt-4 space-y-2.5 text-sm">
                    {sections.map((section) => (
                      <li key={section.id}>
                        <a
                          className="text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          href={`#${section.id}`}
                        >
                          {section.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
                <Link
                  className="mt-10 inline-flex items-center gap-1.5 font-medium text-primary text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  href="/blog"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  All articles
                </Link>
              </div>
            </div>
            <div className="min-w-0 px-6 py-12 md:px-10 md:py-16 lg:px-16">
              <article className={prose}>
                <Body />
              </article>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="keep-reading" className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="flex items-baseline justify-between gap-6 border-border border-b px-6 py-6 md:px-10">
            <h2
              className="font-semibold text-2xl tracking-[-0.02em]"
              id="keep-reading"
            >
              Keep reading
            </h2>
            <Link
              className="font-medium text-primary text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              href="/blog"
            >
              All articles
            </Link>
          </div>
          <div className="mk-row grid md:grid-cols-3">
            {related.map((item) => (
              <Link
                className="group flex min-w-0 flex-col border-border border-b px-6 py-8 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none md:border-r md:border-b-0 md:px-10 md:py-10"
                href={`/blog/${item.slug}`}
                key={item.slug}
              >
                <MetaLabel>{item.category}</MetaLabel>
                <h3 className="mt-3 text-balance font-semibold text-xl tracking-[-0.02em] group-hover:text-primary">
                  {item.title}
                </h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  {item.description}
                </p>
                <p className="mt-auto pt-6 font-mono text-muted-foreground text-xs">
                  <time dateTime={item.date}>{formatPostDate(item.date)}</time>
                  <span aria-hidden="true" className="mx-2">
                    /
                  </span>
                  {item.readingMinutes} min read
                </p>
              </Link>
            ))}
            {feature ? (
              <Link
                className="group mk-hatch flex min-w-0 flex-col px-6 py-8 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none md:px-10 md:py-10"
                href={feature.href}
              >
                <MetaLabel>Feature</MetaLabel>
                <h3 className="mt-3 font-semibold text-xl tracking-[-0.02em] group-hover:text-primary">
                  {feature.title}
                </h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  {feature.description}
                </p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-6 font-medium text-primary text-sm">
                  See how it works
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </span>
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}

export { BlogPost };
