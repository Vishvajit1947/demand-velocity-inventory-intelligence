import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App scaffold (MT-02)", () => {
  it("renders the dashboard title", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /Demand Velocity & Inventory Intelligence/i }),
    ).toBeInTheDocument();
  });
});
