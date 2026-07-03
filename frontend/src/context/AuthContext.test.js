import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { api, clearToken } from "@/lib/api";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: { register: jest.fn(), login: jest.fn(), me: jest.fn() },
  };
});

const fakeUser = { id: "u1", username: "aya", display_name: "Aya K.", avatar: "AK", created_at: new Date().toISOString() };

beforeEach(() => {
  clearToken();
  api.login.mockResolvedValue({ access_token: "t1", user: fakeUser });
  api.register.mockResolvedValue({ access_token: "t2", user: fakeUser });
  api.me.mockResolvedValue(fakeUser);
});

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

test("starts logged out when there is no stored token", async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.user).toBeNull();
  expect(api.me).not.toHaveBeenCalled();
});

test("login sets the current user", async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.login("aya", "secret");
  });

  expect(result.current.user).toEqual(fakeUser);
});

test("logout clears the current user", async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.login("aya", "secret");
  });
  act(() => {
    result.current.logout();
  });

  expect(result.current.user).toBeNull();
});
