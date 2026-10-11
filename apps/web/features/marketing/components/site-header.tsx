import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@workspace/ui/components/navigation-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Gauge,
  type LucideIcon,
  Mail,
  Menu,
  Plug,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { type Feature, features } from "@/features/marketing/lib/features";
import { links } from "@/features/marketing/lib/links";

const featureIcons: Record<Feature["slug"], LucideIcon> = {
  newsletters: Mail,
  sequences: Workflow,
  transactional: Braces,
  deliverability: Gauge,
  integrations: Plug,
  platform: Users,
};

const groups = (["Send", "Deliver", "Run"] as const).map((label) => ({
  label,
  items: features.filter((feature) => feature.group === label),
}));

const pageLinks = [
  { href: links.pricing, label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: links.contact, label: "Contact" },
] as const;

const sampleRows = [
  { name: "Weekly digest", status: "Sent", live: false },
  { name: "Trial follow-up", status: "Sending", live: true },
  { name: "Password reset", status: "Delivered", live: false },
] as const;

const focusRing =
  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const pillItem =
  "h-9 rounded-full px-3 font-medium text-[14px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus:bg-foreground/5 focus:text-foreground";

const sheetLink =
  "flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium text-[15px] text-foreground transition-colors hover:bg-accent focus-visible:bg-accent";

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-[var(--mk-brand)] text-live"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[15px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12h3l3-8 4 16 3-8h5" />
      </svg>
    </span>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-[12px] text-primary leading-none">
      <span
        aria-hidden="true"
        className="size-[7px] border border-primary bg-live"
      />
      {children}
    </p>
  );
}

function ProductPanel() {
  return (
    <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,15.5rem)] divide-x divide-border overflow-hidden rounded-lg">
      {groups.map((group) => (
        <div key={group.label} className="min-w-0 p-2">
          <div className="px-2.5 pt-3 pb-2.5">
            <GroupLabel>{group.label}</GroupLabel>
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((feature) => {
              const Icon = featureIcons[feature.slug];
              return (
                <li key={feature.slug}>
                  <NavigationMenuLink
                    closeOnClick
                    render={<Link href={feature.href} />}
                    className="items-start gap-3 p-2.5 hover:bg-accent focus:bg-accent"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-primary"
                    >
                      <Icon strokeWidth={1.75} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium text-[14px] text-foreground leading-5">
                        {feature.title}
                      </span>
                      <span className="text-[13px] text-muted-foreground leading-[1.4]">
                        {feature.description}
                      </span>
                    </span>
                  </NavigationMenuLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mk-hatch flex min-w-0 flex-col gap-3 bg-muted/40 p-4">
        <div
          aria-hidden="true"
          className="divide-y divide-border-subtle rounded-md border border-border bg-card"
        >
          {sampleRows.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between gap-2 px-2.5 py-2"
            >
              <span className="min-w-0 truncate text-[12px] text-foreground">
                {row.name}
              </span>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-0.5 font-mono text-[10.5px] leading-none",
                  row.live
                    ? "bg-live text-live-foreground"
                    : "text-muted-foreground",
                )}
              >
                {row.live ? (
                  <span className="size-1.5 rounded-full bg-live-foreground motion-safe:animate-pulse" />
                ) : null}
                {row.status}
              </span>
            </div>
          ))}
        </div>
        <NavigationMenuLink
          closeOnClick
          render={<Link href={links.home} />}
          className="group/fit mt-auto justify-between gap-2 bg-card p-2.5 font-medium text-[14px] text-foreground ring-1 ring-border hover:bg-accent focus:bg-accent"
        >
          See how the pieces fit
          <ArrowRight
            aria-hidden="true"
            strokeWidth={1.75}
            className="text-primary transition-transform group-hover/fit:translate-x-0.5 motion-reduce:transition-none"
          />
        </NavigationMenuLink>
        <NavigationMenuLink
          closeOnClick
          href={links.github}
          className="w-max max-w-full gap-1 px-1 py-0.5 text-[13px] text-muted-foreground hover:bg-transparent hover:text-foreground focus:bg-transparent focus:text-foreground focus:underline"
        >
          Open source on GitHub
          <ArrowUpRight
            aria-hidden="true"
            strokeWidth={1.75}
            className="size-3.5"
          />
        </NavigationMenuLink>
      </div>
    </div>
  );
}

function MobileMenu() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Open menu"
            className="rounded-full lg:hidden"
          />
        }
      >
        <Menu strokeWidth={1.75} />
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(22rem,88vw)] gap-0">
        <SheetHeader className="border-border-subtle border-b">
          <SheetTitle className="flex items-center gap-2.5 font-semibold text-[15px]">
            <BrandMark />
            OpenCadence
          </SheetTitle>
          <SheetDescription className="sr-only">
            Site navigation
          </SheetDescription>
        </SheetHeader>
        <nav
          aria-label="Mobile"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2"
        >
          <div className="px-3 pt-3 pb-2">
            <GroupLabel>Product</GroupLabel>
          </div>
          <ul className="flex flex-col">
            {features.map((feature) => {
              const Icon = featureIcons[feature.slug];
              return (
                <li key={feature.slug}>
                  <SheetClose
                    nativeButton={false}
                    render={
                      <Link
                        href={feature.href}
                        className={cn(sheetLink, focusRing)}
                      />
                    }
                  >
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className="size-4 shrink-0 text-primary"
                    />
                    {feature.title}
                  </SheetClose>
                </li>
              );
            })}
          </ul>
          <ul className="mt-2 flex flex-col border-border-subtle border-t pt-2">
            {[...pageLinks, { href: links.signIn, label: "Sign in" }].map(
              (item) => (
                <li key={item.label}>
                  <SheetClose
                    nativeButton={false}
                    render={
                      <Link
                        href={item.href}
                        className={cn(sheetLink, focusRing)}
                      />
                    }
                  >
                    {item.label}
                  </SheetClose>
                </li>
              ),
            )}
          </ul>
        </nav>
        <div className="border-border-subtle border-t p-4">
          <SheetClose
            nativeButton={false}
            render={
              <Link
                href={links.signUp}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 w-full rounded-full text-[15px] hover:bg-brand-hover",
                )}
              />
            }
          >
            Start free
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SiteHeader() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full min-w-0 max-w-md items-center justify-between gap-1 rounded-full border border-foreground/10 bg-white/80 py-1.5 pr-1.5 pl-3.5 shadow-foreground/10 shadow-lg backdrop-blur-lg backdrop-saturate-150 lg:w-max lg:max-w-none lg:justify-start">
        <Link
          href={links.home}
          className={cn(
            "mr-1 flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-2 font-semibold text-[15px] text-foreground tracking-[-0.01em]",
            focusRing,
          )}
        >
          <BrandMark />
          OpenCadence
        </Link>

        <NavigationMenu
          align="center"
          aria-label="Main"
          className="hidden lg:flex"
        >
          <NavigationMenuList className="gap-0.5">
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  pillItem,
                  "bg-transparent data-popup-open:bg-foreground/5 data-popup-open:text-foreground data-popup-open:hover:bg-foreground/5",
                )}
              >
                Product
              </NavigationMenuTrigger>
              <NavigationMenuContent className="w-[min(60rem,calc(100vw-2rem))] p-0">
                <ProductPanel />
              </NavigationMenuContent>
            </NavigationMenuItem>
            {pageLinks.map((item) => (
              <NavigationMenuItem key={item.label}>
                <NavigationMenuLink
                  render={<Link href={item.href} />}
                  className={pillItem}
                >
                  {item.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <span
          aria-hidden="true"
          className="mx-1.5 hidden h-[18px] w-px bg-border lg:block"
        />

        <Link
          href={links.signIn}
          className={cn(
            pillItem,
            "hidden items-center transition-colors lg:inline-flex",
            focusRing,
          )}
        >
          Sign in
        </Link>
        <Link
          href={links.signUp}
          className={cn(
            buttonVariants({ size: "lg" }),
            "hidden rounded-full px-4 hover:bg-brand-hover lg:inline-flex",
          )}
        >
          Start free
        </Link>

        <MobileMenu />
      </div>
    </header>
  );
}

export { SiteHeader };
