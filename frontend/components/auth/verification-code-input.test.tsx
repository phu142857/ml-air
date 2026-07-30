import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerificationCodeInput } from "@/components/auth/verification-code-input";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

function getOtpInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[data-input-otp="true"]');
  if (!input) throw new Error("OTP input not found");
  return input;
}

describe("VerificationCodeInput", () => {
  it("renders a single labeled group for numeric OTP cells", () => {
    render(
      <VerificationCodeInput
        length={6}
        mode="numeric"
        label="Verification code"
        value=""
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Verification code")).toBeTruthy();
    expect(getOtpInput().getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6);
  });

  it("renders eight cells for recovery codes", () => {
    render(
      <VerificationCodeInput
        length={8}
        mode="alphanumeric"
        label="Recovery code"
        value="AB7K"
        onChange={() => {}}
      />,
    );

    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(8);
    expect(document.querySelectorAll('[data-slot="input-otp-separator"]')).toHaveLength(1);
    expect(screen.getByText("Recovery code")).toBeTruthy();
    expect(getOtpInput().getAttribute("inputmode")).toBe("text");
  });

  it("shows one shared error message", () => {
    render(
      <VerificationCodeInput
        length={6}
        mode="numeric"
        value="123456"
        onChange={() => {}}
        error="Verification code is incorrect."
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Verification code is incorrect.");
    expect(getOtpInput().getAttribute("aria-invalid")).toBe("true");
  });

  it("disables input when disabled", () => {
    render(
      <VerificationCodeInput
        length={6}
        mode="numeric"
        value=""
        onChange={() => {}}
        disabled
      />,
    );

    expect(getOtpInput().disabled).toBe(true);
    expect(document.querySelector('[data-slot="verification-code-input"]')?.getAttribute("data-state")).toBe(
      "disabled",
    );
  });

  it("forwards paste through sanitize + filter for numeric OTP", () => {
    const onChange = vi.fn();
    render(
      <VerificationCodeInput length={6} mode="numeric" value="" onChange={onChange} />,
    );

    fireEvent.paste(getOtpInput(), {
      clipboardData: {
        getData: () => "12a34-56",
      },
    });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("123456");
  });

  it("forwards recovery paste with hyphen separator", () => {
    const onChange = vi.fn();
    render(
      <VerificationCodeInput
        length={8}
        mode="alphanumeric"
        label="Recovery code"
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.paste(getOtpInput(), {
      clipboardData: {
        getData: () => "abcd-1234",
      },
    });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("ABCD1234");
  });

  it("filters invalid characters from a partial numeric paste", () => {
    const onChange = vi.fn();
    render(
      <VerificationCodeInput length={6} mode="numeric" value="" onChange={onChange} />,
    );

    fireEvent.paste(getOtpInput(), {
      clipboardData: {
        getData: () => "12ab34",
      },
    });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("1234");
  });

  it("uses numeric inputMode for OTP", () => {
    render(
      <VerificationCodeInput length={6} mode="numeric" value="" onChange={() => {}} />,
    );
    expect(getOtpInput().getAttribute("inputmode")).toBe("numeric");
  });
});
