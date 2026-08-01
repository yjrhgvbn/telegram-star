import { cva, type VariantProps } from "class-variance-authority";

/**
 * Shared state treatment for selectable rows. Navigation rows use one quiet
 * highlight surface, while choice rows use a bordered secondary surface so the
 * two interaction models remain consistent without becoming indistinguishable.
 */
const selectableItemVariants = cva(
  "selectable-item border outline-none transition-[background-color,border-color,box-shadow,color] duration-150 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ring)_42%,transparent)] [&:has(>button:first-of-type:focus-visible)]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ring)_42%,transparent)]",
  {
    variants: {
      kind: {
        current: "",
        choice: "",
      },
      selected: {
        true: "",
        false: "",
      },
      surface: {
        responsive:
          "border-border bg-card shadow-sm lg:border-transparent lg:bg-transparent lg:shadow-none",
        flat: "border-transparent bg-transparent shadow-none",
      },
    },
    compoundVariants: [
      {
        kind: "current",
        selected: false,
        class:
          "text-muted-foreground hover:bg-muted/72 hover:text-foreground",
      },
      {
        kind: "current",
        selected: true,
        class:
          "border-transparent bg-accent text-foreground shadow-none hover:border-transparent hover:bg-accent lg:border-transparent lg:bg-accent lg:shadow-none [&_[data-slot=selectable-item-icon]]:bg-card/55",
      },
      {
        kind: "choice",
        selected: false,
        class: "text-foreground hover:border-border hover:bg-muted/55",
      },
      {
        kind: "choice",
        selected: true,
        class:
          "border-primary/25 bg-secondary/70 text-foreground shadow-xs hover:border-primary/30 hover:bg-secondary",
      },
    ],
    defaultVariants: {
      kind: "current",
      selected: false,
      surface: "flat",
    },
  },
);

type SelectableItemVariants = VariantProps<typeof selectableItemVariants>;

export { selectableItemVariants };
export type { SelectableItemVariants };
