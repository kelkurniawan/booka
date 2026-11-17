import type { Decorator } from "@storybook/nextjs-vite";

import "./marketing.css";

/** Dekorator story: token Coral. Font General Sans tidak dimuat di Storybook, jadi jatuh ke sistem. */
export const withMarketing: Decorator = (Story) => (
  <div className="marketing">
    <Story />
  </div>
);
