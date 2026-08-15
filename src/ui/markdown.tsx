import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({
  className = "",
  source,
}: {
  className?: string;
  source: string;
}) {
  return (
    <div className={`markdown ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => {
            const external = isExternalUrl(href);
            return (
              <a
                href={href}
                rel={external ? "noreferrer" : undefined}
                target={external ? "_blank" : undefined}
                onClick={
                  external
                    ? (event) => void openExternal(event, href!)
                    : undefined
                }
              >
                {children}
              </a>
            );
          },
          img: ({ alt, src }) => (
            <img alt={alt ?? ""} loading="lazy" src={src} />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

function isExternalUrl(value?: string): boolean {
  return /^(?:https?:|mailto:)/iu.test(value ?? "");
}

async function openExternal(
  event: MouseEvent<HTMLAnchorElement>,
  url: string,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || !/^https?:/iu.test(url)) return;
  event.preventDefault();
  await Browser.open({ url });
}
