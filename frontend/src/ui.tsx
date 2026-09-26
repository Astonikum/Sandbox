import type { ComponentProps, ReactNode } from "react";
import {
  Button as AriaButton,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
} from "react-aria-components";

type ButtonProps = Omit<ComponentProps<typeof AriaButton>, "onPress" | "isDisabled"> & {
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
};

export function Button({ disabled, onClick, ...props }: ButtonProps) {
  return <AriaButton {...props} isDisabled={disabled} {...(onClick ? { onPress: onClick } : {})} />;
}

export type SelectOption = { value: string; label: ReactNode; text: string };

export function SelectControl({ value, options, disabled, label, title, className, onChange }: {
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  label: string;
  title?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  const key = (value: string) => value || "__empty__";
  return <AriaSelect className={`select-control ${className || ""}`} aria-label={label} selectedKey={key(value)} isDisabled={disabled} onSelectionChange={selected => onChange(selected === "__empty__" ? "" : String(selected))}>
    <Button slot="trigger" className="select-trigger" aria-label={label} title={title}>
      <SelectValue />
      <svg className="select-chevron" aria-hidden="true" viewBox="0 0 12 12">
        <path d="m3.1 4.6 2.9 2.8 2.9-2.8" />
      </svg>
    </Button>
    <Popover className="select-popover">
      <ListBox className="select-listbox" aria-label={label}>
        {options.map(option => <ListBoxItem className="select-option" key={option.value} id={key(option.value)} textValue={option.text}>{option.label}</ListBoxItem>)}
      </ListBox>
    </Popover>
  </AriaSelect>;
}
