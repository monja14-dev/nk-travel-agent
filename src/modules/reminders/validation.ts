export type FieldErrors = Record<string, string>;
export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export interface ReminderInput {
  section: string;
  label: string;
  remarks?: string;
  checked: boolean;
}

export function validateReminderInput(input: ReminderInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.section.trim()) errors.section = "Section is required.";
  if (!input.label.trim()) errors.label = "Label is required.";
  return errors;
}
