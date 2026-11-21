"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  resolveStyle,
  type DesignStyle,
  type StylePreference,
} from "@/lib/appearance";
import { writeStyleCookie } from "@/lib/client/appearance";
import { watchPageCover } from "@/lib/page-cover";

const StyleContext = createContext<{
  preference: StylePreference;
  defaultStyle: DesignStyle;
  projectTheme: string | null;
  setPreference: (value: StylePreference) => void;
} | null>(null);

export function StyleProvider({
  children,
  initialPreference,
  defaultStyle,
  projectTheme,
}: {
  children: ReactNode;
  initialPreference: StylePreference;
  defaultStyle: DesignStyle;
  projectTheme: string | null;
}) {
  const [preference, setState] = useState(initialPreference);
  const style = projectTheme ? null : resolveStyle(preference, defaultStyle);
  useEffect(() => {
    if (style !== "glass") return;
    return watchPageCover(document, (url) => {
      if (url) {
        document.documentElement.style.setProperty(
          "--page-cover",
          `url(${JSON.stringify(url)})`,
        );
        document.documentElement.dataset.pageCover = "loaded";
      } else {
        document.documentElement.style.removeProperty("--page-cover");
        delete document.documentElement.dataset.pageCover;
      }
    });
  }, [style]);
  const setPreference = useCallback(
    (value: StylePreference) => {
      if (projectTheme) return;
      document.documentElement.dataset.style = resolveStyle(
        value,
        defaultStyle,
      );
      writeStyleCookie(value);
      setState(value);
    },
    [defaultStyle, projectTheme],
  );
  return (
    <StyleContext.Provider
      value={{ preference, defaultStyle, projectTheme, setPreference }}
    >
      {children}
    </StyleContext.Provider>
  );
}

export function useStyle() {
  const value = useContext(StyleContext);
  if (!value) throw new Error("Style controls require StyleProvider.");
  return value;
}
