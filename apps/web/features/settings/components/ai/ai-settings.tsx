"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import {
  ConfirmDialog,
  dangerOutlineButtonClass,
  errorClass,
  hintClass,
  inputClass,
  LoadFailed,
  labelClass,
  Notice,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/features/settings/components/workspace-parts";
import {
  type AiField,
  aiCopy,
  aiFieldError,
  describeAiError,
  hostOf,
  validateBaseUrl,
  validateModel,
} from "@/features/settings/lib/ai-copy";
import { type AiSettings, defaultAiBaseUrl, parseAiSettings } from "@/lib/ai";
import { request } from "@/lib/api";

type AiSettingsScreenProps = {
  settings: AiSettings | null;
  workspaceName: string;
};

export function AiSettingsScreen({
  settings,
  workspaceName,
}: AiSettingsScreenProps) {
  if (!settings) {
    return <AiUnavailable />;
  }
  return settings.canManage ? (
    <AiSettingsForm settings={settings} workspaceName={workspaceName} />
  ) : (
    <AiReadOnly settings={settings} />
  );
}

function AiUnavailable() {
  const router = useRouter();
  const [pending, startRetry] = useTransition();

  return (
    <SettingsStack>
      <SettingsSection
        title={aiCopy.provider.title}
        description={aiCopy.provider.description}
      >
        <LoadFailed
          title={aiCopy.loadFailed}
          pending={pending}
          onRetry={() => startRetry(() => router.refresh())}
        />
      </SettingsSection>
    </SettingsStack>
  );
}

function SavedKey({ hint }: { hint: string | null }) {
  const text = aiCopy.provider;
  return hint ? (
    <>
      <span aria-hidden>••••••••{hint}</span>
      <span className="sr-only">{text.savedKeyValue(hint)}</span>
    </>
  ) : (
    <span className="font-sans">{text.savedKeyHidden}</span>
  );
}

function trimUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

type Errors = Partial<Record<AiField, string>>;

type TestResult = { passed: boolean; message: string } | null;

const fieldIds: Record<AiField, string> = {
  baseUrl: "ai-base-url",
  model: "ai-model",
  apiKey: "ai-api-key",
};

function AiSettingsForm({
  settings,
  workspaceName,
}: {
  settings: AiSettings;
  workspaceName: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(settings);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? defaultAiBaseUrl);
  const [model, setModel] = useState(settings.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [test, setTest] = useState<TestResult>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [removing, startRemove] = useTransition();

  const text = aiCopy.provider;
  const busy = saving || testing || removing;
  const keyEditable = !saved.configured || replacing;
  const changed =
    !saved.configured ||
    trimUrl(baseUrl) !== (saved.baseUrl ?? "") ||
    model.trim() !== (saved.model ?? "") ||
    (replacing && apiKey.trim() !== "");

  function focusFirst(next: Errors) {
    const field = (["baseUrl", "model", "apiKey"] as const).find(
      (name) => next[name],
    );
    if (field) {
      document.getElementById(fieldIds[field])?.focus();
    }
  }

  function clear(field: AiField) {
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    const key = apiKey.trim();
    const next: Errors = {
      baseUrl: validateBaseUrl(baseUrl),
      model: validateModel(model),
      apiKey:
        keyEditable && key === ""
          ? saved.configured
            ? text.apiKeyReplaceMissing
            : text.apiKeyMissing
          : undefined,
    };
    setErrors(next);
    if (next.baseUrl || next.model || next.apiKey) {
      focusFirst(next);
      return;
    }
    if (!changed) {
      return;
    }

    startSave(async () => {
      const result = await request("PUT", "/ai/settings", {
        baseUrl: trimUrl(baseUrl),
        model: model.trim(),
        ...(keyEditable ? { apiKey: key } : {}),
      });
      if (!result.ok) {
        const fieldError = aiFieldError(result.error);
        if (fieldError) {
          const failed: Errors = { [fieldError.field]: fieldError.message };
          setErrors(failed);
          focusFirst(failed);
          return;
        }
        toast.error(aiCopy.toasts.saveFailed, {
          description: describeAiError(result.error),
        });
        return;
      }
      const nextSettings = parseAiSettings(result.data);
      if (nextSettings) {
        setSaved(nextSettings);
        setBaseUrl(nextSettings.baseUrl ?? defaultAiBaseUrl);
        setModel(nextSettings.model ?? "");
      }
      setApiKey("");
      setReplacing(false);
      setTest(null);
      toast.success(aiCopy.toasts.saved);
      startSave(() => router.refresh());
    });
  }

  function runTest() {
    if (busy || changed) {
      return;
    }
    setTest(null);
    startTest(async () => {
      const result = await request("POST", "/ai/settings/test");
      if (result.ok) {
        const message = saved.model
          ? text.testPassed(saved.model)
          : text.testPassedFallback;
        setTest({ passed: true, message });
        toast.success(aiCopy.toasts.testPassed, { description: message });
        return;
      }
      const message = describeAiError(result.error);
      setTest({ passed: false, message });
      toast.error(aiCopy.toasts.testFailed, { description: message });
    });
  }

  function confirmRemove() {
    startRemove(async () => {
      const result = await request("DELETE", "/ai/settings");
      if (!result.ok) {
        toast.error(aiCopy.toasts.removeFailed, {
          description: describeAiError(result.error),
        });
        return;
      }
      setSaved({
        configured: false,
        baseUrl: null,
        model: null,
        keyHint: null,
        canManage: true,
      });
      setBaseUrl(defaultAiBaseUrl);
      setModel("");
      setApiKey("");
      setReplacing(false);
      setErrors({});
      setTest(null);
      setRemoveOpen(false);
      toast.success(aiCopy.toasts.removed);
      startRemove(() => router.refresh());
    });
  }

  let status: React.ReactNode;
  if (testing) {
    status = text.testing;
  } else if (test) {
    const Icon = test.passed ? CircleCheck : TriangleAlert;
    status = (
      <span
        className={cn(
          "flex items-start gap-1.5",
          test.passed ? "text-success" : "text-danger",
        )}
      >
        <Icon
          aria-hidden
          strokeWidth={1.6}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0">{test.message}</span>
      </span>
    );
  } else if (!saved.configured) {
    status = text.notConfigured;
  } else if (changed) {
    status = text.testDirty;
  } else {
    status = text.testIdle;
  }

  const host = hostOf(saved.baseUrl);

  return (
    <SettingsStack>
      <form noValidate onSubmit={handleSubmit} className="contents">
        <SettingsSection
          className={saved.configured ? "last:border-b" : undefined}
          title={text.title}
          description={
            <>
              <p>{text.description}</p>
              <p className="mt-2">{text.compatible}</p>
            </>
          }
          footer={
            <>
              <div
                role="status"
                id="ai-test-status"
                className="min-w-0 flex-1 basis-64"
              >
                {status}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || changed}
                  aria-busy={testing || undefined}
                  aria-describedby="ai-test-status"
                  onClick={runTest}
                  className={secondaryButtonClass}
                >
                  {testing ? <Spinner /> : null}
                  {text.test}
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !changed}
                  aria-busy={saving || undefined}
                  className={primaryButtonClass}
                >
                  {saving ? <Spinner /> : null}
                  {text.save}
                </Button>
              </div>
            </>
          }
        >
          <FieldGroup className="max-w-[420px] gap-4">
            <Field data-invalid={errors.baseUrl ? true : undefined}>
              <FieldLabel htmlFor={fieldIds.baseUrl} className={labelClass}>
                {text.baseUrl}
              </FieldLabel>
              <Input
                id={fieldIds.baseUrl}
                name="baseUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={baseUrl}
                disabled={busy}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  clear("baseUrl");
                }}
                aria-invalid={errors.baseUrl ? true : undefined}
                aria-describedby={
                  errors.baseUrl ? "ai-base-url-error" : "ai-base-url-hint"
                }
                className={cn(inputClass, "font-mono md:text-[13px]")}
              />
              {errors.baseUrl ? (
                <FieldError id="ai-base-url-error" className={errorClass}>
                  {errors.baseUrl}
                </FieldError>
              ) : (
                <FieldDescription id="ai-base-url-hint" className={hintClass}>
                  {text.baseUrlHint}
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={errors.model ? true : undefined}>
              <FieldLabel htmlFor={fieldIds.model} className={labelClass}>
                {text.model}
              </FieldLabel>
              <Input
                id={fieldIds.model}
                name="model"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                placeholder={text.modelPlaceholder}
                value={model}
                disabled={busy}
                onChange={(event) => {
                  setModel(event.target.value);
                  clear("model");
                }}
                aria-invalid={errors.model ? true : undefined}
                aria-describedby={
                  errors.model ? "ai-model-error" : "ai-model-hint"
                }
                className={cn(inputClass, "font-mono md:text-[13px]")}
              />
              {errors.model ? (
                <FieldError id="ai-model-error" className={errorClass}>
                  {errors.model}
                </FieldError>
              ) : (
                <FieldDescription id="ai-model-hint" className={hintClass}>
                  {text.modelHint}
                </FieldDescription>
              )}
            </Field>

            {keyEditable ? (
              <Field data-invalid={errors.apiKey ? true : undefined}>
                <FieldLabel htmlFor={fieldIds.apiKey} className={labelClass}>
                  {text.apiKey}
                </FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id={fieldIds.apiKey}
                    name="apiKey"
                    type="password"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={apiKey}
                    disabled={busy}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      clear("apiKey");
                    }}
                    aria-invalid={errors.apiKey ? true : undefined}
                    aria-describedby={
                      errors.apiKey ? "ai-api-key-error" : "ai-api-key-hint"
                    }
                    className={cn(
                      inputClass,
                      "min-w-40 flex-1 font-mono md:text-[13px]",
                    )}
                  />
                  {saved.configured ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setReplacing(false);
                        setApiKey("");
                        clear("apiKey");
                      }}
                      className={secondaryButtonClass}
                    >
                      {text.keep}
                    </Button>
                  ) : null}
                </div>
                {errors.apiKey ? (
                  <FieldError id="ai-api-key-error" className={errorClass}>
                    {errors.apiKey}
                  </FieldError>
                ) : (
                  <FieldDescription id="ai-api-key-hint" className={hintClass}>
                    {text.apiKeyHint}
                  </FieldDescription>
                )}
              </Field>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="font-medium text-[13px]">{text.savedKey}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-8 min-w-40 flex-1 items-center rounded-lg border border-border bg-muted/50 px-2.5 font-mono text-[13px] text-muted-foreground">
                    <SavedKey hint={saved.keyHint} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setReplacing(true);
                      window.setTimeout(() => {
                        document.getElementById(fieldIds.apiKey)?.focus();
                      }, 0);
                    }}
                    className={secondaryButtonClass}
                  >
                    {text.replace}
                  </Button>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {text.savedKeyHint}
                </p>
              </div>
            )}
          </FieldGroup>
        </SettingsSection>
      </form>

      {saved.configured ? (
        <SettingsSection
          tone="danger"
          title={aiCopy.remove.title}
          description={aiCopy.remove.description}
          footer={
            <>
              <span className="min-w-0 flex-1 basis-64">
                {aiCopy.remove.note}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setRemoveOpen(true)}
                className={dangerOutlineButtonClass}
              >
                {aiCopy.remove.action}
              </Button>
            </>
          }
        >
          <p className="max-w-[60ch] text-[13px] text-muted-foreground">
            {aiCopy.remove.body}
          </p>
          <ConfirmDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            title={aiCopy.remove.dialogTitle(workspaceName)}
            description={
              host
                ? aiCopy.remove.dialogBody(host)
                : aiCopy.remove.dialogBodyFallback
            }
            confirmLabel={aiCopy.remove.confirm}
            pending={removing}
            onConfirm={confirmRemove}
          />
        </SettingsSection>
      ) : null}
    </SettingsStack>
  );
}

function AiReadOnly({ settings }: { settings: AiSettings }) {
  const text = aiCopy.provider;
  const termClass = "font-medium text-muted-foreground";

  return (
    <SettingsStack>
      <SettingsSection title={text.title} description={text.description}>
        {settings.configured ? (
          <>
            <Notice title={aiCopy.readOnly.title} className="mb-5">
              {aiCopy.readOnly.body}
            </Notice>
            <dl className="grid max-w-[420px] gap-4 text-[13px]">
              <div>
                <dt className={termClass}>{text.baseUrl}</dt>
                <dd className="mt-1 break-all font-mono text-foreground">
                  {settings.baseUrl ?? aiCopy.readOnly.notSet}
                </dd>
              </div>
              <div>
                <dt className={termClass}>{text.model}</dt>
                <dd className="mt-1 break-all font-mono text-foreground">
                  {settings.model ?? aiCopy.readOnly.notSet}
                </dd>
              </div>
              <div>
                <dt className={termClass}>{text.savedKey}</dt>
                <dd className="mt-1 font-mono text-foreground">
                  <SavedKey hint={settings.keyHint} />
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <Notice title={aiCopy.readOnly.emptyTitle}>
            {aiCopy.readOnly.emptyBody}
          </Notice>
        )}
      </SettingsSection>
    </SettingsStack>
  );
}
