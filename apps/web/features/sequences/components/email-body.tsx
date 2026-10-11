import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { type BodyNode, isWebHref } from "@/features/sequences/lib/ai";

const linkClass = "text-primary underline underline-offset-2";

function renderNodes(nodes: BodyNode[], path: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${path}.${index}`;
    if (node.type === "text") {
      return node.value;
    }
    if (node.type === "break") {
      return <br key={key} />;
    }
    const children = renderNodes(node.children, key);
    if (node.type === "link") {
      return isWebHref(node.href) ? (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={cn("rounded-[4px]", linkClass, focusRing)}
        >
          {children}
        </a>
      ) : (
        <span key={key} title={node.href} className={linkClass}>
          {children}
        </span>
      );
    }
    switch (node.tag) {
      case "p":
        return <p key={key}>{children}</p>;
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {children}
          </strong>
        );
      case "em":
        return <em key={key}>{children}</em>;
      case "ul":
        return (
          <ul key={key} className="flex list-disc flex-col gap-1 pl-5">
            {children}
          </ul>
        );
      default:
        return <li key={key}>{children}</li>;
    }
  });
}

type EmailBodyProps = { nodes: BodyNode[]; className?: string };

export function EmailBody({ nodes, className }: EmailBodyProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2.5 break-words text-foreground",
        className,
      )}
    >
      {renderNodes(nodes, "body")}
    </div>
  );
}
