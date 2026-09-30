import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { fetchPrivateImageUrl, isPrivateImageReference } from "../lib/privateImages";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null };

export function PrivateImage({ src, ...props }: Props) {
  const [resolved, setResolved] = useState<{ reference: string; url: string } | null>(null);
  const isPrivate = !!src && isPrivateImageReference(src);

  useEffect(() => {
    if (!src || !isPrivate) return;
    const controller = new AbortController();
    setResolved(null);
    fetchPrivateImageUrl(src, controller.signal).then((url) => {
      if (!controller.signal.aborted) {
        setResolved({ reference: src, url });
      }
    }).catch(() => setResolved(null));
    return () => {
      controller.abort();
    };
  }, [src, isPrivate]);

  return <img {...props} src={isPrivate ? (resolved?.reference === src ? resolved.url : undefined) : src || undefined} />;
}
