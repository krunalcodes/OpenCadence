"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import { Input } from "@workspace/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { Plus, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { copy } from "@/components/filter-builder/copy";
import {
  conditionForField,
  countConditions,
  customFieldId,
  dateFields,
  emptyCondition,
  fieldIdOf,
  findCustomField,
  isFilterDays,
  isFilterGroup,
  isTextCondition,
  maxFilterConditions,
  maxFilterDays,
  operatorsFor,
  textFields,
  valueKindOf,
  withOperator,
} from "@/components/filter-builder/filter";
import type {
  FilterCondition,
  FilterField,
  FilterGroup,
  FilterMatch,
  FilterOption,
} from "@/components/filter-builder/types";
import { DatePicker } from "@/components/pickers/date-picker";
import {
  inputClass,
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";

type PickerOption = { value: string; label: string };
type PickerGroup = { value: string; items: PickerOption[] };

type RowKey = { id: string; children: string[] | null };

const matches: FilterMatch[] = ["all", "any"];
const pickerClass = "h-8 bg-card text-[13px] shadow-xs";
const textInputClass = cn(inputClass, "md:text-[13px]");

let keySequence = 0;

function nextKey() {
  keySequence += 1;
  return `filter-row-${keySequence}`;
}

function buildKeys(group: FilterGroup): RowKey[] {
  return group.conditions.map((node) => ({
    id: nextKey(),
    children: isFilterGroup(node) ? node.conditions.map(nextKey) : null,
  }));
}

function keysFit(group: FilterGroup, keys: RowKey[]) {
  return (
    group.conditions.length === keys.length &&
    group.conditions.every((node, index) => {
      const children = keys[index]?.children ?? null;
      return isFilterGroup(node)
        ? children !== null && children.length === node.conditions.length
        : children === null;
    })
  );
}

function sameOption(item: PickerOption, value: PickerOption) {
  return item.value === value.value;
}

function toOptions(items: FilterOption[]): PickerOption[] {
  return items.map((item) => ({ value: item.id, label: item.name }));
}

type PickerProps = {
  label: string;
  placeholder: string;
  empty: string;
  options?: PickerOption[];
  groups?: PickerGroup[];
  value: PickerOption | null;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  onChange: (value: string | null) => void;
};

function Picker({
  label,
  placeholder,
  empty,
  options,
  groups,
  value,
  invalid,
  describedBy,
  className,
  onChange,
}: PickerProps) {
  return (
    <Combobox
      items={groups ?? options ?? []}
      value={value}
      isItemEqualToValue={sameOption}
      onValueChange={(next: PickerOption | null) =>
        onChange(next?.value ?? null)
      }
    >
      <ComboboxInput
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        className={cn(pickerClass, className)}
      />
      <ComboboxContent>
        <ComboboxEmpty className="px-3 text-[13px]">{empty}</ComboboxEmpty>
        {groups ? (
          <ComboboxList>
            {(group: PickerGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: PickerOption) => (
                    <ComboboxItem
                      key={item.value}
                      value={item}
                      className="text-[13px]"
                    >
                      <span className="truncate">{item.label}</span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        ) : (
          <ComboboxList>
            {(item: PickerOption) => (
              <ComboboxItem
                key={item.value}
                value={item}
                className="text-[13px]"
              >
                <span className="truncate">{item.label}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        )}
      </ComboboxContent>
    </Combobox>
  );
}

type MatchControlProps = {
  label: string;
  value: FilterMatch;
  onChange: (match: FilterMatch) => void;
};

function MatchControl({ label, value, onChange }: MatchControlProps) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const match = matches.find((item) => item === next[0]);
        if (match) {
          onChange(match);
        }
      }}
      className={segmentedGroupClass}
    >
      {matches.map((match) => (
        <ToggleGroupItem
          key={match}
          value={match}
          className={segmentedItemClass}
        >
          {copy.matchOptions[match]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type NumberValueProps = {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
};

function NumberValue({ label, value, onChange }: NumberValueProps) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      placeholder={copy.numberPlaceholder}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = next.trim() === "" ? Number.NaN : Number(next);
        onChange(Number.isFinite(parsed) ? parsed : undefined);
      }}
      className={cn(textInputClass, "tabular-nums")}
    />
  );
}

type ConditionRowProps = {
  condition: FilterCondition;
  row: number;
  fields: FilterField[];
  fieldGroups: PickerGroup[];
  listOptions: PickerOption[];
  tagOptions: PickerOption[];
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
};

function ConditionRow({
  condition,
  row,
  fields,
  fieldGroups,
  listOptions,
  tagOptions,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const problemId = useId();
  const fieldId = fieldIdOf(condition);
  const known = fieldGroups
    .flatMap((group) => group.items)
    .find((item) => item.value === fieldId);
  const fieldMissing = condition.field === "custom" && !known;
  const fieldOption =
    known ??
    (condition.field === "custom"
      ? { value: fieldId, label: condition.key }
      : null);
  const operators = operatorsFor(condition, fields).map((op) => ({
    value: op,
    label: copy.operators[op],
  }));
  const operator =
    operators.find((item) => item.value === condition.op) ?? null;
  const kind = valueKindOf(condition, fields);

  let problem: string | null = fieldMissing ? copy.problems.field : null;
  let value: React.ReactNode = null;

  if (condition.field === "list") {
    const selected =
      listOptions.find((item) => item.value === condition.listId) ?? null;
    const missing = condition.listId !== "" && !selected;
    problem = missing ? copy.problems.list : null;
    value = (
      <Picker
        label={copy.listLabel(row)}
        placeholder={copy.listPlaceholder}
        empty={listOptions.length === 0 ? copy.noLists : copy.listEmpty}
        options={listOptions}
        value={selected}
        invalid={missing}
        describedBy={missing ? problemId : undefined}
        className="w-full"
        onChange={(next) => onChange({ ...condition, listId: next ?? "" })}
      />
    );
  } else if (condition.field === "tag") {
    const selected =
      tagOptions.find((item) => item.value === condition.tagId) ?? null;
    const missing = condition.tagId !== "" && !selected;
    problem = missing ? copy.problems.tag : null;
    value = (
      <Picker
        label={copy.tagLabel(row)}
        placeholder={copy.tagPlaceholder}
        empty={tagOptions.length === 0 ? copy.noTags : copy.tagEmpty}
        options={tagOptions}
        value={selected}
        invalid={missing}
        describedBy={missing ? problemId : undefined}
        className="w-full"
        onChange={(next) => onChange({ ...condition, tagId: next ?? "" })}
      />
    );
  } else if (condition.field === "custom") {
    const current = condition.value;
    if (kind === "number") {
      value = (
        <NumberValue
          key={`${fieldId}:number`}
          label={copy.valueLabel(row)}
          value={typeof current === "number" ? current : undefined}
          onChange={(next) => {
            const { value: _dropped, ...rest } = condition;
            onChange(next === undefined ? rest : { ...rest, value: next });
          }}
        />
      );
    } else if (kind === "date") {
      value = (
        <DatePicker
          label={copy.dateLabel(row)}
          value={
            typeof current === "string" && current !== ""
              ? current.slice(0, 10)
              : null
          }
          clearable
          captionLayout="dropdown"
          className="w-full"
          onChange={(next) => onChange({ ...condition, value: next ?? "" })}
        />
      );
    } else if (kind === "option") {
      const options = (
        findCustomField(fields, condition.key)?.options ?? []
      ).map((option) => ({ value: option, label: option }));
      value = (
        <Picker
          label={copy.valueLabel(row)}
          placeholder={copy.optionPlaceholder}
          empty={copy.optionEmpty}
          options={options}
          value={options.find((item) => item.value === current) ?? null}
          className="w-full"
          onChange={(next) => onChange({ ...condition, value: next ?? "" })}
        />
      );
    } else if (kind === "text") {
      value = (
        <Input
          type="text"
          autoComplete="off"
          aria-label={copy.valueLabel(row)}
          placeholder={copy.textPlaceholder}
          value={typeof current === "string" ? current : ""}
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value })
          }
          className={textInputClass}
        />
      );
    }
  } else if (condition.field === "suppressed") {
    value = null;
  } else if (
    condition.op === "in_last_days" ||
    condition.op === "not_in_last_days"
  ) {
    const days = condition.value;
    const invalid = days !== 0 && !isFilterDays(days);
    problem = invalid ? copy.problems.days(maxFilterDays) : null;
    value = (
      <InputGroup className="h-8 w-full bg-card shadow-xs">
        <InputGroupInput
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={copy.daysLabel(row)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? problemId : undefined}
          value={days === 0 ? "" : String(days)}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 5);
            onChange({
              ...condition,
              value: digits === "" ? 0 : Number(digits),
            });
          }}
          className="text-[13px] tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText className="text-[13px]">
            {copy.daysSuffix}
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    );
  } else if (condition.op === "before" || condition.op === "after") {
    value = (
      <DatePicker
        label={copy.dateLabel(row)}
        value={condition.value === "" ? null : condition.value.slice(0, 10)}
        clearable
        captionLayout="dropdown"
        className="w-full"
        onChange={(next) => onChange({ ...condition, value: next ?? "" })}
      />
    );
  } else if (kind === "text" && isTextCondition(condition)) {
    value = (
      <Input
        type="text"
        autoComplete="off"
        spellCheck={false}
        aria-label={copy.valueLabel(row)}
        placeholder={copy.textPlaceholder}
        value={condition.value ?? ""}
        onChange={(event) =>
          onChange({ ...condition, value: event.target.value })
        }
        className={textInputClass}
      />
    );
  }

  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Picker
          label={copy.fieldLabel(row)}
          placeholder={copy.fieldPlaceholder}
          empty={copy.fieldEmpty}
          groups={fieldGroups}
          value={fieldOption}
          invalid={fieldMissing}
          describedBy={fieldMissing ? problemId : undefined}
          className="w-full sm:w-48"
          onChange={(next) => {
            if (next && next !== fieldId) {
              onChange(conditionForField(next, fields));
            }
          }}
        />
        <Picker
          label={copy.operatorLabel(row)}
          placeholder={copy.operatorPlaceholder}
          empty={copy.operatorEmpty}
          options={operators}
          value={operator}
          className="w-full sm:w-48"
          onChange={(next) => {
            if (next && next !== condition.op) {
              onChange(withOperator(condition, next, fields));
            }
          }}
        />
        <div className="min-w-0 flex-1 basis-40">{value}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copy.removeCondition(row)}
          onClick={onRemove}
          className={cn(
            "shrink-0 text-muted-foreground hover:bg-accent",
            buttonFocusRing,
          )}
        >
          <X aria-hidden strokeWidth={1.6} />
        </Button>
      </div>
      {problem ? (
        <p id={problemId} className="text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

export type FilterBuilderProps = {
  value: FilterGroup;
  onChange: (value: FilterGroup) => void;
  fields: FilterField[];
  lists: FilterOption[];
  tags: FilterOption[];
  errors?: string[];
  disabled?: boolean;
};

export function FilterBuilder({
  value,
  onChange,
  fields,
  lists,
  tags,
  errors,
  disabled = false,
}: FilterBuilderProps) {
  const limitId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const [storedKeys, setStoredKeys] = useState(() => buildKeys(value));

  let keys = storedKeys;
  if (!keysFit(value, storedKeys)) {
    keys = buildKeys(value);
    setStoredKeys(keys);
  }

  const fieldGroups = useMemo<PickerGroup[]>(() => {
    const groups: PickerGroup[] = [
      {
        value: copy.fieldGroups.contact,
        items: textFields.map((field) => ({
          value: field,
          label: copy.builtInFields[field],
        })),
      },
    ];
    if (fields.length > 0) {
      groups.push({
        value: copy.fieldGroups.custom,
        items: fields.map((field) => ({
          value: customFieldId(field.key),
          label: field.label,
        })),
      });
    }
    groups.push(
      {
        value: copy.fieldGroups.activity,
        items: dateFields.map((field) => ({
          value: field,
          label: copy.builtInFields[field],
        })),
      },
      {
        value: copy.fieldGroups.membership,
        items: [
          { value: "list", label: copy.builtInFields.list },
          { value: "tag", label: copy.builtInFields.tag },
        ],
      },
      {
        value: copy.fieldGroups.deliverability,
        items: [{ value: "suppressed", label: copy.builtInFields.suppressed }],
      },
    );
    return groups;
  }, [fields]);
  const listOptions = useMemo(() => toOptions(lists), [lists]);
  const tagOptions = useMemo(() => toOptions(tags), [tags]);

  const total = countConditions(value);
  const full = total >= maxFilterConditions;

  function commit(conditions: FilterGroup["conditions"], nextKeys: RowKey[]) {
    setStoredKeys(nextKeys);
    onChange({ ...value, conditions });
  }

  function replaceAt(
    index: number,
    node: FilterCondition | FilterGroup,
    key?: RowKey,
  ) {
    commit(
      value.conditions.map((item, position) =>
        position === index ? node : item,
      ),
      key
        ? keys.map((item, position) => (position === index ? key : item))
        : keys,
    );
  }

  function removeAt(index: number) {
    commit(
      value.conditions.filter((_, position) => position !== index),
      keys.filter((_, position) => position !== index),
    );
    window.setTimeout(() => addRef.current?.focus(), 0);
  }

  function addCondition() {
    if (full) {
      return;
    }
    commit(
      [...value.conditions, emptyCondition()],
      [...keys, { id: nextKey(), children: null }],
    );
  }

  function addGroup() {
    if (full) {
      return;
    }
    commit(
      [...value.conditions, { match: "any", conditions: [emptyCondition()] }],
      [...keys, { id: nextKey(), children: [nextKey()] }],
    );
  }

  function addToGroup(index: number, group: FilterGroup, key: RowKey) {
    if (full) {
      return;
    }
    replaceAt(
      index,
      { ...group, conditions: [...group.conditions, emptyCondition()] },
      { id: key.id, children: [...(key.children ?? []), nextKey()] },
    );
  }

  function removeFromGroup(
    index: number,
    group: FilterGroup,
    key: RowKey,
    child: number,
  ) {
    if (group.conditions.length <= 1) {
      removeAt(index);
      return;
    }
    replaceAt(
      index,
      {
        ...group,
        conditions: group.conditions.filter(
          (_, position) => position !== child,
        ),
      },
      {
        id: key.id,
        children: (key.children ?? []).filter(
          (_, position) => position !== child,
        ),
      },
    );
  }

  let row = 0;
  let groupNumber = 0;

  return (
    <fieldset
      disabled={disabled}
      className="flex min-w-0 flex-col gap-3 text-[13px] disabled:opacity-60"
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <span aria-hidden="true">{copy.matchLead}</span>
        <MatchControl
          label={copy.matchLabel}
          value={value.match}
          onChange={(match) => onChange({ ...value, match })}
        />
        <span aria-hidden="true">{copy.matchTail}</span>
      </div>

      {value.conditions.length === 0 ? (
        <p className="text-ink-tertiary">{copy.noConditions}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2.5">
          {value.conditions.map((node, index) => {
            const key = keys[index];
            if (!key) {
              return null;
            }
            if (!isFilterGroup(node)) {
              row += 1;
              return (
                <ConditionRow
                  key={key.id}
                  condition={node}
                  row={row}
                  fields={fields}
                  fieldGroups={fieldGroups}
                  listOptions={listOptions}
                  tagOptions={tagOptions}
                  onChange={(next) => replaceAt(index, next)}
                  onRemove={() => removeAt(index)}
                />
              );
            }
            groupNumber += 1;
            const number = groupNumber;
            return (
              <li
                key={key.id}
                className="ml-1 flex min-w-0 flex-col gap-2.5 border-l border-border py-0.5 pl-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <MatchControl
                    label={copy.groupMatchLabel(number)}
                    value={node.match}
                    onChange={(match) => replaceAt(index, { ...node, match })}
                  />
                  <span aria-hidden="true">{copy.groupTail}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copy.removeGroup(number)}
                    onClick={() => removeAt(index)}
                    className={cn(
                      "ml-auto shrink-0 text-muted-foreground hover:bg-accent",
                      buttonFocusRing,
                    )}
                  >
                    <X aria-hidden strokeWidth={1.6} />
                  </Button>
                </div>
                <ul
                  aria-label={copy.groupLabel(number)}
                  className="flex min-w-0 flex-col gap-2.5"
                >
                  {node.conditions.map((child, childIndex) => {
                    const childKey = key.children?.[childIndex];
                    if (!childKey || isFilterGroup(child)) {
                      return null;
                    }
                    row += 1;
                    return (
                      <ConditionRow
                        key={childKey}
                        condition={child}
                        row={row}
                        fields={fields}
                        fieldGroups={fieldGroups}
                        listOptions={listOptions}
                        tagOptions={tagOptions}
                        onChange={(next) =>
                          replaceAt(index, {
                            ...node,
                            conditions: node.conditions.map((item, position) =>
                              position === childIndex ? next : item,
                            ),
                          })
                        }
                        onRemove={() =>
                          removeFromGroup(index, node, key, childIndex)
                        }
                      />
                    );
                  })}
                </ul>
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={full}
                    aria-label={copy.addConditionToGroup(number)}
                    aria-describedby={full ? limitId : undefined}
                    onClick={() => addToGroup(index, node, key)}
                    className={cn(
                      "-ml-2 px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground",
                      buttonFocusRing,
                    )}
                  >
                    <Plus aria-hidden strokeWidth={1.8} />
                    {copy.addCondition}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          disabled={full}
          aria-describedby={full ? limitId : undefined}
          onClick={addCondition}
          className={secondaryButtonClass}
        >
          <Plus aria-hidden strokeWidth={1.8} />
          {copy.addCondition}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={full}
          aria-describedby={full ? limitId : undefined}
          onClick={addGroup}
          className={secondaryButtonClass}
        >
          <Plus aria-hidden strokeWidth={1.8} />
          {copy.addGroup}
        </Button>
      </div>

      {full ? (
        <p id={limitId} role="status" className="text-muted-foreground">
          {copy.limit(maxFilterConditions)}
        </p>
      ) : null}

      {errors && errors.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1 text-danger">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
