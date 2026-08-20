export type AppearanceFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<
    Record<"accent" | "background_color" | "background_image_path" | "faqs", string>
  >;
};

export const INITIAL_APPEARANCE_STATE: AppearanceFormState = { status: "idle" };
