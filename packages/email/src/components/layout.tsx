import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  pixelBasedPreset,
  Row,
  Section,
  Tailwind,
  type TailwindConfig,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

const tailwindConfig: TailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        ground: "#FBFCFA",
        panel: "#FFFFFF",
        line: "#E3E7E0",
        "line-subtle": "#EEF1EB",
        ink: "#14201B",
        "ink-secondary": "#56635C",
        "ink-tertiary": "#85918A",
        brand: "#0F5C4D",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
};

export type ActionEmailLayoutProps = {
  lang: string;
  wordmark: string;
  preview: string;
  heading: string;
  greeting: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  fallbackLabel: string;
  expiryNote: string;
  ignoreNote: string;
  footer: string;
  children?: ReactNode;
};

export function ActionEmailLayout({
  lang,
  wordmark,
  preview,
  heading,
  greeting,
  intro,
  actionLabel,
  actionUrl,
  fallbackLabel,
  expiryNote,
  ignoreNote,
  footer,
  children,
}: ActionEmailLayoutProps) {
  return (
    <Html lang={lang} dir="ltr">
      <Tailwind config={tailwindConfig}>
        <Head />
        <Body className="m-0 bg-ground px-3 py-10 font-sans">
          <Preview>{preview}</Preview>
          <Container className="mx-auto w-full max-w-[560px]">
            <Section>
              <Text className="m-0 px-1 pb-5 text-[17px] font-semibold leading-6 tracking-[-0.01em] text-brand">
                {wordmark}
              </Text>
            </Section>
            <Section>
              <Row>
                <Column className="rounded-[12px] border border-solid border-line bg-panel px-8 py-8">
                  <Heading
                    as="h1"
                    className="m-0 text-[20px] font-semibold leading-7 tracking-[-0.01em] text-ink"
                  >
                    {heading}
                  </Heading>
                  <Text className="mb-0 mt-4 text-[15px] leading-6 text-ink">
                    {greeting}
                  </Text>
                  <Text className="mb-0 mt-3 text-[15px] leading-6 text-ink">
                    {intro}
                  </Text>
                  {children}
                  <Section className="mt-6">
                    <Button
                      href={actionUrl}
                      className="box-border rounded-[8px] bg-brand px-5 py-3 text-center text-[15px] font-medium leading-5 text-white no-underline"
                    >
                      {actionLabel}
                    </Button>
                  </Section>
                  <Text className="mb-0 mt-6 text-[13px] leading-5 text-ink-secondary">
                    {fallbackLabel}
                  </Text>
                  <Text className="mb-0 mt-1 text-[13px] leading-5">
                    <Link
                      href={actionUrl}
                      className="break-all text-brand underline"
                    >
                      {actionUrl}
                    </Link>
                  </Text>
                  <Hr className="mb-0 mt-6 border-0 border-t border-solid border-line-subtle" />
                  <Text className="mb-0 mt-5 text-[13px] leading-5 text-ink-secondary">
                    {expiryNote} {ignoreNote}
                  </Text>
                </Column>
              </Row>
            </Section>
            <Section>
              <Text className="m-0 px-1 pt-5 text-[12px] leading-5 text-ink-tertiary">
                {footer}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
