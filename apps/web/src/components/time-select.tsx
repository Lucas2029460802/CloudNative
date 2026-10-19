import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** A select over fixed `HH:mm` options; an empty string means "not chosen yet". */
export function TimeSelect({
  id,
  value,
  options,
  invalid,
  onChange,
}: {
  id: string
  value: string
  options: string[]
  invalid: boolean
  onChange: (value: string) => void
}) {
  const items = [
    { label: "--:--", value: null },
    ...options.map((time) => ({ label: time, value: time })),
  ]
  return (
    <Select
      items={items}
      value={value || null}
      onValueChange={(next) => onChange(next ?? "")}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        className="w-full tabular-nums"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((time) => (
            <SelectItem key={time} value={time} className="tabular-nums">
              {time}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
