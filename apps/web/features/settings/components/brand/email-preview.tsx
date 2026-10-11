import { brandCopy } from "@/features/settings/lib/brand-copy";
import type { BrandColors } from "@/features/settings/lib/brand-form";
import { type BrandFontFamily, type BrandLogo, fontStack } from "@/lib/brand";

type EmailPreviewProps = {
  name: string;
  logo: BrandLogo | null;
  colors: BrandColors;
  fontFamily: BrandFontFamily;
  address: string;
};

export function EmailPreview({
  name,
  logo,
  colors,
  fontFamily,
  address,
}: EmailPreviewProps) {
  const text = brandCopy.preview;

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <figcaption className="font-medium text-[13px] text-foreground">
        {text.label}
      </figcaption>
      <div
        role="img"
        aria-label={text.aria}
        className="overflow-hidden rounded-lg border border-border"
        style={{
          backgroundColor: colors.backgroundColor,
          padding: "20px 16px",
          fontFamily: fontStack(fontFamily),
          color: colors.textColor,
        }}
      >
        <div
          style={{
            backgroundColor: colors.contentColor,
            borderRadius: 8,
            padding: "22px 20px 18px",
            margin: "0 auto",
            maxWidth: 340,
          }}
        >
          {logo ? (
            <img
              src={logo.url}
              alt=""
              style={{
                display: "block",
                maxHeight: 30,
                maxWidth: 140,
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                lineHeight: 1.3,
                overflowWrap: "anywhere",
              }}
            >
              {name}
            </div>
          )}
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              lineHeight: 1.25,
              marginTop: 18,
            }}
          >
            {text.heading}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
            {text.body}
          </div>
          <div
            style={{
              backgroundColor: colors.primaryColor,
              borderRadius: 6,
              color: "#ffffff",
              display: "inline-block",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1,
              marginTop: 16,
              padding: "10px 16px",
            }}
          >
            {text.button}
          </div>
          <div
            style={{
              borderTop: `1px solid ${colors.textColor}`,
              marginTop: 22,
              opacity: 0.15,
            }}
          />
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.5,
              marginTop: 12,
              opacity: address ? 0.7 : 0.45,
              overflowWrap: "anywhere",
              whiteSpace: "pre-line",
            }}
          >
            {address || text.addressPlaceholder}
          </div>
        </div>
      </div>
    </figure>
  );
}
