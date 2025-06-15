import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const resize = React.useCallback(() => {
    const textarea = innerRef.current;
    if (textarea) {
      const { selectionStart, selectionEnd } = textarea;
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
      textarea.setSelectionRange(selectionStart, selectionEnd);
    }
  }, []);

  React.useEffect(() => {
    resize();
  }, [props.value, resize]);

  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={innerRef}
      onInput={(e) => {
        resize();
        if (props.onInput) props.onInput(e);
      }}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
