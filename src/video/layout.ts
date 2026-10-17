import { createContext, useContext } from "react";

/** True when rendering a vertical (TikTok / Shorts / Reels) video; components switch layout. */
export const VerticalContext = createContext(false);
export const useVertical = () => useContext(VerticalContext);
