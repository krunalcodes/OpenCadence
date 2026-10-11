const countFormat = new Intl.NumberFormat("en-US");

export const copy = {
  title: "Templates",
  description:
    "Reusable emails with a subject, preview text and a designed body. Write one here, then use it in campaigns and sequences.",
  add: "New template",
  searchLabel: "Search templates",
  searchPlaceholder: "Search by name or subject",
  searchChip: (search: string) => `Matches "${search}"`,
  activeFilters: "Active filters",
  clearAll: "Clear search",
  removeFilter: (label: string) => `Remove filter: ${label}`,
  count: (shown: number, more: boolean) =>
    more
      ? `${countFormat.format(shown)} shown, more available`
      : shown === 1
        ? "1 template"
        : `${countFormat.format(shown)} templates`,
  columns: {
    name: "Name",
    subject: "Subject",
    edited: "Last edited",
    actions: "Actions",
  },
  noSubject: "No subject yet",
  days: { today: "Today", yesterday: "Yesterday" },
  actionsFor: (name: string) => `Actions for ${name}`,
  menu: {
    edit: "Open in editor",
    rename: "Rename",
    duplicate: "Duplicate",
    remove: "Delete",
  },
  emptyTitle: "No templates yet",
  emptyBody:
    "A template holds the subject, preview text and body of an email. New templates start from your brand colours, font and logo.",
  noMatchTitle: "No templates match",
  noMatchBody: "Try a different name or subject, or clear the search.",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more templates",
  loadFailed: {
    title: "Could not load your templates.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  nameDialog: {
    createTitle: "New template",
    createDescription:
      "Name the template so you can find it later. You write the email next.",
    renameTitle: "Rename template",
    renameDescription: (name: string) =>
      `Choose a new name for ${name}. Its content stays as it is.`,
    name: "Name",
    namePlaceholder: "Monthly newsletter",
    nameMissing: "Give the template a name.",
    nameTooLong: (max: number) => `Keep the name under ${max} characters.`,
    nameTaken:
      "Another template already uses this name. Choose a different one.",
    create: "Create and open",
    save: "Save name",
    cancel: "Cancel",
  },
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    body: "The template is removed for everyone in this workspace. Emails already sent with it are not affected.",
    confirm: "Delete template",
    cancel: "Cancel",
  },
  toasts: {
    createFailed: "Could not create the template",
    renamed: (name: string) => `Renamed to ${name}`,
    renameFailed: "Could not rename the template",
    duplicated: (name: string) => `${name} was created`,
    duplicateFailed: (name: string) => `Could not duplicate ${name}`,
    deleted: (name: string) => `${name} was deleted`,
    deleteFailed: (name: string) => `Could not delete ${name}`,
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    notFound: "This template no longer exists. It may have been deleted.",
    fallback: "Nothing was changed. Try again in a moment.",
  },
  editor: {
    back: "Templates",
    backLabel: "Back to templates",
    nameLabel: "Template name",
    namePlaceholder: "Untitled template",
    status: {
      saved: "Saved",
      saving: "Saving",
      dirty: "Unsaved changes",
      failed: "Not saved",
    },
    preview: "Preview",
    sendTest: "Send test",
    save: "Save",
    subject: "Subject",
    subjectPlaceholder: "What the recipient sees in their inbox",
    previewText: "Preview text",
    previewTextPlaceholder: "The short line shown after the subject",
    counter: (count: number, max: number) =>
      `${countFormat.format(count)} / ${countFormat.format(max)}`,
    canvasLabel: "Email body",
    inspectorLabel: "Design",
    toolbarLabel: "Editor tools",
    bodyPlaceholder: "Write here, or press / for blocks",
    addImage: "Image",
    addImageLabel: "Upload an image",
    mergeTag: "Merge tag",
    rewrite: "Rewrite",
    draft: "Write with AI",
    review: "Review",
    leaveConfirm:
      "This template has unsaved changes. Leave without saving them?",
    notFoundTitle: "This template could not be opened.",
    notFoundBody:
      "It may have been deleted, or the server did not answer. Go back to your templates and try again.",
    saveFailed: "Could not save the template",
    exportFailed:
      "The email could not be prepared. Check the content and try again.",
    nameMissing: "Give the template a name before saving.",
    nameTaken:
      "Another template already uses this name. Choose a different one, then save again.",
    tooLarge:
      "This email is too large to save. Remove some content or large images.",
    starter: {
      heading: "Your headline goes here",
      body: "Start writing your email. Select text to format it, or press / to add a button, a divider or columns.",
      unsubscribe: "Unsubscribe",
      logoAlt: (name: string) => (name ? `${name} logo` : "Logo"),
    },
  },
  mergeTags: {
    title: "Insert merge tag",
    description:
      "Each contact sees their own value. The fallback is used when a contact has none.",
    tag: "Merge tag",
    tagPlaceholder: "Search merge tags",
    tagEmpty: "No merge tag matches",
    fallback: "Fallback",
    optional: "Optional",
    fallbackPlaceholder: "there",
    insert: "Insert",
    forSubject: "Insert merge tag in the subject",
    forPreview: "Insert merge tag in the preview text",
    groups: {
      contact: "Contact",
      field: "Custom field",
      brand: "Brand",
      system: "System",
    },
    labels: {
      email: "Email address",
      first_name: "First name",
      last_name: "Last name",
      company: "Company",
      job_title: "Job title",
      phone: "Phone",
      city: "City",
      country: "Country",
      "brand.name": "Brand name",
      "brand.address": "Postal address",
      "brand.website": "Website",
      unsubscribe_url: "Unsubscribe link",
    } as Record<string, string>,
    option: (group: string, label: string) => `${group}: ${label}`,
  },
  images: {
    failed: "Could not upload the image",
    unsupported: "Use a PNG, JPEG, GIF or WebP image.",
    tooLarge: (megabytes: number) =>
      `The image is larger than ${megabytes} MB. Choose a smaller file.`,
    fallback: "The image was not added. Try again in a moment.",
  },
  previewDialog: {
    title: "Preview",
    description:
      "Merge tags are filled with sample data. Real emails use each contact's own values.",
    desktop: "Desktop",
    mobile: "Mobile",
    widthLabel: "Preview width",
    frameTitle: "Email preview",
    subject: "Subject",
    previewText: "Preview text",
    noSubject: "No subject yet",
    preparing: "Preparing the preview",
    failed: "The preview could not be prepared.",
    close: "Close",
  },
  testDialog: {
    title: "Send a test email",
    description:
      "Sends the current content, including unsaved changes, with sample data in the merge tags. The subject is prefixed with [Test].",
    to: "Send to",
    toPlaceholder: "you@example.com",
    toMissing: "Enter the address to send the test to.",
    toInvalid: "Enter a valid email address, such as you@example.com.",
    source: "Send from",
    sourcePlaceholder: "Default source",
    sourceEmpty: "No source matches",
    sourceHint: "Leave empty to use the workspace's default sending source.",
    noSources:
      "No sending source is connected yet. Connect a mailbox or provider on the Integrations page first.",
    connect: "Open Integrations",
    from: "From address",
    fromPlaceholder: "news@yourdomain.com",
    fromHint:
      "This source has no fixed address. Use one on a domain verified with that provider.",
    fromInvalid: "Enter a valid From address, such as news@yourdomain.com.",
    subjectMissing: "Add a subject before sending a test.",
    send: "Send test",
    cancel: "Cancel",
    sent: (to: string) => `Test sent to ${to}`,
    failed: "Could not send the test",
    suppressed:
      "This address is on the suppression list, so nothing was sent to it.",
  },
  ai: {
    setupTitle: "AI is not set up for this workspace.",
    setupBody:
      "Connect a model provider to draft, rewrite and get subject ideas.",
    setupLink: "Open AI settings",
    stop: "Stop",
    errors: {
      notConfigured:
        "AI is not set up for this workspace. Add a provider in AI settings, then try again.",
      rateLimited:
        "Too many AI requests in the last minute. Wait a moment, then try again.",
      provider:
        "The AI provider returned an error. Check the base URL, model and key in AI settings, or try again.",
      validation:
        "The request was too long or incomplete. Shorten it and try again.",
      forbidden: "You do not have permission to use this.",
      network:
        "The server did not answer. Check your connection and that the API is running.",
      empty: "The AI returned nothing usable. Try again or change the request.",
      fallback: "The AI request failed. Try again in a moment.",
    },
    draft: {
      title: "Write with AI",
      description:
        "Describe the email. The draft uses your brand voice and the merge tags you have.",
      prompt: "What is this email about?",
      promptPlaceholder:
        "Announce our spring sale: 20% off everything until Sunday, with a button to the shop.",
      promptMissing: "Describe the email first.",
      promptCounter: (count: number, max: number) =>
        `${countFormat.format(count)} / ${countFormat.format(max)}`,
      kind: "Kind",
      kindPlaceholder: "Choose a kind",
      kindEmpty: "No kind matches",
      kinds: {
        newsletter: "Newsletter",
        outreach: "Outreach",
        announcement: "Announcement",
        transactional: "Transactional",
      },
      tone: "Tone",
      tonePlaceholder: "Choose a tone",
      toneEmpty: "No tone matches",
      tones: {
        friendly: "Friendly",
        professional: "Professional",
        direct: "Direct",
        playful: "Playful",
        formal: "Formal",
      },
      mode: "What to write",
      modeNew: "New draft",
      modeRevise: "Revise this email",
      reviseHint:
        "The current email is sent along, and the draft changes it as you describe.",
      generate: "Write draft",
      revise: "Revise email",
      again: "Try again",
      steps: {
        starting: "Starting",
        subject: "Writing the subject",
        preview: "Writing the preview text",
        body: "Writing the body",
        done: "Draft ready",
        stopped: "Stopped",
      },
      words: (count: number) =>
        count === 1 ? "1 word" : `${countFormat.format(count)} words`,
      subject: "Subject",
      previewText: "Preview text",
      body: "Body",
      frameTitle: "Draft preview",
      insert: "Use this draft",
      discard: "Discard",
      replaceTitle: "Replace the current email?",
      replaceBody:
        "The draft replaces the body, subject and preview text. You can undo the body change with Cmd/Ctrl+Z.",
      replaceConfirm: "Replace email",
      replaceCancel: "Keep editing",
      inserted: "Draft added to the email",
      incomplete: "The draft has no body yet. Try again.",
    },
    rewrite: {
      title: "Rewrite selection",
      needSelection: "Select some text in the email first.",
      tooLong: (max: number) =>
        `Select less text. The limit is ${countFormat.format(max)} characters.`,
      actions: {
        shorten: "Shorten",
        expand: "Expand",
        friendlier: "Friendlier",
        more_formal: "More formal",
        fix_grammar: "Fix grammar",
      },
      custom: "Your own instruction",
      customPlaceholder: "Make it sound more urgent",
      customRun: "Rewrite",
      selected: "Selected text",
      result: "Suggestion",
      writing: "Writing",
      accept: "Replace selection",
      retry: "Try again",
      discard: "Discard",
      back: "Choose another",
    },
    subjects: {
      trigger: "Suggest subject lines",
      title: "Subject ideas",
      description: "Pick one to fill the subject and preview text.",
      loading: "Thinking of subject lines",
      empty: "No ideas came back. Add some content to the email and try again.",
      retry: "Try again",
      more: "More ideas",
    },
    review: {
      title: "Review before sending",
      description:
        "Checks for problems that hurt deliverability or confuse readers.",
      run: "Run again",
      running: "Reviewing the email",
      severities: {
        high: "Fix before sending",
        medium: "Worth fixing",
        low: "Small improvements",
      },
      severityBadges: { high: "High", medium: "Medium", low: "Low" },
      sources: { rules: "Rule check", ai: "AI" },
      suggestion: "Suggestion",
      clear: "No problems found.",
      clearBody: "The checks that ran found nothing to fix.",
      aiRan: "Rule checks and an AI wording review both ran.",
      aiSkippedConfigured:
        "Only the rule checks ran. The AI wording review did not answer this time.",
      aiSkippedNotConfigured: "Only the rule checks ran.",
      failed: "The review could not run",
      count: (count: number) =>
        count === 1 ? "1 issue" : `${countFormat.format(count)} issues`,
    },
  },
};

type Failure = { status: number; code: string; message: string | null };

export function describeError(error: Failure) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  if (error.code === "not_found") {
    return copy.errors.notFound;
  }
  return error.message ?? copy.errors.fallback;
}

export function describeAiError(error: Failure) {
  const text = copy.ai.errors;
  if (error.status === 0) {
    return text.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  switch (error.code) {
    case "ai_not_configured":
      return text.notConfigured;
    case "ai_rate_limited":
      return text.rateLimited;
    case "ai_provider_error":
      return error.message ?? text.provider;
    case "validation":
      return error.message ?? text.validation;
    case "forbidden":
      return text.forbidden;
    case "empty":
      return text.empty;
    default:
      return text.fallback;
  }
}

export function describeImageError(error: Failure, megabytes: number) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  if (error.code === "unsupported_type") {
    return copy.images.unsupported;
  }
  if (error.code === "too_large") {
    return copy.images.tooLarge(megabytes);
  }
  return error.message ?? copy.images.fallback;
}
