import type { ApiError } from "@/lib/api";
import { maxImageBytes } from "@/lib/media";

const megabytes = Math.round(maxImageBytes / (1024 * 1024));

export const brandCopy = {
  metaTitle: "Brand settings · OpenCadence",
  title: "Brand",
  description:
    "The name, logo, colours and voice your emails start from in this workspace.",
  loading: "Loading brand settings",
  optional: "Optional",
  identity: {
    title: "Identity",
    description:
      "Who the email is from. The name and website fill the brand merge tags, and the logo sits at the top of new templates.",
    name: "Brand name",
    nameHint: (workspace: string) =>
      `Leave it empty to use the workspace name, ${workspace}.`,
    nameTooLong: (max: number) =>
      `Shorten the brand name to ${max} characters or fewer.`,
    website: "Website",
    websitePlaceholder: "https://example.com",
    websiteInvalid:
      "Enter a full web address that starts with https:// or http://, such as https://example.com.",
    logo: "Logo",
    logoHint: `PNG, JPEG, GIF or WebP, up to ${megabytes} MB. A wide logo about 400 pixels across works well.`,
    logoEmpty: "No logo",
    logoAlt: (name: string) => `${name} logo`,
    logoSize: (width: number, height: number) => `${width} by ${height} pixels`,
    upload: "Upload logo",
    replace: "Replace",
    remove: "Remove",
    uploading: "Uploading",
    logoPending: "Save changes to start using this logo.",
    logoRemoved: "Save changes to remove the logo.",
  },
  look: {
    title: "Colours and font",
    description:
      "New templates start from these. The preview shows how they sit together in an email.",
    colors: {
      primaryColor: "Primary",
      backgroundColor: "Page background",
      contentColor: "Email background",
      textColor: "Text",
    },
    colorHints: {
      primaryColor: "Buttons and links.",
      backgroundColor: "The area around the email.",
      contentColor: "The body of the email.",
      textColor: "Headings and paragraphs.",
    },
    picker: (label: string) => `${label} colour picker`,
    hex: (label: string) => `${label} colour as a hex code`,
    hexInvalid: "Enter a hex colour such as #0f5c4d.",
    font: "Font",
    fontPlaceholder: "Search fonts",
    fontEmpty: "No font matches that search.",
    fontHint:
      "These fonts are installed on nearly every device, so the email looks the same everywhere.",
    contrastTitle: "Low contrast.",
    contrastText: (ratio: string) =>
      `The text colour on the email background has a contrast of ${ratio} to 1. Aim for at least 4.5 to 1 so paragraphs stay readable.`,
    contrastButton: (ratio: string) =>
      `White button labels on the primary colour have a contrast of ${ratio} to 1. Pick a darker primary colour to reach 4.5 to 1.`,
  },
  preview: {
    label: "Preview",
    aria: "Email preview with your brand",
    heading: "A short, clear headline",
    body: "This is how a paragraph reads in your emails, with your font and colours applied.",
    button: "Call to action",
    addressPlaceholder: "Your postal address appears here.",
  },
  footer: {
    title: "Footer details",
    description:
      "Shown at the bottom of marketing email. The address fills the brand address merge tag.",
    address: "Postal address",
    addressPlaceholder: "Company name, street, city, postcode, country",
    addressHint:
      "Many countries legally require a postal address in every marketing email.",
    addressTooLong: (max: number) =>
      `Shorten the address to ${max} characters or fewer.`,
    social: "Social links",
    socialEmpty: "No social links yet.",
    network: "Network",
    networkFor: (row: number) => `Network for link ${row}`,
    networkPlaceholder: "Choose a network",
    networkEmpty: "No network matches that search.",
    networkMissing: "Choose a network.",
    url: "Link",
    urlFor: (row: number) => `Address for link ${row}`,
    urlPlaceholder: "https://",
    urlInvalid: "Enter a full address that starts with https:// or http://.",
    addLink: "Add link",
    removeLink: (row: number) => `Remove link ${row}`,
    limit: (max: number) => `You can add up to ${max} links.`,
    socialInvalid:
      "One of the social links was not accepted. Check each network and address.",
  },
  voice: {
    title: "Voice",
    description:
      "How the brand writes. The AI assistant follows this when it drafts or rewrites an email.",
    label: "Brand voice",
    placeholder:
      "Friendly and direct. Short sentences, no jargon, no exclamation marks. We say we, never I.",
    tooLong: (max: number) =>
      `Shorten the voice to ${max} characters or fewer.`,
    count: (used: number, max: number) => `${used} of ${max} characters`,
  },
  save: "Save changes",
  saveNote: "Saves everything on this page for every member.",
  unsaved: "You have unsaved changes.",
  readOnly: {
    title: "You can view the brand.",
    body: "An owner or admin of this workspace can change it.",
    notSet: "Not set",
    usesWorkspaceName: (name: string) => `${name} (the workspace name)`,
  },
  loadFailed: "Could not load the brand settings.",
  toasts: {
    saved: "Brand saved",
    saveFailed: "Could not save the brand",
    uploadFailed: "Could not upload the logo",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    forbidden:
      "Your role no longer allows changing the brand. Ask an owner or admin of this workspace.",
    unsupportedType:
      "That file is not a PNG, JPEG, GIF or WebP image. Export the logo in one of those formats and try again.",
    tooLarge: `That image is larger than ${megabytes} MB. Export a smaller version and try again.`,
    logoMissing:
      "That logo is no longer in the media library. Upload it again, then save.",
    fallback: "Nothing was changed. Try again in a moment.",
  },
};

export function describeBrandError(error: ApiError) {
  if (error.status === 0) {
    return brandCopy.errors.network;
  }
  if (error.status === 401) {
    return brandCopy.errors.signedOut;
  }
  if (error.status === 403 || error.code === "forbidden") {
    return brandCopy.errors.forbidden;
  }
  if (error.status === 415 || error.code === "unsupported_type") {
    return brandCopy.errors.unsupportedType;
  }
  if (error.status === 413 || error.code === "too_large") {
    return brandCopy.errors.tooLarge;
  }
  return error.message ?? brandCopy.errors.fallback;
}
