import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

// App uses useBounds / useProducts internally (MT-31 hooks), so it needs a QueryClientProvider.
function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App scaffold (MT-02)", () => {
  it("renders the main app shell with the forecast result panel", () => {
    renderApp();
    // MT-32 replaced the placeholder title with the full dashboard shell.
    // The panels render their section headings — Forecast Result is always present.
    expect(screen.getByText("Forecast Result")).toBeInTheDocument();
  });
});
