import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { ToastHost } from "./ToastHost";
import type { ApiError } from "../../lib/api";

// Build a fake ApiError with the shape from 05 §7
function makeError(message: string, field?: string): ApiError {
  // ApiError extends Error; we construct a plain object matching its shape
  const err = Object.create(Error.prototype) as ApiError;
  err.name = "ApiError";
  err.message = message;
  // @ts-expect-error — setting readonly for test purposes
  err.error = "validation_error";
  // @ts-expect-error
  err.field = field;
  // @ts-expect-error
  err.status = 422;
  return err;
}

const API_ERROR_MSG =
  "start_date 2016-12-01 is outside the selectable range [2014-01-28, 2016-04-25].";

describe("ToastHost (05 §7 / 06 §5 Error)", () => {
  it("shows the API error message in a toast on error status", async () => {
    const apiError = makeError(API_ERROR_MSG, "start_date");

    render(
      <ToastProvider>
        <ToastHost error={apiError} status="error" />
      </ToastProvider>,
    );

    // The toast viewport renders role=alert; the message text appears verbatim.
    expect(await screen.findByText(API_ERROR_MSG)).toBeInTheDocument();
  });

  it("shows nothing when status is idle", () => {
    render(
      <ToastProvider>
        <ToastHost error={null} status="idle" />
      </ToastProvider>,
    );

    expect(screen.queryByText(API_ERROR_MSG)).toBeNull();
  });

  it("shows nothing when error is null even if status is error", () => {
    render(
      <ToastProvider>
        <ToastHost error={null} status="error" />
      </ToastProvider>,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
