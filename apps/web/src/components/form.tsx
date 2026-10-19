import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import type { ParseKeys, TOptions } from "i18next"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { TimeSelect } from "@/components/time-select"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * Maps schema issues to one translation key per invalid field, in the `{ fields }`
 * shape that TanStack Form validators return.
 */
export function fieldErrors<Name extends string>(
  result: { error?: { issues: { path: PropertyKey[] }[] } },
  messages: Record<Name, ParseKeys>
) {
  const fields: Partial<Record<Name, ParseKeys>> = {}
  for (const {
    path: [name],
  } of result.error?.issues ?? []) {
    if (typeof name === "string" && Object.hasOwn(messages, name)) {
      fields[name as Name] ??= messages[name as Name]
    }
  }
  return fields
}

const { fieldContext, formContext, useFieldContext } = createFormHookContexts()

type FieldProps = {
  label: string
  description?: string
  /** Values for the placeholders of the field's error message. */
  errorValues?: TOptions
}

/** Label and control, then the field's error message or else its description. */
function FormField({
  label,
  description,
  errorValues,
  children,
}: FieldProps & { children: ReactNode }) {
  const { t } = useTranslation()
  const field = useFieldContext()
  const error = field.state.meta.errors[0] as ParseKeys | undefined
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      {children}
      {error ? (
        <FieldError>{t(error, errorValues)}</FieldError>
      ) : (
        description && <FieldDescription>{description}</FieldDescription>
      )}
    </Field>
  )
}

/** Props that bind a text control to the current field. */
function useTextControl() {
  const field = useFieldContext<string>()
  return {
    id: field.name,
    name: field.name,
    value: field.state.value,
    onBlur: field.handleBlur,
    onChange: (event: { target: { value: string } }) =>
      field.handleChange(event.target.value),
    "aria-invalid": field.state.meta.errors.length > 0,
  }
}

function TextField({
  label,
  description,
  ...props
}: FieldProps & ComponentProps<"input">) {
  const control = useTextControl()
  return (
    <FormField label={label} description={description}>
      <Input {...control} {...props} />
    </FormField>
  )
}

function TextareaField({
  label,
  description,
  ...props
}: FieldProps & ComponentProps<"textarea">) {
  const control = useTextControl()
  return (
    <FormField label={label} description={description}>
      <Textarea rows={3} {...control} {...props} />
    </FormField>
  )
}

function NumberField({
  label,
  description,
  errorValues,
  className,
  ...props
}: FieldProps & ComponentProps<"input">) {
  const field = useFieldContext<number>()
  return (
    <FormField
      label={label}
      description={description}
      errorValues={errorValues}
    >
      <Input
        id={field.name}
        name={field.name}
        type="number"
        inputMode="numeric"
        step={1}
        // An empty input holds NaN, which the schema reports as missing.
        value={Number.isNaN(field.state.value) ? "" : field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.valueAsNumber)}
        aria-invalid={field.state.meta.errors.length > 0}
        className={cn("tabular-nums", className)}
        {...props}
      />
    </FormField>
  )
}

function TimeField({ label, options }: FieldProps & { options: string[] }) {
  const field = useFieldContext<string>()
  return (
    <FormField label={label}>
      <TimeSelect
        id={field.name}
        value={field.state.value}
        options={options}
        invalid={field.state.meta.errors.length > 0}
        onChange={field.handleChange}
      />
    </FormField>
  )
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, NumberField, TimeField },
  formComponents: {},
})
