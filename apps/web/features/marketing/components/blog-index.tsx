import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  author,
  formatPostDate,
  type Post,
  posts,
} from "@/features/marketing/content/blog";
import { PageHero } from "./section";

function PostMeta({ post }: { post: Post }) {
  return (
    <p className="font-mono text-muted-foreground text-xs">
      <time dateTime={post.date}>{formatPostDate(post.date)}</time>
      <span aria-hidden="true" className="mx-2">
        /
      </span>
      {post.readingMinutes} min read
    </p>
  );
}

function CategoryLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-primary text-xs">
      <span
        aria-hidden="true"
        className="size-[7px] border border-primary bg-live"
      />
      {children}
    </p>
  );
}

function LeadPost({ post }: { post: Post }) {
  return (
    <div className="mk-row grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <article className="min-w-0">
        <Link
          className="group flex h-full flex-col px-6 py-12 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none md:px-10 md:py-16"
          href={`/blog/${post.slug}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <CategoryLabel>{post.category}</CategoryLabel>
            <p className="font-mono text-muted-foreground text-xs">Latest</p>
          </div>
          <h2 className="mt-6 max-w-3xl text-balance font-semibold text-3xl tracking-[-0.03em] md:text-5xl md:leading-[1.06]">
            {post.title}
          </h2>
          <p className="mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            {post.description}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <PostMeta post={post} />
            <span className="inline-flex items-center gap-1.5 font-medium text-primary text-sm">
              Read the article
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </span>
          </div>
        </Link>
      </article>
      <div
        aria-hidden="true"
        className="mk-hatch hidden min-w-0 flex-col justify-between border-border border-l p-10 font-mono text-muted-foreground text-xs lg:flex"
      >
        <span>{String(posts.length).padStart(2, "0")} articles</span>
        <span className="font-sans font-semibold text-[7rem] text-primary/15 leading-none tracking-[-0.06em]">
          01
        </span>
        <span>{author}</span>
      </div>
    </div>
  );
}

function PostRow({ post, index }: { post: Post; index: number }) {
  return (
    <li className="border-border border-b last:border-b-0">
      <article>
        <Link
          className="group grid gap-x-8 gap-y-3 px-6 py-8 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-baseline md:px-10 md:py-10"
          href={`/blog/${post.slug}`}
        >
          <div className="flex items-center gap-4 md:block">
            <p
              aria-hidden="true"
              className="font-mono text-muted-foreground text-xs md:mb-2"
            >
              {String(index).padStart(2, "0")}
            </p>
            <CategoryLabel>{post.category}</CategoryLabel>
          </div>
          <div className="min-w-0">
            <h2 className="text-balance font-semibold text-2xl tracking-[-0.02em] group-hover:text-primary md:text-[1.75rem] md:leading-tight">
              {post.title}
            </h2>
            <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">
              {post.description}
            </p>
          </div>
          <div className="flex items-center gap-4 md:justify-end">
            <PostMeta post={post} />
            <ArrowRight
              aria-hidden="true"
              className="hidden size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none md:block"
            />
          </div>
        </Link>
      </article>
    </li>
  );
}

function BlogIndex() {
  const [lead, ...rest] = posts;

  return (
    <>
      <PageHero
        label="Blog"
        lead="Practical guides to deliverability, newsletters, and outreach, written for the people who press send."
        title="How to send email that gets delivered and answered"
      />
      <section aria-label="Articles" className="px-0 sm:px-4">
        <div className="mk-rails">
          {lead ? <LeadPost post={lead} /> : null}
          <div className="mk-row">
            <ul>
              {rest.map((post, index) => (
                <PostRow index={index + 2} key={post.slug} post={post} />
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

export { BlogIndex };
