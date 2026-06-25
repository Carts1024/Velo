import dynamic from "next/dynamic";

import type { PixelBlastProps } from "./PixelBlast";

export const PixelBlast = dynamic<PixelBlastProps>(() => import("./PixelBlast"), { ssr: false });

export type { PixelBlastProps };
