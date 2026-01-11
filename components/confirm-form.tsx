"use client";

import type { FormHTMLAttributes, ReactNode } from "react";

type FormAction = (formData: FormData) => void | Promise<void>;

type ConfirmFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: FormAction;
  confirmMessage?: string;
  children: ReactNode;
};

export default function ConfirmForm({
  action,
  confirmMessage = "確定要刪除？",
  children,
  onSubmit,
  ...rest
}: ConfirmFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onSubmit?.(event);
      }}
      {...rest}
    >
      {children}
    </form>
  );
}
