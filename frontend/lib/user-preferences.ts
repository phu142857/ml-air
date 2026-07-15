const PREFS_KEY = "ml-air:user-preferences";

export type UserPreferences = {
  language: string;
  timezone: string;
  defaultTenant: string;
  defaultProject: string;
  density: "comfortable" | "compact";
  experimentalUi: boolean;
};

const DEFAULTS: UserPreferences = {
  language: "en",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  defaultTenant: "",
  defaultProject: "",
  density: "comfortable",
  experimentalUi: false,
};

export function loadUserPreferences(): UserPreferences {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UserPreferences>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveUserPreferences(partial: Partial<UserPreferences>): UserPreferences {
  const next = { ...loadUserPreferences(), ...partial };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mlair-user-preferences-updated"));
  }
  return next;
}
