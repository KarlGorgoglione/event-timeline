// Renders the field schema: one row per theme key, option or hook, each with
// its key path, hint, "modified" marker and reset.

import { useId, useState } from 'react';
import { useDemo, type DemoRuntime } from '../../app/context';
import { getPath } from '../../app/paths';
import { baseHooks } from '../../app/state';
import type { Field, FieldSection as Section } from '../../schema/fields';
import {
  ColorInput,
  DashInput,
  FieldRow,
  FontInput,
  NumberInput,
  Segmented,
  Select,
  TextInput,
  Toggle,
} from '../controls';
import { Reset } from '../icons';

function read(field: Field, rt: DemoRuntime): unknown {
  if (field.target === 'theme') return getPath(rt.theme, field.path);
  if (field.target === 'options') return getPath(rt.options, field.path);
  return rt.hooks[field.path];
}

function isModified(field: Field, rt: DemoRuntime): boolean {
  const { themeEdits, optionEdits, hookEdits } = rt.state;
  if (field.target === 'theme') return field.path in themeEdits;
  if (field.target === 'options') return field.path in optionEdits;
  return field.path in hookEdits;
}

function write(field: Field, rt: DemoRuntime, value: unknown): void {
  if (field.target === 'theme')
    rt.dispatch({ type: 'theme', path: field.path, value });
  else if (field.target === 'options')
    rt.dispatch({ type: 'option', path: field.path, value });
  else rt.dispatch({ type: 'hook', key: field.path, value: value as never });
}

function reset(field: Field, rt: DemoRuntime): void {
  if (field.target === 'theme')
    rt.dispatch({ type: 'resetTheme', path: field.path });
  else if (field.target === 'options')
    rt.dispatch({ type: 'resetOption', path: field.path });
  else
    rt.dispatch({
      type: 'hook',
      key: field.path,
      value: baseHooks(rt.scenario)[field.path],
    });
}

export function FieldControl({ field }: { field: Field }) {
  const rt = useDemo();
  const id = useId();
  const value = read(field, rt);
  const onChange = (v: unknown) => write(field, rt, v);
  const c = field.control;
  const disabled =
    field.target === 'options' &&
    field.enabled !== undefined &&
    !field.enabled(rt.options);

  let input;
  switch (c.kind) {
    case 'color':
      input = (
        <ColorInput
          id={id}
          label={field.label}
          value={value as string}
          onChange={onChange}
        />
      );
      break;
    case 'number':
      input = (
        <NumberInput
          id={id}
          label={field.label}
          value={value as number}
          onChange={onChange}
          min={c.min}
          max={c.max}
          step={c.step}
          unit={c.unit}
        />
      );
      break;
    case 'toggle':
      input = (
        <Toggle
          id={id}
          label={field.label}
          value={value as boolean}
          onChange={onChange}
        />
      );
      break;
    case 'select':
      input = (
        <Select
          id={id}
          label={field.label}
          value={value as string}
          onChange={onChange}
          options={c.options}
        />
      );
      break;
    case 'segmented':
      input = (
        <Segmented
          label={field.label}
          size="sm"
          value={value as string}
          onChange={onChange}
          options={c.options}
        />
      );
      break;
    case 'dash':
      input = (
        <DashInput
          label={field.label}
          value={value as number[]}
          onChange={onChange}
        />
      );
      break;
    case 'font':
      input = (
        <FontInput
          label={field.label}
          value={value as string}
          onChange={onChange}
        />
      );
      break;
    case 'text':
      input = (
        <TextInput
          id={id}
          label={field.label}
          value={value as string}
          onChange={onChange}
          placeholder={c.placeholder}
        />
      );
      break;
  }

  return (
    <FieldRow
      label={field.label}
      hint={field.hint}
      path={field.target === 'hooks' ? undefined : field.path}
      modified={isModified(field, rt)}
      disabled={disabled}
      onReset={() => reset(field, rt)}
      htmlFor={
        c.kind === 'color' ||
        c.kind === 'number' ||
        c.kind === 'toggle' ||
        c.kind === 'select' ||
        c.kind === 'text'
          ? id
          : undefined
      }
    >
      {input}
    </FieldRow>
  );
}

/** A collapsible group of fields with a count of its edits. */
export function FieldSection({
  section,
  fields = section.fields,
  defaultOpen = false,
  forceOpen = false,
}: {
  section: Section;
  fields?: readonly Field[];
  defaultOpen?: boolean;
  forceOpen?: boolean;
}) {
  const rt = useDemo();
  const [open, setOpen] = useState(defaultOpen);
  const modified = fields.filter((f) => isModified(f, rt));
  return (
    <details
      className="section"
      open={forceOpen || open}
      onToggle={(e) => {
        if (!forceOpen) setOpen(e.currentTarget.open);
      }}
    >
      <summary className="section__summary">
        <span className="section__title">{section.title}</span>
        <code className="section__code">{section.code}</code>
        {modified.length > 0 && (
          <span className="section__count" title={`${modified.length} edited`}>
            {modified.length}
          </span>
        )}
      </summary>
      <div className="fields">
        {fields.map((f) => (
          <FieldControl key={`${f.target}:${f.path}`} field={f} />
        ))}
      </div>
      {modified.length > 0 && (
        <button
          type="button"
          className="btn btn--ghost btn--sm section__reset"
          onClick={() => modified.forEach((f) => reset(f, rt))}
        >
          <Reset size={13} /> Reset {section.title.toLowerCase()}
        </button>
      )}
    </details>
  );
}
