import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders safe GitHub-flavoured Markdown structure", () => {
    const { container } = render(
      <Markdown
        source={`## Release notes

- [x] Contract complete
- [ ] Mobile review

| Area | State |
| --- | --- |
| App | Ready |

> Keep the rollback image.

Use \`stable\`.

[Reference](https://example.com/docs)

<script>alert("no")</script>`}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Release notes" }),
    ).toBeVisible();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByText("Keep the rollback image.")).toBeVisible();
    expect(screen.getByText("stable")).toBeVisible();
    expect(screen.getByRole("link", { name: "Reference" })).toHaveAttribute(
      "rel",
      "noreferrer",
    );
    expect(container.querySelector("script")).toBeNull();
  });
});
