"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="light"
    position="bottom-right"
    toastOptions={{
      classNames: {
        toast: "!rounded-none !border !border-border !shadow-none !bg-card !text-foreground",
      },
    }}
    {...props}
  />
)

export { Toaster }
