"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { type Ref, useMemo } from "react";
import { tableCellClass, tableHeadClass } from "@/components/product/styles";
import {
  Notice,
  StepHeading,
  textLinkClass,
} from "@/features/imports/components/parts";
import { copy, targetLabels } from "@/features/imports/lib/copy";
import type { FieldOption } from "@/features/imports/lib/imports";
import {
  builtInTargets,
  customTarget,
  emailTarget,
  mappingProblem,
  matchedCount,
  repeatedColumns,
  sampleValues,
  skipTarget,
  usedTargets,
} from "@/features/imports/lib/mapping";
import { appHref } from "@/lib/navigation";

const text = copy.mapping;

type TargetOption = { value: string; label: string };

function targetOptions(fields: FieldOption[]): TargetOption[] {
  return [
    ...builtInTargets.map((target) => ({
      value: target,
      label: targetLabels[target],
    })),
    ...fields.map((field) => ({
      value: customTarget(field.key),
      label: field.label,
    })),
    { value: skipTarget, label: text.skip },
  ];
}

type MappingStepProps = {
  headingRef: Ref<HTMLHeadingElement>;
  columns: string[];
  sampleRows: string[][];
  targets: string[];
  fields: FieldOption[];
  error?: string;
  disabled: boolean;
  onChange: (index: number, target: string) => void;
};

export function MappingStep({
  headingRef,
  columns,
  sampleRows,
  targets,
  fields,
  error,
  disabled,
  onChange,
}: MappingStepProps) {
  const options = useMemo(() => targetOptions(fields), [fields]);
  const repeated = repeatedColumns(columns);
  const used = usedTargets(targets);
  const problem = mappingProblem(targets);
  const emailIndex = targets.indexOf(emailTarget);
  const emailColumn =
    emailIndex >= 0
      ? columns[emailIndex] || text.unnamed(emailIndex + 1)
      : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex max-w-[720px] flex-col gap-1">
        <StepHeading ref={headingRef}>{text.heading}</StepHeading>
        <p className="text-muted-foreground">{text.guidance}</p>
      </div>

      {error ? (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      ) : null}
      <div aria-live="polite">
        {problem ? (
          <Notice tone="danger">{text.problems[problem]}</Notice>
        ) : emailColumn ? (
          <Notice tone="success">{text.emailMatched(emailColumn)}</Notice>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table className="min-w-[640px] text-[13px]">
          <TableHeader className="[&_tr]:border-border-subtle">
            <TableRow className="hover:bg-transparent">
              <TableHead className={tableHeadClass}>
                {text.columns.column}
              </TableHead>
              <TableHead className={cn(tableHeadClass, "w-72")}>
                {text.columns.target}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column, index) => {
              const name = column || text.unnamed(index + 1);
              const current = targets[index] ?? skipTarget;
              const selected =
                options.find((option) => option.value === current) ?? null;
              const samples = sampleValues(sampleRows, index);
              return (
                <TableRow
                  key={`${index}-${column}`}
                  className="border-border-subtle hover:bg-muted/50"
                >
                  <TableCell
                    className={cn(tableCellClass, "max-w-[520px] align-top")}
                  >
                    <div className="truncate font-medium text-foreground">
                      {name}
                    </div>
                    <div className="truncate text-[12.5px] text-ink-tertiary">
                      {repeated[index]
                        ? null
                        : samples.length > 0
                          ? samples.join(" · ")
                          : text.noSamples}
                    </div>
                    {repeated[index] ? (
                      <p className="text-[12.5px] whitespace-normal text-ink-tertiary">
                        {text.repeated}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className={cn(tableCellClass, "align-top")}>
                    <Combobox
                      items={options}
                      value={selected}
                      disabled={disabled || repeated[index]}
                      onValueChange={(next: TargetOption | null) =>
                        onChange(index, next?.value ?? skipTarget)
                      }
                    >
                      <ComboboxInput
                        aria-label={text.targetFor(name)}
                        placeholder={text.targetPlaceholder}
                        disabled={disabled || repeated[index]}
                        className={cn(
                          "h-8 w-64 bg-card text-[13px] shadow-xs",
                          current === skipTarget && "text-muted-foreground",
                        )}
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>{text.targetEmpty}</ComboboxEmpty>
                        <ComboboxList>
                          {(item: TargetOption) => {
                            const taken =
                              item.value !== current && used.has(item.value);
                            return (
                              <ComboboxItem
                                key={item.value}
                                value={item}
                                disabled={taken}
                                className="text-[13px]"
                              >
                                <span className="truncate">{item.label}</span>
                                {taken ? (
                                  <span className="ml-auto text-xs text-ink-tertiary">
                                    {text.inUse}
                                  </span>
                                ) : null}
                              </ComboboxItem>
                            );
                          }}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="max-w-[720px] text-muted-foreground">
          {text.fieldsHelp.before}
          <Link href={appHref("contacts")} className={textLinkClass}>
            {text.fieldsHelp.link}
          </Link>
          {text.fieldsHelp.after}
        </p>
        <p
          aria-live="polite"
          className="text-[12.5px] text-ink-tertiary tabular-nums"
        >
          {text.matched(matchedCount(targets), columns.length)}
        </p>
      </div>
    </div>
  );
}
